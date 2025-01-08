import asyncio
from functools import wraps
import aiohttp
from flask import Blueprint, flash, render_template, request, redirect, url_for, jsonify
from flask_login import login_required, current_user
from app.scout.scouting_utils import ScoutingManager
from .TBA import TBAInterface
from bson import ObjectId

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
        flash(f"Error fetching data: {str(e)}", "error")
        return render_template("scouting/list.html", team_data=[])


@scouting_bp.route("/scouting/edit/<string:id>", methods=["GET", "POST"])
@login_required
def edit_scouting_data(id):
    try:
        team_data = scouting_manager.get_team_data(id, current_user.get_id())

        if not team_data:
            flash(
                "Team data not found or you do not have permission to edit it", "error"
            )
            return redirect(url_for("scouting.list_scouting_data"))

        if not team_data.is_owner:
            flash("You do not have permission to edit this entry", "error")
            return redirect(url_for("scouting.list_scouting_data"))

        if request.method == "POST":
            if scouting_manager.update_team_data(
                id, request.form, current_user.get_id()
            ):
                flash("Data updated successfully", "success")
                return redirect(url_for("scouting.list_scouting_data"))
            else:
                flash("Error updating data", "error")

        return render_template("scouting/edit.html", team_data=team_data)
    except Exception as e:
        flash(f"Error: {str(e)}", "error")
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


