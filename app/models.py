from typing import Dict
from bson import ObjectId
from werkzeug.security import check_password_hash
from flask_login import UserMixin
from datetime import datetime


class User(UserMixin):
    def __init__(self, data):
        self._id = data.get('_id')
        self.username = data.get('username')
        self.email = data.get("email")
        self.teamNumber = data.get("teamNumber")
        self.password_hash = data.get("password_hash")
        self.role = data.get("role", "user")
        self.last_login = data.get("last_login")
        self.created_at = data.get("created_at")

    @property
    def id(self):
        return str(self._id)

    def get_id(self):
        return str(self._id)

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
        if "_id" in user_data and not isinstance(user_data["_id"], ObjectId):
            user_data["_id"] = ObjectId(user_data["_id"])
        return User(user_data)

    def to_dict(self):
        return {
            "_id": self._id,
            "email": self.email,
            "username": self.username,
            "teamNumber": self.teamNumber,
            "password_hash": self.password_hash,
            "role": self.role,
            "last_login": self.last_login,
            "created_at": self.created_at,
        }


class TeamData:
    def __init__(self, data):
        self._id = data.get("_id")
        self.team_number = data.get("team_number")
        self.event_code = data.get("event_code")
        self.match_number = data.get("match_number")
        self.auto_points = data.get("auto_points")
        self.teleop_points = data.get("teleop_points")
        self.endgame_points = data.get("endgame_points")
        self.total_points = data.get("total_points")
        self.notes = data.get("notes", "")
        self.scouter_id = data.get("scouter_id")
        self.created_at = data.get("created_at")

        # Handle the nested scouter data
        scouter_data = data.get("scouter", {})
        self.scouter = {
            "username": scouter_data.get("username", "Unknown"),
            "team_number": scouter_data.get("team_number"),
            "email": scouter_data.get("email"),
            "role": scouter_data.get("role", "user"),
        }

    @property
    def id(self):
        return str(self._id)

    @staticmethod
    def create_from_db(data):
        if not data:
            return None

        # Ensure _id is ObjectId
        if "_id" in data and not isinstance(data["_id"], ObjectId):
            data["_id"] = ObjectId(data["_id"])

        # Ensure scouter_id is ObjectId
        if "scouter_id" in data and not isinstance(
                                                data["scouter_id"], ObjectId
                                                ):
            data["scouter_id"] = ObjectId(data["scouter_id"])

        return TeamData(data)

    def to_dict(self):
        return {
            "id": self.id,
            "team_number": self.team_number,
            "event_code": self.event_code,
            "match_number": self.match_number,
            "auto_points": self.auto_points,
            "teleop_points": self.teleop_points,
            "endgame_points": self.endgame_points,
            "total_points": self.total_points,
            "notes": self.notes,
            "scouter_id": str(self.scouter_id),
            "created_at": self.created_at,
            "scouter": self.scouter,
        }

    @property
    def scouter_name(self):
        """Returns formatted scouter name with team number if available"""
        username = self.scouter.get("username", "Unknown")
        team_number = self.scouter.get("team_number")
        return f"{username} ({team_number})"

    @property
    def formatted_date(self):
        """Returns formatted creation date"""
        if self.created_at:
            return self.created_at.strftime("%Y-%m-%d %H:%M:%S")
        return "N/A"

    @property
    def is_owner(self):
        """Returns whether the current user is the owner of the data"""
        return str(self.scouter_id) != str(self.scouter.get("team_number"))

