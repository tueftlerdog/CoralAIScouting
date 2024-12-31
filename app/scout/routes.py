import asyncio
from functools import wraps
import aiohttp
from flask import Blueprint, flash, render_template, request, redirect, url_for, jsonify
from flask_login import login_required, current_user
from app.scout.scouting_utils import ScoutingManager
from .TBA import TBAInterface
from collections import defaultdict
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
        data = request.get_json() if request.is_json else request.form
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
                    "auto_points": entry["auto_points"],
                    "teleop_points": entry["teleop_points"],
                    "endgame_points": entry["endgame_points"],
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
                "stats": stats,
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
                    "as": "scouter",
                }
            },
            {"$unwind": "$scouter"},
        ]

        team_scouting_data = list(scouting_manager.db.team_data.aggregate(pipeline))

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
        MIN_MATCHES = 1  # Minimum matches required to be on leaderboard
        
        pipeline = [
            # Group by team number
            {"$group": {
                "_id": "$team_number",
                "matches_played": {"$sum": 1},
                "total_points": {"$sum": "$total_points"},
                "auto_points": {"$sum": "$auto_points"},
                "teleop_points": {"$sum": "$teleop_points"},
                "endgame_points": {"$sum": "$endgame_points"},
                "wins": {
                    "$sum": {"$cond": [{"$eq": ["$match_result", "won"]}, 1, 0]}
                },
                "losses": {
                    "$sum": {"$cond": [{"$eq": ["$match_result", "lost"]}, 1, 0]}
                },
                "ties": {
                    "$sum": {"$cond": [{"$eq": ["$match_result", "tie"]}, 1, 0]}
                }
            }},
            # Filter teams with minimum matches
            {"$match": {
                "matches_played": {"$gte": MIN_MATCHES}
            }},
            # Calculate averages and win rate
            {"$project": {
                "team_number": "$_id",
                "matches_played": 1,
                "total_points": 1,
                "avg_points": {"$divide": ["$total_points", "$matches_played"]},
                "avg_auto": {"$divide": ["$auto_points", "$matches_played"]},
                "avg_teleop": {"$divide": ["$teleop_points", "$matches_played"]},
                "avg_endgame": {"$divide": ["$endgame_points", "$matches_played"]},
                "wins": 1,
                "losses": 1,
                "ties": 1,
                "win_rate": {
                    "$multiply": [
                        {"$divide": ["$wins", "$matches_played"]},
                        100
                    ]
                }
            }},
            # Sort by win rate and average points
            {"$sort": {
                "win_rate": -1,
                "avg_points": -1
            }}
        ]

        teams = list(scouting_manager.db.team_data.aggregate(pipeline))
        return render_template("scouting/leaderboard.html", teams=teams)
    except Exception as e:
        flash(f"Error loading leaderboard: {str(e)}", "error")
        return render_template("scouting/leaderboard.html", teams=[])


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
                            "total_points": "$total_points",
                            "alliance": "$alliance",
                            "auto_points": "$auto_points",
                            "teleop_points": "$teleop_points",
                            "endgame_points": "$endgame_points"
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
                "blue_score": sum(t["total_points"] for t in blue_teams)
            })
        
        return render_template("scouting/matches.html", matches=matches)
    except Exception as e:
        flash(f"Error fetching matches: {str(e)}", "error")
        return render_template("scouting/matches.html", matches=[])

@scouting_bp.route("/scouting/team/<int:team_number>")
@login_required
def team_view(team_number):
    try:
        # Get team stats from MongoDB
        pipeline = [
            {"$match": {"team_number": team_number}},
            {
                "$group": {
                    "_id": "$team_number",
                    "matches_played": {"$sum": 1},
                    "total_points": {"$sum": "$total_points"},
                    "auto_points": {"$avg": "$auto_points"},
                    "teleop_points": {"$avg": "$teleop_points"},
                    "endgame_points": {"$avg": "$endgame_points"},
                    "matches": {
                        "$push": {
                            "match_number": "$match_number",
                            "event_code": "$event_code",
                            "auto_points": "$auto_points",
                            "teleop_points": "$teleop_points",
                            "endgame_points": "$endgame_points",
                            "total_points": "$total_points",
                            "notes": {"$ifNull": ["$notes", ""]}
                        }
                    }
                }
            }
        ]

        team_data = list(scouting_manager.db.team_data.aggregate(pipeline))

        if not team_data:
            flash("No scouting data found for this team", "error")
            return redirect(url_for("scouting.list_scouting_data"))

        team_stats = team_data[0]

        # Convert Decimal128 to float for JSON serialization
        stats = {
            "matches_played": team_stats["matches_played"],
            "total_points": float(team_stats["total_points"]),
            "auto_points": float(team_stats["auto_points"]),
            "teleop_points": float(team_stats["teleop_points"]),
            "endgame_points": float(team_stats["endgame_points"])
        }

        matches = [
            {
                "event_code": str(match["event_code"]),
                "match_number": int(match["match_number"]),
                "auto_points": float(match["auto_points"]),
                "teleop_points": float(match["teleop_points"]),
                "endgame_points": float(match["endgame_points"]),
                "total_points": float(match["total_points"]),
                "notes": str(match["notes"]),
            }
            for match in team_stats["matches"]
        ]
        return render_template(
            "scouting/team.html",
            team_number=team_number,
            stats=stats,
            matches=matches
        )

    except Exception as e:
        print(f"Error loading team data: {str(e)}")
        flash(f"Error loading team data: {str(e)}", "error")
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