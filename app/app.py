from flask import Flask, render_template
from flask_login import LoginManager, current_user, login_required
import os
from datetime import timedelta
import asyncio
from tortoise import Tortoise
from functools import partial

from auth.models import User
from auth.auth_utils import UserManager
from auth.routes import create_auth_blueprint
from team import team_bp

async def init_db():
    await Tortoise.init(
        db_url="sqlite://app/db/tortoise.db",
        modules={"models": ["auth.models"]},
    )
    await Tortoise.generate_schemas()

def run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()

async def create_app():
    app = Flask(__name__, static_folder='static', template_folder='templates')
    app.config.update(
        SECRET_KEY=os.getenv('SECRET_KEY', 'team334'),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SECURE=True,
        PERMANENT_SESSION_LIFETIME=timedelta(minutes=30),
        TEMPLATES_AUTO_RELOAD=True
    )

    # Initialize Tortoise-ORM
    await init_db()

    # Initialize Flask-Login
    login_manager = LoginManager()
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message_category = 'error'

    # Initialize UserManager
    user_manager = UserManager()

    @login_manager.user_loader
    def load_user(user_id):
        try:
            # Run the async query in a synchronous context
            return run_async(User.get_or_none(id=int(user_id)))
        except Exception as e:
            print(f"Error loading user: {e}")
            return None

    # Create and register blueprint
    auth_bp = create_auth_blueprint(user_manager)
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(team_bp, url_prefix='/team')

    # Main routes
    @app.route('/')
    def index():
        return render_template('index.html')

    return app

def run_app():
    return run_async(create_app())

if __name__ == '__main__':
    app = run_app()
    app.run(debug=True)