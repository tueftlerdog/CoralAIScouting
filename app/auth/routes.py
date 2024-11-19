from flask import Blueprint, current_app, render_template, redirect, url_for, request, flash
from flask_login import login_required, login_user, current_user, logout_user
from auth.auth_utils import UserManager
import asyncio
from functools import wraps

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

auth_bp = Blueprint('auth', __name__)
user_manager = None

@auth_bp.record
def on_blueprint_init(state):
    global user_manager
    user_manager = UserManager(state.app.config["MONGO_URI"])

@auth_bp.route('/login', methods=['GET', 'POST'])
@async_route
async def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    form_data = {}
    if request.method == 'POST':
        login = request.form.get('login', '').strip()
        password = request.form.get('password', '').strip()
        remember = bool(request.form.get('remember', False))
        
        form_data = {
            'login': login,
            'remember': remember
        }
        
        if not login or not password:
            flash('Please provide both login and password', 'error')
            return render_template('auth/login.html', form_data=form_data)
        
        try:
            success, user = await user_manager.authenticate_user(login, password)
            if success and user:
                login_user(user, remember=remember)
                next_page = request.args.get('next')
                if not next_page or not next_page.startswith('/'):
                    next_page = url_for('index')
                flash('Successfully logged in', 'success')
                return redirect(next_page)
            else:
                flash('Invalid login credentials', 'error')
        except Exception as e:
            flash(f'An error occurred during login: {str(e)}', 'error')
    
    return render_template('auth/login.html', form_data=form_data)

@auth_bp.route('/register', methods=['GET', 'POST'])
@async_route
async def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    form_data = {}
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '').strip()
        confirm_password = request.form.get('confirm_password', '').strip()
        team_number = request.form.get('teamNumber', 0)
        
        form_data = {
            'email': email,
            'username': username,
            'team_number': team_number
        }
        
        if not all([email, username, password, confirm_password]):
            flash('All fields are required', 'error')
            return render_template('auth/register.html', form_data=form_data)
        
        if password != confirm_password:
            flash('Passwords do not match', 'error')
            return render_template('auth/register.html', form_data=form_data)
        
        try:
            success, message = await user_manager.create_user(email, username, password, team_number)
            if success:
                flash('Registration successful! Please login.', 'success')
                return redirect(url_for('auth.login'))
            flash(message, 'error')
        except Exception as e:
            flash(f'An error occurred during registration: {str(e)}', 'error')
    
    return render_template('auth/register.html', form_data=form_data)

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    flash('Successfully logged out', 'success')
    return redirect(url_for('auth.login'))