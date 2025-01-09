import asyncio
from functools import wraps
import aiohttp
from flask import Blueprint, current_app, flash, render_template, request, redirect, url_for, jsonify
from flask_login import login_required, current_user
from app.scout.scouting_utils import ScoutingManager
from .TBA import TBAInterface
from bson import ObjectId
from gridfs import GridFS
import base64
from bson import json_util
import json

scouting_bp = Blueprint("scouting", __name__)
scouting_manager = None


@scouting_bp.record
def on_blueprint_init(state):
    global scouting_manager
    app = state.app
    scouting_manager = ScoutingManager(app.config["MONGO_URI"])


def async_route(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        return asyncio.run(f(*args, **kwargs))

    return wrapper


@scouting_bp.route("/scouting/add", methods=["GET", "POST"])
@login_required
def add_scouting_data():
    if request.method == "POST":
        data = request.get_json() if request.is_json else request.form.to_dict()
        
        success, message = scouting_manager.add_scouting_data(
            data, current_user.get_id()
        )

        if success:
            flash("Team data added successfully", "success")
        else:
            flash(f"Error adding data: {message}", "error")

        return redirect(url_for("scouting.list_scouting_data"))

    return render_template("scouting/add.html")


@scouting_bp.route("/scouting/list")
@scouting_bp.route("/scouting")
@login_required
def list_scouting_data():
    try:
        team_data = scouting_manager.get_all_scouting_data()
        return render_template("scouting/list.html", team_data=team_data)
    except Exception as e:
        current_app.logger.error(f"Error fetching scouting data: {str(e)}", exc_info=True)
        flash("Unable to fetch scouting data. Please try again later.", "error")
        return render_template("scouting/list.html", team_data=[])


@scouting_bp.route("/scouting/edit/<string:id>", methods=["GET", "POST"])
@login_required
def edit_scouting_data(id):
    try:
        team_data = scouting_manager.get_team_data(id, current_user.get_id())

        if not team_data:
            flash("Team data not found", "error")
            return redirect(url_for("scouting.list_scouting_data"))

        if not team_data.is_owner:
            flash("Access denied", "error")
            return redirect(url_for("scouting.list_scouting_data"))

        if request.method == "POST":
            if scouting_manager.update_team_data(id, request.form, current_user.get_id()):
                flash("Data updated successfully", "success")
                return redirect(url_for("scouting.list_scouting_data"))
            flash("Unable to update data", "error")

        return render_template("scouting/edit.html", team_data=team_data)
    except Exception as e:
        current_app.logger.error(f"Error in edit_scouting_data: {str(e)}", exc_info=True)
        flash("An error occurred while processing your request", "error")
        return redirect(url_for("scouting.list_scouting_data"))


@scouting_bp.route("/scouting/delete/<string:id>")
@login_required
def delete_scouting_data(id):
    try:
        if scouting_manager.delete_team_data(id, current_user.get_id()):
            flash("Record deleted successfully", "success")
        else:
            flash("Error deleting record or permission denied", "error")
    except Exception as e:
        flash(f"Error: {str(e)}", "error")
    return redirect(url_for("scouting.list_scouting_data"))


@scouting_bp.route("/compare")
@login_required
def compare_page():
    return render_template("compare.html")

def format_team_stats(stats):
    """Format team stats with calculated totals"""
    return {
        "matches_played": stats.get("matches_played", 0),
        "auto_coral_total": sum([
            stats.get("avg_auto_coral_level1", 0),
            stats.get("avg_auto_coral_level2", 0),
            stats.get("avg_auto_coral_level3", 0),
            stats.get("avg_auto_coral_level4", 0)
        ]),
        "teleop_coral_total": sum([
            stats.get("avg_teleop_coral_level1", 0),
            stats.get("avg_teleop_coral_level2", 0),
            stats.get("avg_teleop_coral_level3", 0),
            stats.get("avg_teleop_coral_level4", 0)
        ]),
        "auto_algae_total": sum([
            stats.get("avg_auto_algae_net", 0),
            stats.get("avg_auto_algae_processor", 0)
        ]),
        "teleop_algae_total": sum([
            stats.get("avg_teleop_algae_net", 0),
            stats.get("avg_teleop_algae_processor", 0)
        ]),
        "human_player": stats.get("avg_human_player", 0),
        "climb_success_rate": stats.get("climb_success_rate", 0) * 100
    }


@scouting_bp.route("/api/compare")
@login_required
def compare_teams():
    try:
        teams = []
        for i in range(1, 4):  # Support up to 3 teams
            team_num = request.args.get(f'team{i}')
            if team_num:
                teams.append(team_num)

        if len(teams) < 2:
            return jsonify({"error": "At least 2 teams are required"}), 400

        teams_data = {}
        for team_num in teams:
            try:
                # Get team stats from database
                pipeline = [
                    {"$match": {"team_number": int(team_num)}},
                    {"$group": {
                        "_id": "$team_number",
                        "matches_played": {"$sum": 1},
                        "auto_coral_level1": {"$avg": {"$ifNull": ["$auto_coral_level1", 0]}},
                        "auto_coral_level2": {"$avg": {"$ifNull": ["$auto_coral_level2", 0]}},
                        "auto_coral_level3": {"$avg": {"$ifNull": ["$auto_coral_level3", 0]}},
                        "auto_coral_level4": {"$avg": {"$ifNull": ["$auto_coral_level4", 0]}},
                        "auto_algae_net": {"$avg": {"$ifNull": ["$auto_algae_net", 0]}},
                        "auto_algae_processor": {"$avg": {"$ifNull": ["$auto_algae_processor", 0]}},
                        "teleop_coral_level1": {"$avg": {"$ifNull": ["$teleop_coral_level1", 0]}},
                        "teleop_coral_level2": {"$avg": {"$ifNull": ["$teleop_coral_level2", 0]}},
                        "teleop_coral_level3": {"$avg": {"$ifNull": ["$teleop_coral_level3", 0]}},
                        "teleop_coral_level4": {"$avg": {"$ifNull": ["$teleop_coral_level4", 0]}},
                        "teleop_algae_net": {"$avg": {"$ifNull": ["$teleop_algae_net", 0]}},
                        "teleop_algae_processor": {"$avg": {"$ifNull": ["$teleop_algae_processor", 0]}},
                        "auto_path": {"$last": "$auto_path"},
                        "climb_success_rate": {
                            "$avg": {"$cond": [{"$eq": ["$climb_success", True]}, 100, 0]}
                        },
                        "preferred_climb_type": {"$last": "$climb_type"},
                        "total_coral": {"$sum": {
                            "$add": [
                                "$auto_coral_level1", "$auto_coral_level2",
                                "$auto_coral_level3", "$auto_coral_level4",
                                "$teleop_coral_level1", "$teleop_coral_level2",
                                "$teleop_coral_level3", "$teleop_coral_level4"
                            ]
                        }},
                        "total_algae": {"$sum": {
                            "$add": [
                                "$auto_algae_net", "$auto_algae_processor",
                                "$teleop_algae_net", "$teleop_algae_processor"
                            ]
                        }},
                        "human_player": {"$avg": "$human_player"},
                        "defense_rating": {"$avg": "$defense_rating"},
                        "successful_climbs": {
                            "$sum": {"$cond": ["$climb_success", 1, 0]}
                        },
                    }}
                ]

                stats = list(scouting_manager.db.team_data.aggregate(pipeline))
                
                # Get the 5 most recent matches and convert ObjectId to string
                matches = list(scouting_manager.db.team_data.aggregate([
                    {"$match": {"team_number": int(team_num)}},
                    {
                        "$lookup": {
                            "from": "users",
                            "localField": "scouter_id",
                            "foreignField": "_id",
                            "as": "scouter"
                        }
                    },
                    {"$unwind": {
                        "path": "$scouter",
                        "preserveNullAndEmptyArrays": True
                    }},
                    {"$sort": {"match_number": -1}},
                    {"$limit": 5},
                    {
                        "$project": {
                            "_id": 1,
                            "team_number": 1,
                            "match_number": 1,
                            "event_code": 1,
                            "alliance": 1,
                            "auto_coral_level1": 1,
                            "auto_coral_level2": 1,
                            "auto_coral_level3": 1,
                            "auto_coral_level4": 1,
                            "auto_algae_net": 1,
                            "auto_algae_processor": 1,
                            "teleop_coral_level1": 1,
                            "teleop_coral_level2": 1,
                            "teleop_coral_level3": 1,
                            "teleop_coral_level4": 1,
                            "teleop_algae_net": 1,
                            "teleop_algae_processor": 1,
                            "human_player": 1,
                            "climb_type": 1,
                            "climb_success": 1,
                            "defense_rating": 1,
                            "auto_path": 1,
                            "auto_notes": 1,
                            "notes": 1,
                            "scouter_name": "$scouter.username",
                            "scouter_team": "$scouter.teamNumber",
                            "profile_picture": "$scouter.profile_picture"
                        }
                    }
                ]))

                # Convert ObjectId to string in matches
                for match in matches:
                    match['_id'] = str(match['_id'])

                # Get team info from TBA
                team_key = f"frc{team_num}"
                team_info = TBAInterface().get_team(team_key)

                # Get auto paths
                auto_paths = scouting_manager.get_auto_paths(team_num)

                # Calculate normalized stats for radar chart
                if stats and stats[0]["matches_played"] > 0:
                    matches_played = stats[0]["matches_played"]
                    normalized_stats = {
                        "auto_scoring": (stats[0]["total_coral"] / matches_played) / 20,
                        "teleop_scoring": (stats[0]["total_algae"] / matches_played) / 20,
                        "climb_rating": (stats[0]["successful_climbs"] / matches_played) / 20,
                        "defense_rating": stats[0]["defense_rating"],
                        "human_player": stats[0]["human_player"]
                    }
                else:
                    normalized_stats = {
                        "auto_scoring": 0,
                        "teleop_scoring": 0,
                        "climb_rating": 0,
                        "defense_rating": 0,
                        "human_player": 0
                    }

                # Convert ObjectId in stats
                if stats and '_id' in stats[0]:
                    stats[0]['_id'] = str(stats[0]['_id'])

                teams_data[team_num] = {
                    "team_number": int(team_num),
                    "nickname": team_info.get("nickname", "Unknown"),
                    "school_name": team_info.get("school_name"),
                    "city": team_info.get("city"),
                    "state_prov": team_info.get("state_prov"),
                    "country": team_info.get("country"),
                    "stats": stats[0] if stats else {},
                    "normalized_stats": normalized_stats,
                    "matches": matches,
                    "auto_paths": auto_paths,
                }

            except Exception as team_error:
                print(f"Error processing team {team_num}: {str(team_error)}")
                teams_data[team_num] = {
                    "team_number": int(team_num),
                    "error": str(team_error)
                }

        return json.loads(json_util.dumps(teams_data))

    except Exception as e:
        print(f"Error in compare_teams: {str(e)}")
        return jsonify({"error": "An error occurred while comparing teams"}), 500

@scouting_bp.route("/search")
@login_required
def search_page():
    return render_template("search.html")


@scouting_bp.route("/api/search")
@login_required
@async_route
async def search_teams():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify([])

    try:
        tba = TBAInterface()
        team_key = f"frc{query}"
        url = f"{tba.base_url}/team/{team_key}"

        async with aiohttp.ClientSession(headers=tba.headers) as session:
            async with session.get(url) as response:
                if response.status != 200:
                    return jsonify([])
                team = await response.json()

        # Fetch all scouting data for this team
        pipeline = [
            {"$match": {"team_number": int(query)}},
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
                    "coral_level1": 1,
                    "coral_level2": 1,
                    "coral_level3": 1,
                    "coral_level4": 1,
                    "algae_net": 1,
                    "algae_processor": 1,
                    "human_player": 1,
                    "climb_type": 1,
                    "climb_success": 1,
                    "defense_rating": 1,
                    "defense_notes": 1,
                    "human_player": 1,
                    "defense_rating": 1,
                    "auto_path": 1,
                    "auto_notes": 1,
                    "total_points": 1,
                    "notes": 1,
                    "alliance": 1,
                    "scouter_id": 1,
                    "scouter_name": "$scouter.username",
                    "scouter_team": "$scouter.teamNumber"
                }
            }
        ]

        team_scouting_data = list(scouting_manager.db.team_data.aggregate(pipeline))
        
        # Calculate statistics
        matches_played = len(team_scouting_data)
        if matches_played > 0:
            coral_totals = [sum([
                entry["coral_level1"],
                entry["coral_level2"],
                entry["coral_level3"],
                entry["coral_level4"]
            ]) for entry in team_scouting_data]
            
            algae_totals = [
                entry["algae_net"] + entry["algae_processor"]
                for entry in team_scouting_data
            ]
            
            successful_climbs = sum(bool(entry["climb_success"])
                                for entry in team_scouting_data)
            
            stats = {
                "matches_played": matches_played,
                "coral_stats": {
                    "auto": {
                        "level1": sum(entry["auto_coral_level1"] for entry in team_scouting_data) / matches_played,
                        "level2": sum(entry["auto_coral_level2"] for entry in team_scouting_data) / matches_played,
                        "level3": sum(entry["auto_coral_level3"] for entry in team_scouting_data) / matches_played,
                        "level4": sum(entry["auto_coral_level4"] for entry in team_scouting_data) / matches_played,
                    },
                    "teleop": {
                        "level1": sum(entry["teleop_coral_level1"] for entry in team_scouting_data) / matches_played,
                        "level2": sum(entry["teleop_coral_level2"] for entry in team_scouting_data) / matches_played,
                        "level3": sum(entry["teleop_coral_level3"] for entry in team_scouting_data) / matches_played,
                        "level4": sum(entry["teleop_coral_level4"] for entry in team_scouting_data) / matches_played,
                    }
                },
                "algae_stats": {
                    "auto": {
                        "net": sum(entry["auto_algae_net"] for entry in team_scouting_data) / matches_played,
                        "processor": sum(entry["auto_algae_processor"] for entry in team_scouting_data) / matches_played,
                    },
                    "teleop": {
                        "net": sum(entry["teleop_algae_net"] for entry in team_scouting_data) / matches_played,
                        "processor": sum(entry["teleop_algae_processor"] for entry in team_scouting_data) / matches_played,
                    }
                },
                "human_player": sum(entry["human_player"] for entry in team_scouting_data) / matches_played,
                "climb_success_rate": sum(bool(entry["climb_success"]) for entry in team_scouting_data) / matches_played,
                "avg_defense": sum(entry["defense_rating"] for entry in team_scouting_data) / matches_played
            }
        else:
            stats = {
                "matches_played": 0,
                "coral_stats": {
                    "auto": {
                        "level1": 0,
                        "level2": 0,
                        "level3": 0,
                        "level4": 0
                    },
                    "teleop": {
                        "level1": 0,
                        "level2": 0,
                        "level3": 0,
                        "level4": 0
                    }
                },
                "algae_stats": {
                    "auto": {
                        "net": 0,
                        "processor": 0
                    },
                    "teleop": {
                        "net": 0,
                        "processor": 0
                    }
                },
                "human_player": 0,
                "defense_rating": 0,
                "climb_success_rate": 0,
                "avg_defense": 0
            }

        scouting_entries = [
            {
                "id": str(entry["_id"]),
                "event_code": entry["event_code"],
                "match_number": entry["match_number"],
                "auto_points": entry["auto_points"],
                "teleop_points": entry["teleop_points"],
                "endgame_points": entry["endgame_points"],
                "total_points": entry["total_points"],
                "notes": entry["notes"],
                "scouter": entry["scouter"]["username"],
            }
            for entry in team_scouting_data
        ]

        return jsonify(
            [
                {
                    "team_number": team["team_number"],
                    "nickname": team["nickname"],
                    "school_name": team.get("school_name"),
                    "city": team.get("city"),
                    "state_prov": team.get("state_prov"),
                    "country": team.get("country"),
                    "scouting_data": scouting_entries,
                    "has_team_page": scouting_manager.has_team_data(team["team_number"]),
                    "stats": stats
                }
            ]
        )

    except Exception as e:
        print(f"Error searching teams: {e}")
        return jsonify({"error": "Failed to fetch team data"}), 500


