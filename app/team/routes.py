from flask import Blueprint, flash, render_template, request, redirect, url_for, jsonify
from flask_login import login_required, current_user
from auth.models import TeamData
from .TBA import TBAInterface
import asyncio
from functools import wraps


def run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()

def async_route(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        return run_async(f(*args, **kwargs))
    return wrapper


team_bp = Blueprint('team', __name__)


@team_bp.route('/add', methods=['GET', 'POST'])
@login_required
@async_route
async def add_team_data():
    if request.method == 'POST':
        try:
            await TeamData.create(
                team_number=int(request.form['team_number']),
                event_code=request.form['event_code'],
                match_number=int(request.form['match_number']),
                auto_points=int(request.form['auto_points']),
                teleop_points=int(request.form['teleop_points']),
                endgame_points=int(request.form['endgame_points']),
                total_points=(int(request.form['auto_points']) + 
                            int(request.form['teleop_points']) + 
                            int(request.form['endgame_points'])),
                notes=request.form['notes'],
                scouter=current_user
            )
            return redirect(url_for('team.list_team_data'))
        except Exception as e:
            return str(e), 400
            
    return render_template('team/add.html')

@team_bp.route('/list')
@login_required
@async_route
async def list_team_data():
    team_data = await TeamData.all().prefetch_related('scouter')
    return render_template('team/list.html', team_data=team_data)

@team_bp.route('/edit/<int:id>', methods=['GET', 'POST'])
@async_route
async def edit_team_data(id):
    team_data = await TeamData.get_or_none(id=id)
    if not team_data:
        return "Team data not found", 404
        
    if request.method == 'POST':
        try:
            team_data.team_number = int(request.form['team_number'])
            team_data.event_code = request.form['event_code']
            team_data.match_number = int(request.form['match_number'])
            team_data.auto_points = int(request.form['auto_points'])
            team_data.teleop_points = int(request.form['teleop_points'])
            team_data.endgame_points = int(request.form['endgame_points'])
            team_data.total_points = (int(request.form['auto_points']) + 
                                    int(request.form['teleop_points']) + 
                                    int(request.form['endgame_points']))
            team_data.notes = request.form['notes']
            await team_data.save()
            return redirect(url_for('team.list_team_data'))
        except Exception as e:
            return str(e), 400
            
    return render_template('team/edit.html', team_data=team_data)

@team_bp.route('/delete/<int:id>')
@login_required
@async_route
async def delete_team_data(id):
    team_data = await TeamData.get_or_none(id=id).prefetch_related('scouter')
    
    if not team_data:
        flash('Record not found.', 'error')
        return redirect(url_for('team.list_team_data'))
    
    if team_data.scouter.id != current_user.id:
        flash('You do not have permission to delete this record.', 'error')
        return redirect(url_for('team.list_team_data'))
    
    await team_data.delete()
    flash('Record deleted successfully.', 'success')
    return redirect(url_for('team.list_team_data'))

@team_bp.route('/compare')
@login_required
def team_compare_page():
    return render_template('team/compare.html')

@team_bp.route('/api/compare')
@login_required
@async_route
async def compare_teams():
    team1 = request.args.get('team1', '').strip()
    team2 = request.args.get('team2', '').strip()

    if not team1 or not team2:
        return jsonify({"error": "Both team numbers are required"}), 400

    try:
        async with TBAInterface() as tba:
            teams_data = {}

            for team_num in [team1, team2]:
                # Fetch TBA team info
                team_key = f"frc{team_num}"
                url = f"{tba.base_url}/team/{team_key}"

                async with tba.session.get(url) as response:
                    if response.status != 200:
                        return jsonify({"error": f"Team {team_num} not found"}), 404

                    team = await response.json()

                    # Fetch all scouting data for this team
                    team_scouting_data = await TeamData.filter(
                        team_number=team["team_number"]
                    ).prefetch_related('scouter')

                    # Calculate statistics
                    auto_points = [entry.auto_points for entry in team_scouting_data]
                    teleop_points = [entry.teleop_points for entry in team_scouting_data]
                    endgame_points = [entry.endgame_points for entry in team_scouting_data]
                    total_points = [entry.total_points for entry in team_scouting_data]

                    stats = {
                        "matches_played": len(team_scouting_data),
                        "avg_auto": (
                            sum(auto_points) / len(auto_points)
                            if auto_points
                            else 0
                        ),
                        "avg_teleop": (
                            sum(teleop_points) / len(teleop_points)
                            if teleop_points
                            else 0
                        ),
                        "avg_endgame": (
                            sum(endgame_points) / len(endgame_points)
                            if endgame_points
                            else 0
                        ),
                        "avg_total": (
                            sum(total_points) / len(total_points)
                            if total_points
                            else 0
                        ),
                        "max_total": max(total_points, default=0),
                        "min_total": min(total_points, default=0),
                    }

                    scouting_entries = [
                        {
                            "event_code": entry.event_code,
                            "match_number": entry.match_number,
                            "auto_points": entry.auto_points,
                            "teleop_points": entry.teleop_points,
                            "endgame_points": entry.endgame_points,
                            "total_points": entry.total_points,
                            "notes": entry.notes,
                            "scouter": entry.scouter.username,
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
                        "scouting_data": scouting_entries
                    }
            return jsonify(teams_data)

    except Exception as e:
        print(f"Error comparing teams: {e}")
        return jsonify({"error": "Failed to fetch team data"}), 500


# @login_required
@team_bp.route('/search')
@login_required
def team_search_page():
    return render_template('team/search.html')

@team_bp.route('/api/search')
@login_required
@async_route
async def search_teams():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify([])

    try:
        async with TBAInterface() as tba:
            #TODO: If the query is numeric, try to fetch specific team else try event code
            team_key = f"frc{query}"
            url = f"{tba.base_url}/team/{team_key}"

            async with tba.session.get(url) as response:
                if response.status == 200:
                    team = await response.json()

                    # Fetch all scouting data for this team
                    team_scouting_data = await TeamData.filter(
                        team_number=team["team_number"]
                    ).prefetch_related('scouter')

                    scouting_entries = [
                        {
                            "id": entry.id,
                            "event_code": entry.event_code,
                            "match_number": entry.match_number,
                            "auto_points": entry.auto_points,
                            "teleop_points": entry.teleop_points,
                            "endgame_points": entry.endgame_points,
                            "total_points": entry.total_points,
                            "notes": entry.notes,
                            "scouter": entry.scouter.username,
                        }
                        for entry in team_scouting_data
                    ]
                    return jsonify([{
                        "team_number": team["team_number"],
                        "nickname": team["nickname"],
                        "school_name": team.get("school_name"),
                        "city": team.get("city"),
                        "state_prov": team.get("state_prov"),
                        "country": team.get("country"),
                        "scouting_data": scouting_entries
                    }])

    except Exception as e:
        print(f"Error searching teams: {e}")
        return jsonify({"error": "Failed to fetch team data"}), 500