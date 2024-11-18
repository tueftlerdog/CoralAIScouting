# setup_db.py
from pymongo import MongoClient
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash
import os
from dotenv import load_dotenv

def setup_database():
    # Load environment variables
    load_dotenv()
    
    # Connect to MongoDB
    client = MongoClient(os.getenv('MONGO_URI', 'mongodb://localhost:27017/'))
    
    # Create/get database
    db = client.scouting_app  # This creates/gets the 'scouting_app' database
    
    # Create collections if they don't exist
    if 'users' not in db.list_collection_names():
        db.create_collection('users')
        print("Created users collection")
        
        # Create initial admin user
        admin_user = {
            'email': 'admin@team334.com',
            'username': 'admin',
            'teamNumber': '334',
            'password_hash': generate_password_hash('admin334'),  # Change this password!
            'role': 'admin',
            'created_at': datetime.now(timezone.utc)
        }
        db.users.insert_one(admin_user)
        print("Created admin user")
    
    if 'team_data' not in db.list_collection_names():
        db.create_collection('team_data')
        print("Created team_data collection")
    
    # Create indexes
    db.users.create_index('email', unique=True)
    db.users.create_index('username', unique=True)
    db.team_data.create_index([('team_number', 1), ('event_code', 1), ('match_number', 1)], unique=True)
    
    print("\nDatabase setup complete!")
    print("Collections:", db.list_collection_names())
    print("\nMake sure to change the admin password!")
    
    # Close connection
    client.close()

if __name__ == "__main__":
    setup_database()