@scouting_bp.route("/scouting/sync", methods=["POST"])
@login_required
def sync_scouting_data():
    try:
        data = request.json
        success, message = scouting_manager.add_scouting_data(
            data, current_user.get_id()
        )

        if success:
            flash("Data synced successfully", "success")
        else:
            flash(f"Sync error: {message}", "error")

        return jsonify(
            {
                "success": success,
                "message": message,
                "redirect": url_for("scouting.list_scouting_data"),
            }
        )
    except Exception as e:
        flash(f"Error during sync: {str(e)}", "error")
        return (
            jsonify(
                {
                    "success": False,
                    "message": str(e),
                    "redirect": url_for("scouting.list_scouting_data"),
                }
            ),
            500,
        )


@scouting_bp.route("/leaderboard")
def leaderboard():
    try:
        MIN_MATCHES = 1
        sort_type = request.args.get('sort', 'coral')
        
        pipeline = [
            {"$group": {
                "_id": "$team_number",
                "matches_played": {"$sum": 1},
                # Auto Coral
                "auto_coral_level1": {"$avg": {"$ifNull": ["$auto_coral_level1", 0]}},
                "auto_coral_level2": {"$avg": {"$ifNull": ["$auto_coral_level2", 0]}},
                "auto_coral_level3": {"$avg": {"$ifNull": ["$auto_coral_level3", 0]}},
                "auto_coral_level4": {"$avg": {"$ifNull": ["$auto_coral_level4", 0]}},
                # Teleop Coral
                "teleop_coral_level1": {"$avg": {"$ifNull": ["$teleop_coral_level1", 0]}},
                "teleop_coral_level2": {"$avg": {"$ifNull": ["$teleop_coral_level2", 0]}},
                "teleop_coral_level3": {"$avg": {"$ifNull": ["$teleop_coral_level3", 0]}},
                "teleop_coral_level4": {"$avg": {"$ifNull": ["$teleop_coral_level4", 0]}},
                # Auto Algae
                "auto_algae_net": {"$avg": {"$ifNull": ["$auto_algae_net", 0]}},
                "auto_algae_processor": {"$avg": {"$ifNull": ["$auto_algae_processor", 0]}},
                # Teleop Algae
                "teleop_algae_net": {"$avg": {"$ifNull": ["$teleop_algae_net", 0]}},
                "teleop_algae_processor": {"$avg": {"$ifNull": ["$teleop_algae_processor", 0]}},

                # Human Player
                "human_player": {"$avg": {"$ifNull": ["$human_player", 0]}},
                
                # Defense Rating
                "defense_rating": {"$avg": {"$ifNull": ["$defense_rating", 0]}},

                # Climb stats
                "climb_attempts": {"$sum": 1},
                "climb_successes": {
                    "$sum": {"$cond": [{"$eq": ["$climb_success", True]}, 1, 0]}
                },
                "deep_climb_attempts": {
                    "$sum": {"$cond": [{"$eq": ["$climb_type", "deep"]}, 1, 0]}
                },
                "deep_climb_successes": {
                    "$sum": {
                        "$cond": [
                            {"$and": [
                                {"$eq": ["$climb_type", "deep"]},
                                {"$eq": ["$climb_success", True]}
                            ]},
                            1,
                            0
                        ]
                    }
                }
            }},
            {"$match": {"matches_played": {"$gte": MIN_MATCHES}}},
            {"$project": {
                "team_number": "$_id",
                "matches_played": 1,
                "auto_coral_stats": {
                    "level1": "$auto_coral_level1",
                    "level2": "$auto_coral_level2",
                    "level3": "$auto_coral_level3",
                    "level4": "$auto_coral_level4"
                },
                "teleop_coral_stats": {
                    "level1": "$teleop_coral_level1",
                    "level2": "$teleop_coral_level2",
                    "level3": "$teleop_coral_level3",
                    "level4": "$teleop_coral_level4"
                },
                "auto_algae_stats": {
                    "net": "$auto_algae_net",
                    "processor": "$auto_algae_processor"
                },
                "teleop_algae_stats": {
                    "net": "$teleop_algae_net",
                    "processor": "$teleop_algae_processor"
                },
                # Calculate totals for each category
                "total_coral": {
                    "$add": [
                        "$auto_coral_level1", "$auto_coral_level2", 
                        "$auto_coral_level3", "$auto_coral_level4",
                        "$teleop_coral_level1", "$teleop_coral_level2", 
                        "$teleop_coral_level3", "$teleop_coral_level4"
                    ]
                },
                "total_auto_coral": {
                    "$add": [
                        "$auto_coral_level1", "$auto_coral_level2", 
                        "$auto_coral_level3", "$auto_coral_level4"
                    ]
                },
                "total_teleop_coral": {
                    "$add": [
                        "$teleop_coral_level1", "$teleop_coral_level2", 
                        "$teleop_coral_level3", "$teleop_coral_level4"
                    ]
                },
                "total_algae": {
                    "$add": [
                        "$auto_algae_net", "$auto_algae_processor",
                        "$teleop_algae_net", "$teleop_algae_processor"
                    ]
                },
                "total_auto_algae": {
                    "$add": ["$auto_algae_net", "$auto_algae_processor"]
                },
                "total_teleop_algae": {
                    "$add": ["$teleop_algae_net", "$teleop_algae_processor"]
                },
                "climb_success_rate": {
                    "$multiply": [
                        {"$cond": [
                            {"$gt": ["$climb_attempts", 0]},
                            {"$divide": ["$climb_successes", "$climb_attempts"]},
                            0
                        ]},
                        100
                    ]
                },
                "deep_climb_success_rate": {
                    "$multiply": [
                        {"$cond": [
                            {"$gt": ["$deep_climb_attempts", 0]},
                            {"$divide": ["$deep_climb_successes", "$deep_climb_attempts"]},
                            0
                        ]},
                        100
                    ]
                }
            }}
        ]

        # Add sorting based on selected type
        sort_field = {
            'coral': 'total_coral',
            'auto_coral': 'total_auto_coral',
            'teleop_coral': 'total_teleop_coral',
            'algae': 'total_algae',
            'auto_algae': 'total_auto_algae',
            'teleop_algae': 'total_teleop_algae',
            'deep_climb': 'deep_climb_success_rate',
            'human_player': 'human_player',
            'defense_rating': 'defense_rating'
        }.get(sort_type, 'total_coral')

        if sort_type == 'deep_climb':
            pipeline.insert(-1, {
                "$match": {
                    "deep_climb_attempts": {"$gt": 0}
                }
            })

        pipeline.append({"$sort": {sort_field: -1}})

        teams = list(scouting_manager.db.team_data.aggregate(pipeline))
        return render_template("scouting/leaderboard.html", teams=teams, current_sort=sort_type)
    except Exception as e:
        print(f"Error in leaderboard: {str(e)}")
        flash(f"Error loading leaderboard: {str(e)}", "error")
        return render_template("scouting/leaderboard.html", teams=[], current_sort='coral')


