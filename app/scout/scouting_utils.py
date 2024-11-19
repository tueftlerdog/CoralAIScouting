from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure
from bson import ObjectId
from datetime import datetime, timezone
from models import TeamData
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
                        logger.warning(
                            f"Attempt {attempt + 1} failed: {str(e)}. Retrying...")
                        time.sleep(delay)
                    else:
                        logger.error(
                            f"All {retries} attempts failed: {str(e)}")
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
                self.client = MongoClient(
                    self.mongo_uri, serverSelectionTimeoutMS=5000)
                # Test the connection
                self.client.server_info()
                self.db = self.client.get_default_database()
                logger.info("Successfully connected to MongoDB")

                # Ensure team_data collection exists
                if 'team_data' not in self.db.list_collection_names():
                    self.db.create_collection('team_data')
                    # Create indexes
                    self.db.team_data.create_index([('team_number', 1)])
                    self.db.team_data.create_index([('scouter_id', 1)])
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
            logger.warning(
                "Lost connection to MongoDB, attempting to reconnect...")
            self.connect()

    @with_mongodb_retry(retries=3, delay=2)
    def add_scouting_data(self, data, scouter_id):
        """Add new scouting data with retry mechanism"""
        self.ensure_connected()
        try:
            team_data = {
                'team_number': int(data['team_number']),
                'event_code': data['event_code'],
                'match_number': int(data['match_number']),
                'auto_points': int(data['auto_points']),
                'teleop_points': int(data['teleop_points']),
                'endgame_points': int(data['endgame_points']),
                'total_points': (int(data['auto_points']) +
                                 int(data['teleop_points']) +
                                 int(data['endgame_points'])),
                'notes': data['notes'],
                'scouter_id': ObjectId(scouter_id),
                'created_at': datetime.now(timezone.utc),
            }

            result = self.db.team_data.insert_one(team_data)
            logger.info(f"Added new scouting data for team {
                        data['team_number']}")
            return True, "Data added successfully"
        except Exception as e:
            logger.error(f"Error adding scouting data: {str(e)}")
            return False, str(e)

    @with_mongodb_retry(retries=3, delay=2)
    def get_all_scouting_data(self):
        """Get all scouting data with user information"""
        self.ensure_connected()
        try:
            pipeline = [
                {
                    '$lookup': {
                        'from': 'users',
                        'localField': 'scouter_id',
                        'foreignField': '_id',
                        'as': 'scouter'
                    }
                },
                {
                    '$unwind': {
                        'path': '$scouter',
                        'preserveNullAndEmptyArrays': True
                    }
                }
            ]

            team_data = list(self.db.team_data.aggregate(pipeline))
            return [TeamData.create_from_db(td) for td in team_data]
        except Exception as e:
            logger.error(f"Error fetching scouting data: {str(e)}")
            return []

    @with_mongodb_retry(retries=3, delay=2)
    def get_team_data(self, team_id, scouter_id=None):
        """Get specific team data with optional scouter verification"""
        self.ensure_connected()
        try:
            query = {'_id': ObjectId(team_id)}
            if scouter_id:  # If scouter_id provided, verify ownership
                query['scouter_id'] = ObjectId(scouter_id)

            data = self.db.team_data.find_one(query)
            if not data:
                return None

            # Add an is_owner field to the response
            data['is_owner'] = str(data['scouter_id']) == str(
                scouter_id) if scouter_id else False
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
            existing_data = self.db.team_data.find_one({
                '_id': ObjectId(team_id),
                'scouter_id': ObjectId(scouter_id)
            })

            if not existing_data:
                logger.warning(
                    f"Update attempted by non-owner scouter_id: {scouter_id}")
                return False

            updated_data = {
                'team_number': int(data['team_number']),
                'event_code': data['event_code'],
                'match_number': int(data['match_number']),
                'auto_points': int(data['auto_points']),
                'teleop_points': int(data['teleop_points']),
                'endgame_points': int(data['endgame_points']),
                'total_points': (int(data['auto_points']) +
                                 int(data['teleop_points']) +
                                 int(data['endgame_points'])),
                'notes': data['notes']
            }

            result = self.db.team_data.update_one(
                {'_id': ObjectId(team_id), 'scouter_id': ObjectId(scouter_id)},
                {'$set': updated_data}
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
            result = self.db.team_data.delete_one({
                '_id': ObjectId(team_id),
                'scouter_id': ObjectId(scouter_id)
            })
            return result.deleted_count > 0
        except Exception as e:
            logger.error(f"Error deleting team data: {str(e)}")
            return False

    def __del__(self):
        """Cleanup MongoDB connection"""
        if self.client:
            self.client.close()
