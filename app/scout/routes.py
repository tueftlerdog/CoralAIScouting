import asyncio
from functools import wraps
import aiohttp
from flask import (
    Blueprint, flash, render_template, request, redirect, url_for, jsonify
)
from flask_login import login_required, current_user
from app.scout.scouting_utils import ScoutingManager
from .TBA import TBAInterface

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
            
        return redirect(url_for('scouting.list_scouting_data'))
        

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
                "Team data not found or you do not have permission to edit it",
                "error"
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
                        return jsonify(
                            {"error": f"Team {team_num} not found"}), 404
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

            team_scouting_data = list(
                scouting_manager.db.team_data.aggregate(pipeline))

            # Calculate statistics
            auto_points = [
                entry["auto_points"] for entry in team_scouting_data
            ]
            teleop_points = [
                entry["teleop_points"] for entry in team_scouting_data
            ]
            endgame_points = [
                entry["endgame_points"] for entry in team_scouting_data
            ]
            total_points = [
                entry["total_points"] for entry in team_scouting_data
            ]

            stats = {
                "matches_played": len(team_scouting_data),
                "avg_auto": (
                    sum(auto_points) / len(auto_points) if auto_points else 0
                ),
                "avg_teleop": (
                    sum(teleop_points) / len(teleop_points)
                    if teleop_points else 0
                ),
                "avg_endgame": (
                    sum(endgame_points) / len(endgame_points)
                    if endgame_points else 0
                ),
                "avg_total": (
                    sum(total_points) / len(total_points)
                    if total_points else 0
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

        team_scouting_data = list(
            scouting_manager.db.team_data.aggregate(pipeline))

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
            
        return jsonify({
            "success": success,
            "message": message,
            "redirect": url_for('scouting.list_scouting_data')
        })
    except Exception as e:
        flash(f"Error during sync: {str(e)}", "error")
        return jsonify({
            "success": False,
            "message": str(e),
            "redirect": url_for('scouting.list_scouting_data')
        }), 500
