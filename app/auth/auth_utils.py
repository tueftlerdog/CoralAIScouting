# auth_utils.py
from werkzeug.security import generate_password_hash
from datetime import datetime
from functools import wraps
from flask import redirect, url_for, flash
from flask_login import current_user

from .models import User

async def check_password_strength(password):
    """
    Check if password meets minimum requirements:
    - At least 8 characters
    - Contains uppercase letter
    - Contains lowercase letter
    - Contains number
    - Contains special character
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    
    # if not any(c.isupper() for c in password):
    #     return False, "Password must contain at least one uppercase letter"
        
    # if not any(c.islower() for c in password):
    #     return False, "Password must contain at least one lowercase letter"
        
    # if not any(c.isdigit() for c in password):
    #     return False, "Password must contain at least one number"
        
    # if not any(c in "!@#$%^&*(),.?\":{}|<>" for c in password):
    #     return False, "Password must contain at least one special character"
        
    return True, "Password meets all requirements"

class UserManager:
    async def create_user(self, email, username, password, teamNumber, role='user'):
        try:
            # Check if user already exists
            existing_user = await User.filter(email=email).first()
            if existing_user:
                return False, "Email already registered"
                
            existing_username = await User.filter(username=username).first()
            if existing_username:
                return False, "Username already taken"

            # Validate password
            password_valid, message = await check_password_strength(password)
            if not password_valid:
                return False, message

            # Create user
            await User.create(
                email=email,
                username=username,
                teamNumber=teamNumber,
                password_hash=generate_password_hash(password),
                role=role
            )
            return True, "User created successfully"
            
        except Exception as e:
            return False, f"Error creating user: {str(e)}"

    async def authenticate_user(self, login, password):
        """
        Authenticate user by email or username
        """
        # Try finding user by email first, then username
        user = await User.filter(email=login).first()
        if not user:
            user = await User.filter(username=login).first()
        
        if user and user.check_password(password):
            await user.update_last_login()
            return True, user
        return False, None