@scouting_bp.route("/api/compare")
@login_required
@async_route
async def compare_teams():
    team1 = request.args.get("team1", "").strip()
    team2 = request.args.get("team2", "").strip()

    if not team1 or not team2:
        return jsonify({"error": "Both team numbers are required"}), 400

    try:
        tba = TBAInterface()
        teams_data = {}

        for team_num in [team1, team2]:
            # Fetch TBA team info using async client
            team_key = f"frc{team_num}"
            url = f"{tba.base_url}/team/{team_key}"

            async with aiohttp.ClientSession(headers=tba.headers) as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        return jsonify({"error": f"Team {team_num} not found"}), 404
                    team = await response.json()

            # Fetch all scouting data for this team from MongoDB
            pipeline = [
                {"$match": {"team_number": int(team_num)}},
                {
                    "$lookup": {
                        "from": "users",
                        "localField": "scouter_id",
                        "foreignField": "_id",
                        "as": "scouter",
                    }
                },
                {"$unwind": "$scouter"},
            ]

            team_scouting_data = list(scouting_manager.db.team_data.aggregate(pipeline))

            # Calculate statistics
            auto_points = [entry["auto_points"] for entry in team_scouting_data]
            teleop_points = [entry["teleop_points"] for entry in team_scouting_data]
            endgame_points = [entry["endgame_points"] for entry in team_scouting_data]
            total_points = [entry["total_points"] for entry in team_scouting_data]

            stats = {
                "matches_played": len(team_scouting_data),
                "avg_auto": (sum(auto_points) / len(auto_points) if auto_points else 0),
                "avg_teleop": (
                    sum(teleop_points) / len(teleop_points) if teleop_points else 0
                ),
                "avg_endgame": (
                    sum(endgame_points) / len(endgame_points) if endgame_points else 0
                ),
                "avg_total": (
                    sum(total_points) / len(total_points) if total_points else 0
                ),
                "max_total": max(total_points, default=0),
                "min_total": min(total_points, default=0),
            }

            scouting_entries = [
                {
                    "event_code": entry["event_code"],
                    "match_number": entry["match_number"],
                    "coral_levels": [
                        entry["coral_level1"],
                        entry["coral_level2"],
                        entry["coral_level3"],
                        entry["coral_level4"]
                    ],
                    "algae": {
                        "net": entry["algae_net"],
                        "processor": entry["algae_processor"],
                        "human_player": entry["human_player"]
                    },
                    "climb": {
                        "type": entry["climb_type"],
                        "success": entry["climb_success"]
                    },
                    "total_points": entry["total_points"],
                    "notes": entry["notes"],
                    "scouter": entry["scouter"]["username"],
                }
                for entry in team_scouting_data
            ]

            teams_data[team_num] = {
                "team_number": team["team_number"],
                "nickname": team["nickname"],
                "school_name": team.get("school_name"),
                "city": team.get("city"),
                "state_prov": team.get("state_prov"),
                "country": team.get("country"),
                "stats": {
                    "matches_played": stats["matches_played"],
                    "avg_coral": stats["avg_coral"],
                    "avg_algae": stats["avg_algae"],
                    "climb_success_rate": stats["climb_success_rate"],
                    "defense_rating": stats["avg_defense"],
                    "total_points": stats["total_points"]
                },
                "scouting_data": scouting_entries,
            }

        return jsonify(teams_data)

    except Exception as e:
        print(f"Error comparing teams: {e}")
        return jsonify({"error": "Failed to fetch team data"}), 500


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
                    "has_team_page": scouting_manager.has_team_data(team["team_number"])
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
                    "level1": {"$round": ["$auto_coral_level1", 1]},
                    "level2": {"$round": ["$auto_coral_level2", 1]},
                    "level3": {"$round": ["$auto_coral_level3", 1]},
                    "level4": {"$round": ["$auto_coral_level4", 1]}
                },
                "teleop_coral_stats": {
                    "level1": {"$round": ["$teleop_coral_level1", 1]},
                    "level2": {"$round": ["$teleop_coral_level2", 1]},
                    "level3": {"$round": ["$teleop_coral_level3", 1]},
                    "level4": {"$round": ["$teleop_coral_level4", 1]}
                },
                "auto_algae_stats": {
                    "net": {"$round": ["$auto_algae_net", 1]},
                    "processor": {"$round": ["$auto_algae_processor", 1]}
                },
                "teleop_algae_stats": {
                    "net": {"$round": ["$teleop_algae_net", 1]},
                    "processor": {"$round": ["$teleop_algae_processor", 1]}
                },
                # Calculate totals for each category
                "total_coral": {
                    "$round": [{
                        "$add": [
                            "$auto_coral_level1", "$auto_coral_level2", 
                            "$auto_coral_level3", "$auto_coral_level4",
                            "$teleop_coral_level1", "$teleop_coral_level2", 
                            "$teleop_coral_level3", "$teleop_coral_level4"
                        ]
                    }, 1]
                },
                "total_auto_coral": {
                    "$round": [{
                        "$add": [
                            "$auto_coral_level1", "$auto_coral_level2", 
                            "$auto_coral_level3", "$auto_coral_level4"
                        ]
                    }, 1]
                },
                "total_teleop_coral": {
                    "$round": [{
                        "$add": [
                            "$teleop_coral_level1", "$teleop_coral_level2", 
                            "$teleop_coral_level3", "$teleop_coral_level4"
                        ]
                    }, 1]
                },
                "total_algae": {
                    "$round": [{
                        "$add": [
                            "$auto_algae_net", "$auto_algae_processor",
                            "$teleop_algae_net", "$teleop_algae_processor"
                        ]
                    }, 1]
                },
                "total_auto_algae": {
                    "$round": [{
                        "$add": ["$auto_algae_net", "$auto_algae_processor"]
                    }, 1]
                },
                "total_teleop_algae": {
                    "$round": [{
                        "$add": ["$teleop_algae_net", "$teleop_algae_processor"]
                    }, 1]
                },
                "climb_success_rate": {
                    "$round": [
                        {"$multiply": [
                            {"$cond": [
                                {"$gt": ["$climb_attempts", 0]},
                                {"$divide": ["$climb_successes", "$climb_attempts"]},
                                0
                            ]},
                            100
                        ]},
                        1
                    ]
                },
                "deep_climb_success_rate": {
                    "$round": [
                        {"$multiply": [
                            {"$cond": [
                                {"$gt": ["$deep_climb_attempts", 0]},
                                {"$divide": ["$deep_climb_successes", "$deep_climb_attempts"]},
                                0
                            ]},
                            100
                        ]},
                        1
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
            'deep_climb': 'deep_climb_success_rate'
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
                            "coral_total": {
                                "$sum": [
                                    "$auto_coral_level1",
                                    "$auto_coral_level2",
                                    "$auto_coral_level3",
                                    "$auto_coral_level4",
                                    "$teleop_coral_level1",
                                    "$teleop_coral_level2",
                                    "$teleop_coral_level3",
                                    "$teleop_coral_level4"
                                ]
                            },
                            "algae_total": {
                                "$sum": [
                                    "$auto_algae_net",
                                    "$auto_algae_processor",
                                    "$teleop_algae_net",
                                    "$teleop_algae_processor"
                                ]
                            },
                            "human_player": "$human_player",
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
            
            matches.append({
                "event_code": match["_id"]["event"],
                "match_number": match["_id"]["match"],
                "red_teams": red_teams,
                "blue_teams": blue_teams,
                "red_score": sum(t["total_points"] for t in red_teams),
                "blue_score": sum(t["total_points"] for t in blue_teams),
                "red_coral_total": sum(t["coral_total"] for t in red_teams),
                "red_algae_total": sum(t["algae_total"] for t in red_teams),
                "blue_coral_total": sum(t["coral_total"] for t in blue_teams),
                "blue_algae_total": sum(t["algae_total"] for t in blue_teams)
            })
        
        return render_template("scouting/matches.html", matches=matches)
    except Exception as e:
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