class PitScouting:
    def __init__(self, data: Dict):
        self._id = data.get("_id")
        self.swerve = data.get("swerve", "")  # string
        self.motors = data.get("motors", "")  # string
        self.shooter_type = data.get("shooter_type", "")  # string
        self.intake_type = data.get("intake_type", "")  # string
        self.broken = data.get("broken", False)  # bool
        self.pictures = data.get("pictures", [])  # List of image URLs or IDs (assuming 1-3)
        self.notes = data.get("notes", "")  # string
        self.capabilities = data.get("capabilities", "")  # string (corrected from "capbalities_of")
        self.team_friendliness = data.get("team_friendliness", 0)  # int [1-10] (corrected from "people were nice and easy going")
        self.programming_language = data.get("programming_language", "")  # string (corrected from "programming lang")

    @property
    def id(self):
        return str(self._id)

    @staticmethod
    def create_from_db(data: Dict):
        if not data:
            return None
        if "_id" in data and not isinstance(data["_id"], ObjectId):
            data["_id"] = ObjectId(data["_id"])
        return PitScouting(data)

    def to_dict(self):
        return {
            "id": self.id,
            "swerve": self.swerve,
            "motors": self.motors,
            "shooter_type": self.shooter_type,
            "intake_type": self.intake_type,
            "broken": self.broken,
            "pictures": self.pictures,
            "notes": self.notes,
            "capabilities": self.capabilities,
            "team_friendliness": self.team_friendliness,
            "programming_language": self.programming_language,
        }


class Team:
    def __init__(self, data: Dict):
        self._id = data.get("_id")
        self.team_number = data.get("team_number")
        self.team_join_code = data.get("team_join_code")
        self.users = data.get("users", [])  # List of User IDs
        self.admins = data.get("admins", [])  # List of admin User IDs
        self.owner_id = data.get("owner_id")  # Single owner ID
        self.created_at = data.get("created_at")
        self.team_name = data.get("team_name")
        self.description = data.get("description", "")
        self.logo_id = data.get("logo_id")  # This should be kept as ObjectId

    def to_dict(self):
        return {
            "id": self.id,
            "team_number": self.team_number,
            "team_join_code": self.team_join_code,
            "users": self.users,
            "admins": self.admins,
            "owner_id": str(self.owner_id) if self.owner_id else None,
            "created_at": self.created_at,
            "team_name": self.team_name,
            "description": self.description,
            "logo_id": str(self.logo_id) if self.logo_id else None,
        }

    def is_owner(self, user_id: str) -> bool:
        """Check if a user is the owner of the team"""
        return str(self.owner_id) == user_id

    def is_admin(self, user_id: str) -> bool:
        """Check if a user is an admin of the team"""
        return user_id in self.admins or self.is_owner(user_id)

    @property
    def id(self):
        return str(self._id)

    @staticmethod
    def create_from_db(data: Dict):
        if not data:
            return None
        # Convert string ID to ObjectId if necessary
        if "_id" in data and not isinstance(data["_id"], ObjectId):
            data["_id"] = ObjectId(data["_id"])
        if "logo_id" in data and not isinstance(data["logo_id"], ObjectId) and data["logo_id"]:
            data["logo_id"] = ObjectId(data["logo_id"])
        return Team(data)

    def add_user(self, user: UserMixin):
        # Assuming user is an instance of User (or any UserMixin subclass)
        if isinstance(user, UserMixin):
            self.users.append(user.get_id())  # Store the User ID
        else:
            raise ValueError("Expected a UserMixin instance")

    def remove_user(self, user: UserMixin):
        if isinstance(user, UserMixin):
            self.users = [uid for uid in self.users if uid != user.get_id()]
        else:
            raise ValueError("Expected a UserMixin instance")

class Assignment:
    def __init__(self, id, title, description, team_number, creator_id, assigned_to, due_date=None, status='pending'):
        self.id = str(id)
        self.title = title
        self.description = description
        self.team_number = team_number
        self.creator_id = creator_id
        self.assigned_to = assigned_to
        self.status = status
        # Convert string to datetime if needed
        if isinstance(due_date, str):
            try:
                self.due_date = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                self.due_date = None
        else:
            self.due_date = due_date

    @classmethod
    def create_from_db(cls, data):
        return cls(
            id=data['_id'],
            title=data.get('title'),
            description=data.get('description'),
            team_number=data.get('team_number'),
            creator_id=data.get('creator_id'),
            assigned_to=data.get('assigned_to', []),
            due_date=data.get('due_date'),
            status=data.get('status', 'pending')
        )

    def to_dict(self):
        return {
            "id": self.id,
            "team_number": self.team_number,
            "title": self.title,
            "description": self.description,
            "assigned_to": self.assigned_to,
            "status": self.status,
            "due_date": self.due_date,
            "created_by": str(self.created_by) if self.created_by else None,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
        }