@scouting_bp.route("/scouting/matches")
@login_required
def matches():
    try:
        pipeline = [
            {
                "$group": {
                    "_id": {
                        "event": "$event_code",
                        "match": "$match_number"
                    },
                    "teams": {
                        "$push": {
                            "number": "$team_number",
                            "alliance": "$alliance",
                            # Auto period
                            "auto_coral_level1": {"$ifNull": ["$auto_coral_level1", 0]},
                            "auto_coral_level2": {"$ifNull": ["$auto_coral_level2", 0]},
                            "auto_coral_level3": {"$ifNull": ["$auto_coral_level3", 0]},
                            "auto_coral_level4": {"$ifNull": ["$auto_coral_level4", 0]},
                            "auto_algae_net": {"$ifNull": ["$auto_algae_net", 0]},
                            "auto_algae_processor": {"$ifNull": ["$auto_algae_processor", 0]},
                            # Teleop period
                            "teleop_coral_level1": {"$ifNull": ["$teleop_coral_level1", 0]},
                            "teleop_coral_level2": {"$ifNull": ["$teleop_coral_level2", 0]},
                            "teleop_coral_level3": {"$ifNull": ["$teleop_coral_level3", 0]},
                            "teleop_coral_level4": {"$ifNull": ["$teleop_coral_level4", 0]},
                            "teleop_algae_net": {"$ifNull": ["$teleop_algae_net", 0]},
                            "teleop_algae_processor": {"$ifNull": ["$teleop_algae_processor", 0]},
                            "climb_type": "$climb_type",
                            "climb_success": "$climb_success"
                        }
                    }
                }
            },
            {"$sort": {"_id.event": 1, "_id.match": 1}}
        ]
        
        match_data = list(scouting_manager.db.team_data.aggregate(pipeline))
        matches = []
        
        for match in match_data:
            red_teams = [t for t in match["teams"] if t["alliance"] == "red"]
            blue_teams = [t for t in match["teams"] if t["alliance"] == "blue"]
            
            # Calculate alliance totals
            red_coral = {
                "level1": sum(t["auto_coral_level1"] + t["teleop_coral_level1"] for t in red_teams),
                "level2": sum(t["auto_coral_level2"] + t["teleop_coral_level2"] for t in red_teams),
                "level3": sum(t["auto_coral_level3"] + t["teleop_coral_level3"] for t in red_teams),
                "level4": sum(t["auto_coral_level4"] + t["teleop_coral_level4"] for t in red_teams)
            }
            
            red_algae = {
                "net": sum(t["auto_algae_net"] + t["teleop_algae_net"] for t in red_teams),
                "processor": sum(t["auto_algae_processor"] + t["teleop_algae_processor"] for t in red_teams)
            }
            
            blue_coral = {
                "level1": sum(t["auto_coral_level1"] + t["teleop_coral_level1"] for t in blue_teams),
                "level2": sum(t["auto_coral_level2"] + t["teleop_coral_level2"] for t in blue_teams),
                "level3": sum(t["auto_coral_level3"] + t["teleop_coral_level3"] for t in blue_teams),
                "level4": sum(t["auto_coral_level4"] + t["teleop_coral_level4"] for t in blue_teams)
            }
            
            blue_algae = {
                "net": sum(t["auto_algae_net"] + t["teleop_algae_net"] for t in blue_teams),
                "processor": sum(t["auto_algae_processor"] + t["teleop_algae_processor"] for t in blue_teams)
            }
            
            # Prepare team data for template
            red_team_data = [{
                "number": t["number"],
                "coral_level1": t["auto_coral_level1"] + t["teleop_coral_level1"],
                "coral_level2": t["auto_coral_level2"] + t["teleop_coral_level2"],
                "coral_level3": t["auto_coral_level3"] + t["teleop_coral_level3"],
                "coral_level4": t["auto_coral_level4"] + t["teleop_coral_level4"],
                "algae_net": t["auto_algae_net"] + t["teleop_algae_net"],
                "algae_processor": t["auto_algae_processor"] + t["teleop_algae_processor"],
                "climb_type": t["climb_type"],
                "climb_success": t["climb_success"]
            } for t in red_teams]

            blue_team_data = [{
                "number": t["number"],
                "coral_level1": t["auto_coral_level1"] + t["teleop_coral_level1"],
                "coral_level2": t["auto_coral_level2"] + t["teleop_coral_level2"],
                "coral_level3": t["auto_coral_level3"] + t["teleop_coral_level3"],
                "coral_level4": t["auto_coral_level4"] + t["teleop_coral_level4"],
                "algae_net": t["auto_algae_net"] + t["teleop_algae_net"],
                "algae_processor": t["auto_algae_processor"] + t["teleop_algae_processor"],
                "climb_type": t["climb_type"],
                "climb_success": t["climb_success"]
            } for t in blue_teams]
            
            matches.append({
                "event_code": match["_id"]["event"],
                "match_number": match["_id"]["match"],
                "red_teams": red_team_data,
                "blue_teams": blue_team_data,
                "red_coral": red_coral,
                "red_algae": red_algae,
                "blue_coral": blue_coral,
                "blue_algae": blue_algae
            })
        
        return render_template("scouting/matches.html", matches=matches)
        
    except Exception as e:
        current_app.logger.error(f"Error fetching matches: {str(e)}", exc_info=True)
        flash(f"Error fetching matches: {str(e)}", "error")
        return render_template("scouting/matches.html", matches=[])

