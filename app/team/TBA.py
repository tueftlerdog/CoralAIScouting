import aiohttp
import asyncio
from typing import Optional, List, Dict
from dataclasses import dataclass

from flask import jsonify


@dataclass
class TBAInterface:
    """Async interface for The Blue Alliance API"""
    
    def __init__(self, auth_key: str = "uTHeEfPigDp9huQCpLNkWK7FBQIb01Qrzvt4MAjh9z2WQDkrsvNE77ch6bOPvPb6"):
        self.auth_key = auth_key
        self.base_url = "https://www.thebluealliance.com/api/v3"
        self.headers = {"X-TBA-Auth-Key": self.auth_key}
        self.teams: Optional[List[Dict]] = None
        self.schedule: Optional[List[Dict]] = None
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession(headers=self.headers)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()

    async def get_teams_at_event(self, event_code: str) -> Optional[List[Dict]]:
        """
        Get list of teams in event
        
        Args:
            event_code (str): The event code (i.e. 2020caln) to pull the team list
            
        Returns:
            Optional[List[Dict]]: List of team data or None if request fails
        """
        if not self.auth_key:
            raise ValueError("No auth key provided")
            
        url = f"{self.base_url}/event/{event_code}/teams/simple"
        
        try:
            if not self.session:
                self.session = aiohttp.ClientSession(headers=self.headers)
                
            async with self.session.get(url) as response:
                response.raise_for_status()
                self.teams = await response.json()
                return self.teams
                
        except aiohttp.ClientError as e:
            raise e
        
    async def get_schedule(self, event_code: str) -> Optional[List[Dict]]:
        """
        Get schedule for event
        
        Args:
            event_code (str): The event code (i.e. 2020caln) to pull the schedule
            
        Returns:
            Optional[List[Dict]]: List of match data or None if request fails
        """
        if not self.auth_key:
            raise ValueError("No auth key provided")
            
        url = f"{self.base_url}/event/{event_code}/matches/simple"
        
        try:
            if not self.session:
                self.session = aiohttp.ClientSession(headers=self.headers)
                
            async with self.session.get(url) as response:
                response.raise_for_status()
                self.schedule = await response.json()
                return self.schedule
                
        except aiohttp.ClientError as e:
            raise e

    async def get_event_data(self, event_code: str) -> tuple[Optional[List[Dict]], Optional[List[Dict]]]:
        """
        Get both teams and schedule data for an event concurrently
        
        Args:
            event_code (str): The event code (i.e. 2020caln)
            
        Returns:
            tuple[Optional[List[Dict]], Optional[List[Dict]]]: Tuple of (teams, schedule) data
        """
        async with self:  # Use context manager to handle session
            teams_task = asyncio.create_task(self.get_teams_at_event(event_code))
            schedule_task = asyncio.create_task(self.get_schedule(event_code))
            
            teams, schedule = await asyncio.gather(teams_task, schedule_task)
            return teams, schedule

    @staticmethod
    def teams(teams: List[Dict]):
        """Helper method to print team information"""
        if not teams:
            raise ValueError("No team data to print")

        return teams

    @staticmethod
    def print_schedule(schedule: List[Dict]):
        """Helper method to print schedule information"""
        if not schedule:
            raise ValueError("No schedule data to print")
            
        return schedule