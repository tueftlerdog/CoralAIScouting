import os
import time
from urllib.parse import urlsplit, urlunsplit
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure, ConfigurationError

from dotenv import load_dotenv
from flask import (Flask, jsonify, make_response, render_template,
                   send_from_directory)
from flask_login import LoginManager
from flask_pymongo import PyMongo
from flask_wtf.csrf import CSRFProtect

from app.auth.auth_utils import UserManager
from app.utils import limiter, ensure_database_name

csrf = CSRFProtect()
mongo = PyMongo()
login_manager = LoginManager()

def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")

    # Load config
    load_dotenv()
    
    # Make sure MongoDB URI has a database name
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/scouting_app")
    mongo_uri = ensure_database_name(mongo_uri, "scouting_app")
    
    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY", "team334"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SECURE=True,
        WTF_CSRF_ENABLED=True,
        MONGO_URI=mongo_uri,
        MONGO_DBNAME="scouting_app",  # Explicitly set the database name as fallback
        MONGO_CONNECT_TIMEOUT_MS=30000,  # Increase connection timeout to 30 seconds
        MONGO_SOCKET_TIMEOUT_MS=30000,   # Increase socket timeout
    )

    # Sanitize URI for logging (hide password)
    def get_sanitized_uri(uri):
        if not uri:
            return "None"
        try:
            parts = urlsplit(uri)
            netloc = parts.netloc
            if '@' in netloc:
                user_pass, rest = netloc.split('@', 1)
                if ':' in user_pass:
                    username = user_pass.split(':', 1)[0]
                    netloc = f"{username}:***@{rest}"
            sanitized = urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
            return sanitized
        except Exception:
            return "[Redacted URI]"
    
    app.logger.info(f"Using MongoDB URI: {get_sanitized_uri(mongo_uri)}")
    app.logger.info(f"Using database name: {app.config['MONGO_DBNAME']}")

    # Initialize MongoDB with robust error handling
    mongo_initialized = False
    
    try:
        # First initialize the PyMongo instance
        mongo.init_app(app)
        
        # Explicitly test the connection
        with app.app_context():
            # Test connection with a ping command - retry up to 3 times
            max_retries = 3
            retry_delay = 2  # seconds
            
            for attempt in range(max_retries):
                try:
                    # Ping the database to verify connection
                    app.logger.info(f"Testing MongoDB connection (attempt {attempt+1}/{max_retries})")
                    mongo.cx.admin.command('ping')  # Use the client directly instead of db
                    app.logger.info("MongoDB connection successful")
                    mongo_initialized = True
                    
                    # Now we can safely use mongo.db
                    app.logger.info(f"Connected to database: {mongo.db.name}")
                    
                    # Now safely check and create collections
                    app.logger.info("Checking MongoDB collections")
                    collections = mongo.db.list_collection_names()
                    
                    if "users" not in collections:
                        mongo.db.create_collection("users")
                        app.logger.info("Created users collection")
                    
                    if "teams" not in collections:
                        mongo.db.create_collection("teams")
                        app.logger.info("Created teams collection")
                    
                    if "team_data" not in collections:
                        mongo.db.create_collection("team_data")
                        app.logger.info("Created team_data collection")
                    
                    if "pit_scouting" not in collections:
                        mongo.db.create_collection("pit_scouting")
                        app.logger.info("Created pit_scouting collection")
                    
                    if "assignments" not in collections:
                        mongo.db.create_collection("assignments")
                        app.logger.info("Created assignments collection")
                    
                    # Add new collection for coral analysis requests
                    if "coral_requests" not in collections:
                        mongo.db.create_collection("coral_requests")
                        # Create indexes for faster queries
                        mongo.db.coral_requests.create_index([("status", 1)])
                        mongo.db.coral_requests.create_index([("requested_by", 1)])
                        mongo.db.coral_requests.create_index([("youtube_url", 1)])
                        app.logger.info("Created coral_requests collection and indexes")
                    
                    break  # Exit the retry loop on success
                except (ServerSelectionTimeoutError, ConnectionFailure, ConfigurationError) as e:
                    if attempt < max_retries - 1:
                        app.logger.warning(f"MongoDB connection attempt {attempt+1} failed: {str(e)}")
                        app.logger.info(f"Retrying in {retry_delay} seconds...")
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                    else:
                        app.logger.error(f"All MongoDB connection attempts failed: {str(e)}")
                        raise
            
    except Exception as e:
        app.logger.error(f"MongoDB Connection Error: {str(e)}", exc_info=True)
        
        # Provide more detailed diagnostic information
        if "SSL: CERTIFICATE_VERIFY_FAILED" in str(e):
            app.logger.error("SSL certificate verification failed. Check your MongoDB URI and certificates.")
        elif "ServerSelectionTimeoutError" in str(e):
            app.logger.error("Could not connect to MongoDB server. Check if the server is running and accessible.")
        elif "Authentication failed" in str(e):
            app.logger.error("MongoDB authentication failed. Check your username and password in the connection string.")
        elif "not authorized" in str(e):
            app.logger.error("MongoDB authorization error. Check if the user has proper permissions.")
        elif "No default database name defined" in str(e):
            app.logger.error("No database name provided in MongoDB URI. Add a database name to your connection string.")
        
        # Continue initializing the app even with failed MongoDB connection
        # This allows the app to start and show a proper error page rather than just crashing
        app.logger.warning("Continuing app initialization despite MongoDB connection failure")
    
    # Initialize other components
    # csrf.init_app(app)
    limiter.init_app(app)
    
    login_manager.init_app(app)
    login_manager.login_view = "auth.login"
    login_manager.login_message_category = "error"

    user_manager = None
    if mongo_initialized:
        try:
            user_manager = UserManager(mongo_uri)
            app.logger.info("UserManager initialized successfully")
        except Exception as e:
            app.logger.error(f"Failed to initialize UserManager: {e}")
            # Don't raise here to allow app to start

    @login_manager.user_loader
    def load_user(user_id):
        try:
            if user_manager is None:
                app.logger.error("UserManager not initialized, cannot load user")
                return None
            return user_manager.get_user_by_id(user_id)
        except Exception as e:
            app.logger.error(f"Error loading user: {e}")
            return None

    # Import blueprints inside create_app to avoid circular imports - now with conditional initialization
    if mongo_initialized:
        try:
            from app.auth.routes import auth_bp
            from app.scout.routes import scouting_bp
            from app.team.routes import team_bp

            app.register_blueprint(auth_bp, url_prefix="/auth")
            app.register_blueprint(scouting_bp, url_prefix="/")
            app.register_blueprint(team_bp, url_prefix="/team")

            # Register coral-specific routes
            app.logger.info("Registered routes for coral analysis: /coral/request, /coral/results, /coral/status/<request_id>")
        except Exception as e:
            app.logger.error(f"Error registering blueprints: {e}")
    else:
        app.logger.warning("Skipping blueprint registration due to MongoDB connection failure")

    @app.route("/")
    def index():
        return render_template("index.html")
    
    @app.route("/db-status")
    def db_status():
        """Route to check database status"""
        try:
            if not mongo_initialized:
                return jsonify({
                    "status": "error",
                    "message": "MongoDB was not initialized successfully"
                }), 500
                
            # Try to ping the database
            mongo.cx.admin.command('ping')
            
            collections = []
            try:
                collections = mongo.db.list_collection_names()
            except Exception as e:
                app.logger.error(f"Error listing collections: {e}")
            
            return jsonify({
                "status": "connected",
                "message": "Database connection is working properly",
                "database": mongo.db.name if hasattr(mongo.db, 'name') else app.config.get('MONGO_DBNAME', 'unknown'),
                "collections": collections
            })
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": f"Database connection error: {str(e)}"
            }), 500
            
    @app.route("/system-info")
    def system_info():
        """Route to show general system information"""
        return jsonify({
            "app_version": "1.0.0",
            "python_version": os.sys.version,
            "environment": os.getenv("FLASK_ENV", "production"),
            "database_configured": mongo_initialized,
            "database_name": app.config.get('MONGO_DBNAME', 'unknown'),
            "mongo_uri_type": urlsplit(mongo_uri).scheme
        })
    
    @app.errorhandler(404)
    def not_found(e):
        return render_template("404.html")

    @app.errorhandler(500)
    def server_error(e):
        app.logger.error(f"Server error: {str(e)}", exc_info=True)
        return render_template("500.html"), 500

    @app.errorhandler(Exception)
    def handle_exception(e):
        app.logger.error(f"Unhandled exception: {str(e)}", exc_info=True)
        return render_template("500.html"), 500
    
    @app.errorhandler(429)
    def rate_limit_error(e):
        return render_template("429.html"), 429

    @app.route('/static/manifest.json')
    def serve_manifest():
        return send_from_directory(app.static_folder, 'manifest.json')

    @app.route('/static/js/service-worker.js')
    def serve_service_worker():
        response = make_response(send_from_directory(app.static_folder, 'js/service-worker.js'))
        response.headers['Service-Worker-Allowed'] = '/'
        response.headers['Cache-Control'] = 'no-cache'
        return response

    # Add environment variable for Gemini API key (will be used by the Scout class)
    app.config['GEMINI_API_KEY'] = os.getenv("GEMINI_API_KEY", "")
    app.config['SECONDARY_GEMINI_API_KEY'] = os.getenv("SECONDARY_GEMINI_API_KEY", "")
    
    # Set configuration for coral analysis
    app.config['CORAL_ANALYSIS_ENABLED'] = os.getenv("CORAL_ANALYSIS_ENABLED", "True").lower() == "true"
    app.config['CORAL_MAX_REQUESTS_PER_HOUR'] = int(os.getenv("CORAL_MAX_REQUESTS_PER_HOUR", "3"))
    
    return app
