from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure
from werkzeug.security import generate_password_hash
from datetime import datetime, timezone
from models import User
import logging
import time
from functools import wraps

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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
                        logger.warning(
                            f"Attempt {attempt + 1} failed: {str(e)}."
                        )
                        time.sleep(delay)
                    else:
                        logger.error(
                            f"All {retries} attempts failed: {str(e)}")
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
                self.client = MongoClient(
                    self.mongo_uri, serverSelectionTimeoutMS=5000)
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
            logger.warning(
                "Lost connection to MongoDB, attempting to reconnect...")
            self.connect()

    @with_mongodb_retry(retries=3, delay=2)
    async def create_user(
                        self, email, username, password, team_number,
                        role="user"):
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
                "team_number": int(team_number),
                "password_hash": generate_password_hash(password),
                "role": role,
                "created_at": datetime.now(timezone.utc),
                "last_login": None,
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

    def __del__(self):
        """Cleanup MongoDB connection"""
        if self.client:
            self.client.close()
