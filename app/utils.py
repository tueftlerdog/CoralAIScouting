import asyncio
import logging
import os
import time
from functools import wraps
from io import BytesIO
from urllib.parse import urljoin, urlparse

from bson import ObjectId
from dotenv import load_dotenv
from flask import flash, jsonify, render_template, request, send_file
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from gridfs import GridFS
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from werkzeug.utils import secure_filename

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# File handling constants
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

load_dotenv()

# ============ Database Utilities ============

def with_mongodb_retry(retries=3, delay=2):
    """Decorator for retrying MongoDB operations"""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            last_error = None
            for attempt in range(retries):
                try:
                    return f(*args, **kwargs)
                except (ServerSelectionTimeoutError, ConnectionFailure) as e:
                    last_error = e
                    if attempt < retries - 1:
                        logger.warning(f"Attempt {attempt + 1} failed: {str(e)}")
                        time.sleep(delay)
                    else:
                        logger.error(f"All {retries} attempts failed: {str(e)}")
            raise last_error
        return wrapper
    return decorator

class DatabaseManager:
    """Base class for database operations"""
    def __init__(self, mongo_uri: str):
        self.mongo_uri = mongo_uri
        self.client = None
        self.db = None
        self.connect()

    def connect(self):
        """Establish connection to MongoDB"""
        try:
            if self.client is None:
                self.client = MongoClient(self.mongo_uri, serverSelectionTimeoutMS=5000)
                self.client.server_info()
                self.db = self.client.get_default_database()
                logger.info("Successfully connected to MongoDB")
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {str(e)}")
            raise

    def ensure_connected(self):
        """Ensure database connection is active"""
        try:
            if self.client is None:
                self.connect()
            else:
                self.client.server_info()
        except Exception:
            logger.warning("Lost connection to MongoDB, attempting to reconnect...")
            self.connect()

    def __del__(self):
        """Cleanup MongoDB connection"""
        if self.client:
            self.client.close()

# ============ Route Utilities ============

def async_route(f):
    """Decorator to handle async routes"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        return asyncio.run(f(*args, **kwargs))
    return wrapper

def handle_route_errors(f):
    """Decorator to handle common route errors"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            logger.error(f"Route error: {str(e)}", exc_info=True)
            flash("An internal error has occurred.", "error")
            return render_template("500.html"), 500
    return wrapper

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=os.getenv("MONGO_URI"),
    default_limits=["5000 per day", "1000 per hour"],
    strategy="fixed-window-elastic-expiry"
)


# ============ File Handling Utilities ============

def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_file_to_gridfs(file, db, prefix: str = '') -> str:
    """Save file to GridFS and return file ID"""
    if file and allowed_file(file.filename):
        fs = GridFS(db)
        filename = secure_filename(f"{prefix}_{file.filename}" if prefix else file.filename)
        file_id = fs.put(
            file.stream.read(),
            filename=filename,
            content_type=file.content_type
        )
        return str(file_id)
    return None

def send_gridfs_file(file_id, db, default_path: str = None):
    """Send file from GridFS or return default file"""
    try:
        fs = GridFS(db)
        if isinstance(file_id, str):
            file_id = ObjectId(file_id)
        file_data = fs.get(file_id)
        return send_file(
            BytesIO(file_data.read()),
            mimetype=file_data.content_type,
            download_name=file_data.filename
        )
    except Exception as e:
        logger.error(f"Error retrieving file: {str(e)}")
        if default_path:
            return send_file(default_path)
        return error_response("An internal error has occurred.", 500)

# ============ Response Utilities ============

def success_response(message: str = "Success", data: dict = None, status_code: int = 200):
    """Standard success response"""
    response = {
        "success": True,
        "message": message
    }
    if data is not None:
        response["data"] = data
    return jsonify(response), status_code

def error_response(message: str = "Error", status_code: int = 400, log_message: str = None):
    """Standard error response"""
    if log_message:
        logger.error(log_message)
    return jsonify({
        "success": False,
        "message": message
    }), status_code

# ============ Security Utilities ============

def is_safe_url(target: str) -> bool:
    """Verify URL is safe for redirects"""
    ref_url = urlparse(request.host_url)
    test_url = urlparse(urljoin(request.host_url, target))
    return test_url.scheme in ('http', 'https') and ref_url.netloc == test_url.netloc

async def check_password_strength(password: str) -> tuple[bool, str]:
    """
    Check if password meets minimum requirements:
    - At least 8 characters
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    return True, "Password meets all requirements"

# ============ Coral Analysis Utilities ============

def send_gridfs_file_url(file_id, db, expiry_minutes=30):
    """Generate a temporary URL for a GridFS file"""
    try:
        from bson import ObjectId
        from gridfs import GridFS
        import uuid
        import time

        # Generate a random token
        token = str(uuid.uuid4())

        # Store the token with file ID and expiry time
        expiry = time.time() + (expiry_minutes * 60)
        db.temp_file_tokens.insert_one({
            "token": token,
            "file_id": ObjectId(file_id),
            "expires_at": expiry
        })

        return token
    except Exception as e:
        logger.error(f"Error generating file URL: {str(e)}")
        return None