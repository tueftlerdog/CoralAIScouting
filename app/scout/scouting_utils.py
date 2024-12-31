from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure
from bson import ObjectId
from datetime import datetime, timezone
from app.models import TeamData
import logging
import time
from functools import wraps

logger = logging.getLogger(__name__)


def with_mongodb_retry(retries=3, delay=2):
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
                        logger.warning(f"Attempt {attempt + 1} failed: {str(e)}.")
                        time.sleep(delay)
                    else:
                        logger.error(f"All {retries} attempts failed: {str(e)}")
            raise last_error

        return wrapper

    return decorator


class ScoutingManager:
    def __init__(self, mongo_uri):
        self.mongo_uri = mongo_uri
        self.client = None
        self.db = None
        self.connect()

    def connect(self):
        """Establish connection to MongoDB with basic error handling"""
        try:
            if self.client is None:
                self.client = MongoClient(self.mongo_uri, serverSelectionTimeoutMS=5000)
                # Test the connection
                self.client.server_info()
                self.db = self.client.get_default_database()
                logger.info("Successfully connected to MongoDB")

                # Ensure team_data collection exists
                if "team_data" not in self.db.list_collection_names():
                    self.db.create_collection("team_data")
                    # Create indexes
                    self.db.team_data.create_index([("team_number", 1)])
                    self.db.team_data.create_index([("scouter_id", 1)])
                    logger.info("Created team_data collection and indexes")
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {str(e)}")
            raise

    def ensure_connected(self):
        """Ensure we have a valid connection, reconnect if necessary"""
        try:
            if self.client is None:
                self.connect()
            else:
                # Test if connection is still alive
                self.client.server_info()
        except Exception:
            logger.warning("Lost connection to MongoDB, attempting to reconnect.")
            self.connect()

    @with_mongodb_retry(retries=3, delay=2)
    def add_scouting_data(self, data, scouter_id):
        """Add new scouting data with retry mechanism"""
        self.ensure_connected()
        try:
            # Validate team number
            team_number = int(data["team_number"])
            if team_number <= 0:
                return False, "Invalid team number"

            if existing_entry := self.db.team_data.find_one(
                {
                    "event_code": data["event_code"],
                    "match_number": int(data["match_number"]),
                    "team_number": team_number,
                }
            ):
                return False, f"Team {team_number} already exists in match {data['match_number']} for event {data['event_code']}"

            # Get existing match data to validate alliance sizes and calculate scores
            match_data = list(self.db.team_data.find({
                "event_code": data["event_code"],
                "match_number": int(data["match_number"])
            }))

            # Count teams per alliance
            alliance = data.get("alliance", "red")
            red_teams = [m for m in match_data if m["alliance"] == "red"]
            blue_teams = [m for m in match_data if m["alliance"] == "blue"]

            if (alliance == "red" and len(red_teams) >= 3) or (alliance == "blue" and len(blue_teams) >= 3):
                return False, f"Cannot add more teams to {alliance} alliance (maximum 3)"

            # Calculate alliance scores
            red_score = sum(t["total_points"] for t in red_teams)
            blue_score = sum(t["total_points"] for t in blue_teams)

            # Add current team's points to their alliance
            current_points = (
                int(data["auto_points"])
                + int(data["teleop_points"])
                + int(data["endgame_points"])
            )
            if alliance == "red":
                red_score += current_points
                alliance_score = red_score
                opponent_score = blue_score
            else:
                blue_score += current_points
                alliance_score = blue_score
                opponent_score = red_score

            # Determine match result
            if alliance_score > opponent_score:
                match_result = "won"
            elif alliance_score < opponent_score:
                match_result = "lost"
            else:
                match_result = "tie"

            team_data = {
                "team_number": team_number,
                "event_code": data["event_code"],
                "match_number": int(data["match_number"]),
                "auto_points": int(data["auto_points"]),
                "teleop_points": int(data["teleop_points"]),
                "endgame_points": int(data["endgame_points"]),
                "total_points": current_points,
                "notes": data["notes"],
                "scouter_id": ObjectId(scouter_id),
                "alliance": alliance,
                "alliance_score": alliance_score,
                "opponent_score": opponent_score,
                "match_result": match_result,
                "created_at": datetime.now(timezone.utc),
            }

            self.db.team_data.insert_one(team_data)
            logger.info(f"Added new scouting data for team {data['team_number']}")
            return True, "Data added successfully"
        except Exception as e:
            logger.error(f"Error adding scouting data: {str(e)}")
            return False, str(e)

    @with_mongodb_retry(retries=3, delay=2)
    def get_all_scouting_data(self):
        """Get all scouting data with user information"""
        try:
            pipeline = [
                {
                    "$lookup": {
                        "from": "users",
                        "localField": "scouter_id",
                        "foreignField": "_id",
                        "as": "scouter"
                    }
                },
                {"$unwind": "$scouter"},
                {
                    "$project": {
                        "_id": 1,
                        "team_number": 1,
                        "match_number": 1,
                        "event_code": 1,
                        "auto_points": 1,
                        "teleop_points": 1,
                        "endgame_points": 1,
                        "total_points": 1,
                        "notes": 1,
                        "alliance": 1,
                        "match_result": 1,
                        "scouter_id": 1,
                        "scouter_name": "$scouter.username",
                        "scouter_team": "$scouter.teamNumber"
                    }
                }
            ]
            
            team_data = list(self.db.team_data.aggregate(pipeline))
            return [TeamData.create_from_db(data) for data in team_data]
        except Exception as e:
            print(f"Error fetching team data: {e}")
            return []

    @with_mongodb_retry(retries=3, delay=2)
    def get_team_data(self, team_id, scouter_id=None):
        """Get specific team data with optional scouter verification"""
        self.ensure_connected()
        try:
            # Just get the data by ID first
            data = self.db.team_data.find_one({"_id": ObjectId(team_id)})
            if not data:
                return None

            # Then check ownership if scouter_id is provided
            if scouter_id:
                data["is_owner"] = str(data["scouter_id"]) == str(scouter_id)
            else:
                data["is_owner"] = False

            return TeamData.create_from_db(data)
        except Exception as e:
            logger.error(f"Error fetching team data: {str(e)}")
            return None

    @with_mongodb_retry(retries=3, delay=2)
    def update_team_data(self, team_id, data, scouter_id):
        """Update existing team data if user is the owner"""
        self.ensure_connected()
        try:
            # First verify ownership
            existing_data = self.db.team_data.find_one(
                {"_id": ObjectId(team_id), "scouter_id": ObjectId(scouter_id)}
            )

            if not existing_data:
                logger.warning(
                    f"Update attempted by non-owner scouter_id: {scouter_id}"
                )
                return False

            updated_data = {
                "team_number": int(data["team_number"]),
                "event_code": data["event_code"],
                "match_number": int(data["match_number"]),
                "auto_points": int(data["auto_points"]),
                "teleop_points": int(data["teleop_points"]),
                "endgame_points": int(data["endgame_points"]),
                "total_points": (
                    int(data["auto_points"])
                    + int(data["teleop_points"])
                    + int(data["endgame_points"])
                ),
                "notes": data["notes"],
                "alliance": data.get("alliance", "red"),
                "match_result": data.get("match_result", ""),
            }

            result = self.db.team_data.update_one(
                {"_id": ObjectId(team_id), "scouter_id": ObjectId(scouter_id)},
                {"$set": updated_data},
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Error updating team data: {str(e)}")
            return False

    @with_mongodb_retry(retries=3, delay=2)
    def delete_team_data(self, team_id, scouter_id):
        """Delete team data if scouter has permission"""
        self.ensure_connected()
        try:
            result = self.db.team_data.delete_one(
                {"_id": ObjectId(team_id), "scouter_id": ObjectId(scouter_id)}
            )
            return result.deleted_count > 0
        except Exception as e:
            logger.error(f"Error deleting team data: {str(e)}")
            return False

    @with_mongodb_retry(retries=3, delay=2)
    def has_team_data(self, team_number):
        """Check if there is any scouting data for a given team number"""
        self.ensure_connected()
        try:
            count = self.db.team_data.count_documents({"team_number": int(team_number)})
            return count > 0
        except Exception as e:
            logger.error(f"Error checking team data: {str(e)}")
            return False

    def __del__(self):
        """Cleanup MongoDB connection"""
        if self.client:
            self.client.close()
