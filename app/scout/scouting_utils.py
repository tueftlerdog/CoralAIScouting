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

            # Process form data
            team_data = {
                "team_number": team_number,
                "event_code": data["event_code"],
                "match_number": int(data["match_number"]),
                "alliance": alliance,
                
                # Auto Coral scoring
                "auto_coral_level1": int(data.get("auto_coral_level1", 0)),
                "auto_coral_level2": int(data.get("auto_coral_level2", 0)),
                "auto_coral_level3": int(data.get("auto_coral_level3", 0)),
                "auto_coral_level4": int(data.get("auto_coral_level4", 0)),
                
                # Teleop Coral scoring
                "teleop_coral_level1": int(data.get("teleop_coral_level1", 0)),
                "teleop_coral_level2": int(data.get("teleop_coral_level2", 0)),
                "teleop_coral_level3": int(data.get("teleop_coral_level3", 0)),
                "teleop_coral_level4": int(data.get("teleop_coral_level4", 0)),
                
                # Auto Algae scoring
                "auto_algae_net": int(data.get("auto_algae_net", 0)),
                "auto_algae_processor": int(data.get("auto_algae_processor", 0)),
                
                # Teleop Algae scoring
                "teleop_algae_net": int(data.get("teleop_algae_net", 0)),
                "teleop_algae_processor": int(data.get("teleop_algae_processor", 0)),
                
                # Human Player
                "human_player": int(data.get("human_player", 0)),
                
                # Climb
                "climb_type": data.get("climb_type", ""),
                "climb_success": bool(data.get("climb_success", False)),
                
                # Defense
                "defense_rating": int(data.get("defense_rating", 1)),
                "defense_notes": data.get("defense_notes", ""),
                
                # Auto
                "auto_path": data.get("auto_path", ""),
                "auto_notes": data.get("auto_notes", ""),
                
                # Notes
                "notes": data.get("notes", ""),
                
                # Metadata
                "scouter_id": ObjectId(scouter_id),
                "created_at": datetime.now(timezone.utc),
            }

            result = self.db.team_data.insert_one(team_data)
            return True, str(result.inserted_id)

        except Exception as e:
            logger.error(f"Error adding team data: {str(e)}")
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
                        "auto_coral_level1": 1,
                        "auto_coral_level2": 1,
                        "auto_coral_level3": 1,
                        "auto_coral_level4": 1,
                        "teleop_coral_level1": 1,
                        "teleop_coral_level2": 1,
                        "teleop_coral_level3": 1,
                        "teleop_coral_level4": 1,
                        "auto_algae_net": 1,
                        "auto_algae_processor": 1,
                        "teleop_algae_net": 1,
                        "teleop_algae_processor": 1,
                        "human_player": 1,
                        "climb_type": 1,
                        "climb_success": 1,
                        "defense_rating": 1,
                        "defense_notes": 1,
                        "auto_path": 1,
                        "auto_notes": 1,
                        "notes": 1,
                        "alliance": 1,
                        "scouter_id": 1,
                        "scouter_name": "$scouter.username",
                        "scouter_team": "$scouter.teamNumber"
                    }
                }
            ]
            
            team_data = list(self.db.team_data.aggregate(pipeline))
            return team_data
        except Exception as e:
            logger.error(f"Error fetching team data: {str(e)}")
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
                "alliance": data.get("alliance", "red"),
                
                # Coral scoring
                "coral_level1": int(data.get("coral_level1", 0)),
                "coral_level2": int(data.get("coral_level2", 0)),
                "coral_level3": int(data.get("coral_level3", 0)),
                "coral_level4": int(data.get("coral_level4", 0)),
                
                # Algae scoring
                "algae_net": int(data.get("algae_net", 0)),
                "algae_processor": int(data.get("algae_processor", 0)),
                "human_player": int(data.get("human_player", 0)),
                
                # Climb
                "climb_type": data.get("climb_type", ""),
                "climb_success": bool(data.get("climb_success", False)),
                
                # Defense
                "defense_rating": int(data.get("defense_rating", 1)),
                "defense_notes": data.get("defense_notes", ""),

                
                # Auto
                "auto_path": data.get("auto_path", ""),
                "auto_notes": data.get("auto_notes", ""),
                
                # Notes
                "notes": data.get("notes", ""),
                
                # Auto Coral scoring
                "auto_coral_level1": int(data.get("auto_coral_level1", 0)),
                "auto_coral_level2": int(data.get("auto_coral_level2", 0)),
                "auto_coral_level3": int(data.get("auto_coral_level3", 0)),
                "auto_coral_level4": int(data.get("auto_coral_level4", 0)),
                
                # Teleop Coral scoring
                "teleop_coral_level1": int(data.get("teleop_coral_level1", 0)),
                "teleop_coral_level2": int(data.get("teleop_coral_level2", 0)),
                "teleop_coral_level3": int(data.get("teleop_coral_level3", 0)),
                "teleop_coral_level4": int(data.get("teleop_coral_level4", 0)),
                
                # Auto Algae scoring
                "auto_algae_net": int(data.get("auto_algae_net", 0)),
                "auto_algae_processor": int(data.get("auto_algae_processor", 0)),
                
                # Teleop Algae scoring
                "teleop_algae_net": int(data.get("teleop_algae_net", 0)),
                "teleop_algae_processor": int(data.get("teleop_algae_processor", 0)),
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

    @with_mongodb_retry(retries=3, delay=2)
    def get_team_stats(self, team_number):
        """Get comprehensive stats for a team"""
        self.ensure_connected()
        try:
            pipeline = [
                {"$match": {"team_number": int(team_number)}},
                {
                    "$group": {
                        "_id": "$team_number",
                        "matches_played": {"$sum": 1},
                        "total_coral": {
                            "$sum": {
                                "$add": [
                                    "$coral_level1",
                                    "$coral_level2",
                                    "$coral_level3",
                                    "$coral_level4"
                                ]
                            }
                        },
                        "total_algae": {
                            "$sum": {"$add": ["$algae_net", "$algae_processor"]}
                        },
                        "successful_climbs": {
                            "$sum": {"$cond": ["$climb_success", 1, 0]}
                        },
                        "total_defense": {"$sum": "$defense_rating"},
                        "total_points": {"$sum": "$total_points"}
                    }
                }
            ]
            
            result = list(self.db.team_data.aggregate(pipeline))
            if not result:
                return {
                    "matches_played": 0,
                    "total_coral": 0,
                    "total_algae": 0,
                    "successful_climbs": 0,
                    "total_defense": 0,
                    "total_points": 0
                }
            
            stats = result[0]
            stats.pop("_id")  # Remove MongoDB ID
            return stats
        except Exception as e:
            logger.error(f"Error getting team stats: {str(e)}")
            return None

    @with_mongodb_retry(retries=3, delay=2)
    def get_team_matches(self, team_number):
        """Get all match data for a specific team"""
        self.ensure_connected()
        try:
            pipeline = [
                {"$match": {"team_number": int(team_number)}},
                {"$sort": {"event_code": 1, "match_number": 1}},
                {
                    "$lookup": {
                        "from": "users",
                        "localField": "scouter_id",
                        "foreignField": "_id",
                        "as": "scouter"
                    }
                },
                {"$unwind": "$scouter"}
            ]

            return list(self.db.team_data.aggregate(pipeline))
        except Exception as e:
            logger.error(f"Error getting team matches: {str(e)}")
            return []

    @with_mongodb_retry(retries=3, delay=2)
    def get_auto_paths(self, team_number):
        """Get all auto paths for a specific team"""
        self.ensure_connected()
        try:
            # Find all team data entries for this team that have auto paths
            paths = list(self.db.team_data.find(
                {
                    "team_number": int(team_number),
                    "auto_path": {"$exists": True, "$ne": ""}
                },
                {
                    "match_number": 1,
                    "event_code": 1,
                    "auto_path": 1
                }
            ).sort("match_number", 1))

            # Format the paths data
            formatted_paths = []
            for path in paths:
                if path.get("auto_path"):  # Only include if there's actually a path
                    formatted_paths.append({
                        "match_number": path.get("match_number", "Unknown"),
                        "event_code": path.get("event_code", "Unknown"),
                        "image_data": path["auto_path"]
                    })

            return formatted_paths

        except Exception as e:
            logger.error(f"Error fetching auto paths for team {team_number}: {str(e)}")
            return []

    def __del__(self):
        """Cleanup MongoDB connection"""
        if self.client:
            self.client.close()
