from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure
from werkzeug.security import generate_password_hash
from datetime import datetime, timezone
from app.models import User
import logging
import time
from functools import wraps
from gridfs import GridFS
from flask_login import current_user

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def with_mongodb_retry(retries=3, delay=2):
    def decorator(f):
        @wraps(f)
        async def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(retries):
                try:
                    return await f(*args, **kwargs)
                except (ServerSelectionTimeoutError, ConnectionFailure) as e:
                    last_error = e
                    if attempt < retries - 1:  # don't sleep on last attempt
                        logger.warning(f"Attempt {attempt + 1} failed: {str(e)}.")
                        time.sleep(delay)
                    else:
                        logger.error(f"All {retries} attempts failed: {str(e)}")
            raise last_error

        return wrapper

    return decorator


async def check_password_strength(password):
    """
    Check if password meets minimum requirements:
    - At least 8 characters
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    return True, "Password meets all requirements"


class UserManager:
    def __init__(self, mongo_uri):
        self.mongo_uri = mongo_uri
        self.client = None
        self.db = None
        self.connect()

    def connect(self):
        """Establish connection to MongoDB with basic error handling"""
        try:
            if self.client is None:
                self.client = MongoClient(self.mongo_uri, serverSelectionTimeoutMS=5000)
                # Test the connection
                self.client.server_info()
                self.db = self.client.get_default_database()
                logger.info("Successfully connected to MongoDB")

                # Ensure users collection exists
                if "users" not in self.db.list_collection_names():
                    self.db.create_collection("users")
                    logger.info("Created users collection")
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {str(e)}")
            raise

    def ensure_connected(self):
        """Ensure we have a valid connection, reconnect if necessary"""
        try:
            if self.client is None:
                self.connect()
            else:
                # Test if connection is still alive
                self.client.server_info()
        except Exception:
            logger.warning("Lost connection to MongoDB, attempting to reconnect...")
            self.connect()

    @with_mongodb_retry(retries=3, delay=2)
    async def create_user(
        self,
        email,
        username,
        password,
        team_number=None
    ):
        """Create a new user with retry mechanism"""
        self.ensure_connected()
        try:
            # Check for existing email
            if self.db.users.find_one({"email": email}):
                return False, "Email already registered"

            # Check for existing username
            if self.db.users.find_one({"username": username}):
                return False, "Username already taken"

            # Check password strength
            password_valid, message = await check_password_strength(password)
            if not password_valid:
                return False, message

            # Create user document
            user_data = {
                "email": email,
                "username": username,
                "teamNumber": team_number,
                "password_hash": generate_password_hash(password),
                "created_at": datetime.now(timezone.utc),
                "last_login": None,
                "description": "",
                "profile_picture_id": None,
            }

            self.db.users.insert_one(user_data)
            logger.info(f"Created new user: {username}")
            return True, "User created successfully"

        except Exception as e:
            logger.error(f"Error creating user: {str(e)}")
            return False, f"Error creating user: {str(e)}"

    @with_mongodb_retry(retries=3, delay=2)
    async def authenticate_user(self, login, password):
        """Authenticate user with retry mechanism"""
        self.ensure_connected()
        try:
            if user_data := self.db.users.find_one(
                {"$or": [{"email": login}, {"username": login}]}
            ):
                user = User.create_from_db(user_data)
                if user and user.check_password(password):
                    # Update last login
                    self.db.users.update_one(
                        {"_id": user._id},
                        {"$set": {"last_login": datetime.now(timezone.utc)}},
                    )
                    logger.info(f"Successful login: {login}")
                    return True, user
            logger.warning(f"Failed login attempt: {login}")
            return False, None
        except Exception as e:
            logger.error(f"Authentication error: {str(e)}")
            return False, None

    def get_user_by_id(self, user_id):
        """Retrieve user by ID with retry mechanism"""
        self.ensure_connected()
        try:
            from bson.objectid import ObjectId

            user_data = self.db.users.find_one({"_id": ObjectId(user_id)})
            return User.create_from_db(user_data) if user_data else None
        except Exception as e:
            logger.error(f"Error loading user: {str(e)}")
            return None

    @with_mongodb_retry(retries=3, delay=2)
    async def update_user_profile(self, user_id, updates):
        """Update user profile information"""
        self.ensure_connected()
        try:
            from bson.objectid import ObjectId

            # Filter out None values and empty strings
            valid_updates = {k: v for k, v in updates.items() if v is not None and v != ""}

            # Check if username is being updated and is unique
            if 'username' in valid_updates:
                if existing_user := self.db.users.find_one(
                    {
                        "username": valid_updates['username'],
                        "_id": {"$ne": ObjectId(user_id)},
                    }
                ):
                    return False, "Username already taken"

            result = self.db.users.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": valid_updates}
            )

            if result.modified_count > 0:
                return True, "Profile updated successfully"
            return False, "No changes made"

        except Exception as e:
            logger.error(f"Error updating profile: {str(e)}")
            return False, f"Error updating profile: {str(e)}"

    def get_user_profile(self, username):
        """Get user profile by username"""
        self.ensure_connected()
        try:
            user_data = self.db.users.find_one({"username": username})
            return User.create_from_db(user_data) if user_data else None
        except Exception as e:
            logger.error(f"Error loading profile: {str(e)}")
            return None

    @with_mongodb_retry(retries=3, delay=2)
    async def update_profile_picture(self, user_id, file_id):
        """Update user's profile picture and clean up old one"""
        self.ensure_connected()
        try:
            from bson.objectid import ObjectId
            from gridfs import GridFS
            
            # Get the old profile picture ID first
            user_data = self.db.users.find_one({"_id": ObjectId(user_id)})
            old_picture_id = user_data.get('profile_picture_id') if user_data else None
            
            # Update the profile picture ID
            result = self.db.users.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"profile_picture_id": file_id}}
            )
            
            # If update was successful and there was an old picture, delete it
            if result.modified_count > 0 and old_picture_id:
                try:
                    fs = GridFS(self.db)
                    if fs.exists(ObjectId(old_picture_id)):
                        fs.delete(ObjectId(old_picture_id))
                        logger.info(f"Deleted old profile picture: {old_picture_id}")
                except Exception as e:
                    logger.error(f"Error deleting old profile picture: {str(e)}")
            
            return True, "Profile picture updated successfully"
            
        except Exception as e:
            logger.error(f"Error updating profile picture: {str(e)}")
            return False, f"Error updating profile picture: {str(e)}"

    def get_profile_picture(self, user_id):
        """Get user's profile picture ID"""
        self.ensure_connected()
        try:
            from bson.objectid import ObjectId
            user_data = self.db.users.find_one({"_id": ObjectId(user_id)})
            return user_data.get('profile_picture_id') if user_data else None
        except Exception as e:
            logger.error(f"Error getting profile picture: {str(e)}")
            return None

    @with_mongodb_retry(retries=3, delay=2)
    async def delete_user(self, user_id):
        """Delete a user account and all associated data"""
        self.ensure_connected()
        try:
            from bson.objectid import ObjectId

            # Get user data first
            user_data = self.db.users.find_one({"_id": ObjectId(user_id)})
            if not user_data:
                return False, "User not found"

            # Delete profile picture if exists
            if user_data.get('profile_picture_id'):
                try:
                    fs = GridFS(self.db)
                    fs.delete(ObjectId(user_data['profile_picture_id']))
                except Exception as e:
                    logger.error(f"Error deleting profile picture: {str(e)}")

            # Delete user document
            result = self.db.users.delete_one({"_id": ObjectId(user_id)})
            
            if result.deleted_count > 0:
                return True, "Account deleted successfully"
            return False, "Failed to delete account"

        except Exception as e:
            logger.error(f"Error deleting user: {str(e)}")
            return False, f"Error deleting account: {str(e)}"

    @with_mongodb_retry(retries=3, delay=2)
    async def update_user_settings(self, user_id, form_data, profile_picture=None):
        """Update user settings including profile picture"""
        self.ensure_connected()
        try:
            updates = {}
            
            # Handle username update if provided
            if new_username := form_data.get('username'):
                if new_username != current_user.username:
                    # Check if username is taken
                    if self.db.users.find_one({"username": new_username}):
                        return False
                    updates['username'] = new_username

            # Handle description update
            if description := form_data.get('description'):
                updates['description'] = description

            # Handle profile picture
            if profile_picture:
                from werkzeug.utils import secure_filename
                if profile_picture and allowed_file(profile_picture.filename):
                    fs = GridFS(self.db)
                    filename = secure_filename(profile_picture.filename)
                    file_id = fs.put(
                        profile_picture.stream.read(),
                        filename=filename,
                        content_type=profile_picture.content_type
                    )
                    updates['profile_picture_id'] = file_id

            if updates:
                success, message = await self.update_user_profile(user_id, updates)
                return success

            return True
        except Exception as e:
            logger.error(f"Error updating user settings: {str(e)}")
            return False

    def __del__(self):
        """Cleanup MongoDB connection"""
        if self.client:
            self.client.close()
