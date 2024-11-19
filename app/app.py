from flask import Flask, render_template
from flask_login import LoginManager
from flask_pymongo import PyMongo
import os
from dotenv import load_dotenv

from auth.auth_utils import UserManager


mongo = PyMongo()
login_manager = LoginManager()


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")

    # Load config
    load_dotenv()
    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY", "team334"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SECURE=True,
        MONGO_URI=os.getenv(
            "MONGO_URI", "mongodb://localhost:27017/scouting_app"
        ),
    )

    mongo.init_app(app)

    with app.app_context():
        if "team_data" not in mongo.db.list_collection_names():
            mongo.db.create_collection("team_data")
        if "users" not in mongo.db.list_collection_names():
            mongo.db.create_collection("users")

    login_manager.init_app(app)
    login_manager.login_view = "auth.login"
    login_manager.login_message_category = "error"

    try:
        user_manager = UserManager(app.config["MONGO_URI"])
    except Exception as e:
        app.logger.error(f"Failed to initialize UserManager: {e}")
        raise

    @login_manager.user_loader
    def load_user(user_id):
        try:
            return user_manager.get_user_by_id(user_id)
        except Exception as e:
            app.logger.error(f"Error loading user: {e}")
            return None

    user_manager = UserManager(app.config["MONGO_URI"])

    # Import blueprints inside create_app to avoid circular imports
    from auth.routes import auth_bp
    from scout.routes import scouting_bp

    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(scouting_bp, url_prefix="/")

    @app.route("/")
    def index():
        return render_template("index.html")

    return app


if __name__ == "__main__":
    app = create_app()
    app.run()
