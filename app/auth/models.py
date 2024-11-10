from tortoise import fields
from tortoise.models import Model
from werkzeug.security import check_password_hash
from datetime import datetime
from flask_login import UserMixin

class User(Model, UserMixin):
    id = fields.IntField(pk=True)
    email = fields.CharField(max_length=255, unique=True)
    username = fields.CharField(max_length=255, null=True)
    teamNumber = fields.IntField()
    password_hash = fields.CharField(max_length=255)
    role = fields.CharField(max_length=50, default="user")
    last_login = fields.DatetimeField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    def get_id(self):
        return str(self.id)

    def is_authenticated(self):
        return True

    def is_active(self):
        return True

    def is_anonymous(self):
        return False

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    async def update_last_login(self):
        self.last_login = datetime.utcnow()
        await self.save()

    class Meta:
        table = "users"

class TeamData(Model):
    id = fields.IntField(pk=True)
    team_number = fields.IntField()
    event_code = fields.CharField(max_length=20)
    match_number = fields.IntField()
    auto_points = fields.IntField()
    teleop_points = fields.IntField()
    endgame_points = fields.IntField()
    total_points = fields.IntField()
    notes = fields.TextField(null=True)
    scouter = fields.ForeignKeyField('models.User', related_name='scouting_records')
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "team_data"

    @property
    def scouter_name(self):
        return f"{self.scouter.username} ({self.scouter.teamNumber})" if self.scouter else "Unknown"