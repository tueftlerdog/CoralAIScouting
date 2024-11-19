from bson import ObjectId
from werkzeug.security import check_password_hash
from flask_login import UserMixin


class User(UserMixin):
    def __init__(self, user_data):
        self._id = user_data.get('_id')
        self.email = user_data.get('email')
        self.username = user_data.get('username')
        self.teamNumber = user_data.get('teamNumber')
        self.password_hash = user_data.get('password_hash')
        self.role = user_data.get('role', 'user')
        self.last_login = user_data.get('last_login')
        self.created_at = user_data.get('created_at')

    def get_id(self):
        try:
            return str(self._id)
        except AttributeError as e:
            raise NotImplementedError('No `_id` attribute - override `get_id`') from e

    def is_authenticated(self):
        return True

    def is_active(self):
        return True

    def is_anonymous(self):
        return False

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @staticmethod
    def create_from_db(user_data):
        """Creates a User instance from database data"""
        if not user_data:
            return None
        # Ensure _id is ObjectId
        if '_id' in user_data and not isinstance(user_data['_id'], ObjectId):
            user_data['_id'] = ObjectId(user_data['_id'])
        return User(user_data)

    def to_dict(self):
        return {
            '_id': self._id,
            'email': self.email,
            'username': self.username,
            'teamNumber': self.teamNumber,
            'password_hash': self.password_hash,
            'role': self.role,
            'last_login': self.last_login,
            'created_at': self.created_at
        }

class TeamData:
    def __init__(self, data):
        self._id = data.get('_id')
        self.team_number = data.get('team_number')
        self.event_code = data.get('event_code')
        self.match_number = data.get('match_number')
        self.auto_points = data.get('auto_points')
        self.teleop_points = data.get('teleop_points')
        self.endgame_points = data.get('endgame_points')
        self.total_points = data.get('total_points')
        self.notes = data.get('notes', '')
        self.scouter_id = data.get('scouter_id')
        self.created_at = data.get('created_at')
        
        # Handle the nested scouter data
        scouter_data = data.get('scouter', {})
        self.scouter = {
            'username': scouter_data.get('username', 'Unknown'),
            'team_number': scouter_data.get('team_number'),
            'email': scouter_data.get('email'),
            'role': scouter_data.get('role', 'user')
        }

    @property
    def id(self):
        return str(self._id)

    @staticmethod
    def create_from_db(data):
        if not data:
            return None
            
        # Ensure _id is ObjectId
        if '_id' in data and not isinstance(data['_id'], ObjectId):
            data['_id'] = ObjectId(data['_id'])
            
        # Ensure scouter_id is ObjectId
        if 'scouter_id' in data and not isinstance(data['scouter_id'], ObjectId):
            data['scouter_id'] = ObjectId(data['scouter_id'])
            
        return TeamData(data)

    def to_dict(self):
        return {
            'id': self.id,
            'team_number': self.team_number,
            'event_code': self.event_code,
            'match_number': self.match_number,
            'auto_points': self.auto_points,
            'teleop_points': self.teleop_points,
            'endgame_points': self.endgame_points,
            'total_points': self.total_points,
            'notes': self.notes,
            'scouter_id': str(self.scouter_id),
            'created_at': self.created_at,
            'scouter': self.scouter
        }

    @property
    def scouter_name(self):
        """Returns formatted scouter name with team number if available"""
        username = self.scouter.get('username', 'Unknown')
        team_number = self.scouter.get('team_number')
        return f"{username} ({team_number})"

    @property
    def formatted_date(self):
        """Returns formatted creation date"""
        if self.created_at:
            return self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        return 'N/A'