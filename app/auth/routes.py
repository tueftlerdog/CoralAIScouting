from flask import (
    Blueprint,
    render_template,
    redirect,
    url_for,
    request,
    flash,
    jsonify,
    send_file,
)
from flask_login import login_required, login_user, current_user, logout_user
from app.auth.auth_utils import UserManager
import asyncio
from functools import wraps
import os
from werkzeug.utils import secure_filename
from bson import ObjectId
from gridfs import GridFS

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_gridfs():
    """Get GridFS instance"""
    return GridFS(user_manager.db)

def save_profile_picture(file):
    """Save profile picture to GridFS"""
    if file and allowed_file(file.filename):
        fs = get_gridfs()
        return fs.put(
            file.stream.read(),
            filename=secure_filename(file.filename),
            content_type=file.content_type,
        )
    return None

def send_profile_picture(file_id):
    """Retrieve profile picture from GridFS"""
    try:
        fs = get_gridfs()
        # Convert string ID to ObjectId if necessary
        if isinstance(file_id, str):
            file_id = ObjectId(file_id)
            
        # Get the file from GridFS
        file_data = fs.get(file_id)
        
        return send_file(
            file_data,
            mimetype=file_data.content_type,
            download_name=file_data.filename
        )
    except Exception as e:
        # Log the error and return default profile picture
        print(f"Error retrieving profile picture: {e}")
        return send_file("static/images/default_profile.png")


def run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def async_route(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        return run_async(f(*args, **kwargs))

    return wrapper


auth_bp = Blueprint("auth", __name__)
user_manager = None


@auth_bp.record
def on_blueprint_init(state):
    global user_manager
    user_manager = UserManager(state.app.config["MONGO_URI"])


@auth_bp.route("/login", methods=["GET", "POST"])
@async_route
async def login():
    if current_user.is_authenticated:
        return redirect(url_for("index"))

    form_data = {}
    if request.method == "POST":
        login = request.form.get("login", "").strip()
        password = request.form.get("password", "").strip()
        remember = bool(request.form.get("remember", False))

        form_data = {"login": login, "remember": remember}

        if not login or not password:
            flash("Please provide both login and password", "error")
            return render_template("auth/login.html", form_data=form_data)

        try:
            success, user = await user_manager.authenticate_user(login, password)
            if success and user:
                login_user(user, remember=remember)
                next_page = request.args.get("next")
                if not next_page or not next_page.startswith("/"):
                    next_page = url_for("index")
                flash("Successfully logged in", "success")
                return redirect(next_page)
            else:
                flash("Invalid login credentials", "error")
        except Exception as e:
            flash(f"An error occurred during login: {str(e)}", "error")

    return render_template("auth/login.html", form_data=form_data)


@auth_bp.route("/register", methods=["GET", "POST"])
@async_route
async def register():
    if current_user.is_authenticated:
        return redirect(url_for("index"))

    form_data = {}
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()
        confirm_password = request.form.get("confirm_password", "").strip()

        form_data = {"email": email, "username": username}

        if not all([email, username, password, confirm_password]):
            flash("All fields are required", "error")
            return render_template("auth/register.html", form_data=form_data)

        if password != confirm_password:
            flash("Passwords do not match", "error")
            return render_template("auth/register.html", form_data=form_data)

        try:
            success, message = await user_manager.create_user(
                email=email,
                username=username,
                password=password
            )
            if success:
                flash("Registration successful! Please login.", "success")
                return redirect(url_for("auth.login"))
            flash(message, "error")
        except Exception as e:
            flash(f"An error occurred during registration: {str(e)}", "error")

    return render_template("auth/register.html", form_data=form_data)


@auth_bp.route("/logout")
@login_required
def logout():
    logout_user()
    flash("Successfully logged out", "success")
    return redirect(url_for("auth.login"))


@auth_bp.route("/settings", methods=["GET", "POST"])
@login_required
@async_route
async def settings():
    if request.method == "POST":
        updates = {}
        
        # Handle profile picture upload
        if 'profile_picture' in request.files:
            file = request.files['profile_picture']
            if file and allowed_file(file.filename):
                try:
                    # Save new file to GridFS
                    fs = GridFS(user_manager.db)
                    filename = secure_filename(f"profile_{current_user.id}_{file.filename}")
                    file_id = fs.put(
                        file.stream.read(),
                        filename=filename,
                        content_type=file.content_type
                    )
                    
                    # Update user's profile picture and clean up old one
                    success, message = await user_manager.update_profile_picture(current_user.id, file_id)
                    if not success:
                        # If update failed, delete the newly uploaded file
                        fs.delete(file_id)
                        flash(message, "error")
                    else:
                        updates['profile_picture_id'] = file_id
                except Exception as e:
                    flash(f"Error uploading profile picture: {str(e)}", "error")

        # Handle other profile updates
        if username := request.form.get('username'):
            updates['username'] = username
        if description := request.form.get('description'):
            updates['description'] = description

        if updates:
            success, message = await user_manager.update_user_profile(current_user.id, updates)
            flash(message, "success" if success else "error")
            
            if success:
                return redirect(url_for('auth.settings'))

    return render_template("auth/settings.html", user=current_user)


@auth_bp.route("/profile/<username>")
def profile(username):
    user = user_manager.get_user_profile(username)
    if not user:
        flash("User not found", "error")
        return redirect(url_for("index"))
    
    return render_template("auth/profile.html", profile_user=user)


@auth_bp.route("/profile/picture/<user_id>")
def profile_picture(user_id):
    user = user_manager.get_user_by_id(user_id)
    if not user or not user.profile_picture_id:
        return send_file("static/images/default_profile.png")  # Create a default profile picture
    
    # Implement this to retrieve from MongoDB GridFS
    return send_profile_picture(user.profile_picture_id)


@auth_bp.route("/check_username", methods=["POST"])
@login_required
@async_route
async def check_username():
    """Check if a username is available"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        
        # Don't query if it's the user's current username
        if username == current_user.username:
            return jsonify({"available": True})
        
        # Check if username exists in database
        existing_user = user_manager.db.users.find_one({"username": username})
        
        return jsonify({
            "available": not existing_user
        })
    except Exception as e:
        return jsonify({
            "available": False,
            "error": str(e)
        }), 500
