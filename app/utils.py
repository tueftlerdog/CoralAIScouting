import asyncio
import logging
import os
import time
from functools import wraps
from io import BytesIO
from urllib.parse import urljoin, urlparse, parse_qsl, urlsplit, urlunsplit, urlencode

from bson import ObjectId
from dotenv import load_dotenv
from flask import flash, jsonify, render_template, request, send_file
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from gridfs import GridFS
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError, ConfigurationError
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

def ensure_database_name(mongo_uri, default_dbname="scouting_app"):
    """Ensure the MongoDB URI has a database name, add the default if missing"""
    if not mongo_uri:
        return f"mongodb://localhost:27017/{default_dbname}"
        
    # Parse the URI
    parts = urlsplit(mongo_uri)
    
    # Check if a database name is already defined in the path
    path = parts.path
    if not path or path == '/':
        # No database name, add the default
        path = f"/{default_dbname}"
    
    # Reconstruct the URI with the ensured database name
    updated_uri = urlunsplit((
        parts.scheme,
        parts.netloc,
        path,
        parts.query,
        parts.fragment
    ))
    
    return updated_uri

class DatabaseManager:
    """Base class for database operations"""
    def __init__(self, mongo_uri: str):
        self.mongo_uri = ensure_database_name(mongo_uri)
        self.client = None
        self.db = None
        self.connect()

    def connect(self):
        """Establish connection to MongoDB"""
        try:
            if self.client is None:
                logger.info(f"Connecting to MongoDB with URI (sanitized): {self.get_sanitized_uri()}")
                self.client = MongoClient(self.mongo_uri, serverSelectionTimeoutMS=30000)
                self.client.server_info()  # Test connection
                
                # Get database name from URI or use default
                db_name = None
                if '/' in self.mongo_uri.split('://', 1)[1]:
                    path = self.mongo_uri.split('://', 1)[1].split('/', 1)[1]
                    if path and '?' in path:
                        db_name = path.split('?', 1)[0]
                    elif path:
                        db_name = path
                
                # Fallback to default database name if none found
                if not db_name:
                    db_name = "scouting_app"
                    logger.warning(f"No database name found in URI, using default: {db_name}")
                
                self.db = self.client[db_name]
                logger.info(f"Successfully connected to MongoDB database '{db_name}'")
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {str(e)}")
            raise

    def get_sanitized_uri(self):
        """Return a sanitized version of the MongoDB URI for logging (hide credentials)"""
        if not self.mongo_uri:
            return "None"
            
        try:
            parts = urlsplit(self.mongo_uri)
            
            # Replace password in netloc if present
            netloc = parts.netloc
            if '@' in netloc:
                user_pass, rest = netloc.split('@', 1)
                if ':' in user_pass:
                    username = user_pass.split(':', 1)[0]
                    netloc = f"{username}:***@{rest}"
            
            # Reconstruct sanitized URI
            sanitized = urlunsplit((
                parts.scheme,
                netloc,
                parts.path,
                parts.query,
                parts.fragment
            ))
            
            return sanitized
        except Exception:
            # If parsing fails, redact the whole URI
            return "[Redacted URI]"

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
    storage_uri=ensure_database_name(os.getenv("MONGO_URI")),
    default_limits=["5000 per day", "1000 per hour"],
    strategy="fixed-window-elastic-expiry",
    enabled=False
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
