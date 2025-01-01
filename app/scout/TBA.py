import os
import requests
import logging

logger = logging.getLogger(__name__)

class TBAApi:
    def __init__(self):
        self.base_url = "https://www.thebluealliance.com/api/v3"
        self.headers = {
            "X-TBA-Auth-Key": os.getenv("TBA_AUTH_KEY"),
            "accept": "application/json"
        }
        self.timeout = 10  # 10 seconds timeout

    async def get_team_info(self, team_key):
        if not team_key:
            return None
        
        try:
            response = requests.get(
                f"{self.base_url}/team/{team_key}",
                headers=self.headers,
                timeout=self.timeout  # Add timeout parameter
            )
            return response.json() if response.status_code == 200 else None
        except requests.Timeout:
            logger.error(f"Request timed out for team {team_key}")
            return None
        except Exception as e:
            logger.error(f"Error fetching team info: {str(e)}")
            return None