@scouting_bp.route("/team/<int:team_number>")
@login_required
def view_team(team_number):
    try:
        matches = scouting_manager.get_team_matches(team_number)
        stats = scouting_manager.get_team_stats(team_number)
        
        # Calculate averages and success rates
        if stats["matches_played"] > 0:
            stats["avg_coral"] = (
                stats["total_coral"] / stats["matches_played"]
            )
            stats["avg_algae"] = (
                stats["total_algae"] / stats["matches_played"]
            )
            stats["climb_success_rate"] = (
                stats["successful_climbs"] / stats["matches_played"]
            )
        else:
            stats.update({
                "avg_coral": 0,
                "avg_algae": 0,
                "climb_success_rate": 0
            })
            
        return render_template(
            "scouting/team.html",
            team_number=team_number,
            matches=matches,
            stats=stats
        )
    except Exception as e:
        flash(f"Error fetching team data: {str(e)}", "error")
        return redirect(url_for("scouting.list_scouting_data"))

@scouting_bp.route("/scouting/check_team")
@login_required
def check_team():
    team_number = request.args.get('team')
    event_code = request.args.get('event')
    match_number = request.args.get('match')
    current_id = request.args.get('current_id')  # ID of the entry being edited
    
    try:
        query = {
            "team_number": int(team_number),
            "event_code": event_code,
            "match_number": int(match_number)
        }
        
        # If editing, exclude the current entry from the check
        if current_id:
            query["_id"] = {"$ne": ObjectId(current_id)}
            
        existing = scouting_manager.db.team_data.find_one(query)
        
        return jsonify({"exists": existing is not None})
    except Exception as e:
        return jsonify({"error": str(e)}), 500