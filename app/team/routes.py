import asyncio
from functools import wraps
from bson import ObjectId
from flask import Blueprint, flash, render_template, request, jsonify, current_app, redirect, url_for, send_file
from flask_login import login_required, current_user
from app.team.team_utils import TeamManager
from datetime import datetime, timezone
import pytz
import os
from werkzeug.utils import secure_filename
from .forms import CreateTeamForm
from gridfs import GridFS
from io import BytesIO

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

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


@team_bp.route('/join', methods=['GET', 'POST'])
@login_required
@async_route
async def join_team_page():
    """Display team join page"""
    # If user already has a team, redirect to manage page
    if current_user.teamNumber:
        return redirect(url_for('team.manage_team'))

    if request.method == 'POST':
        join_code = request.form.get('join_code')
        if not join_code:
            flash('Join code is required', 'error')
            return redirect(url_for('team.join_team_page'))

        team_manager = TeamManager(current_app.config['MONGO_URI'])
        success, result = await team_manager.join_team(current_user.get_id(), join_code)

        if success:
            team, updated_user = result
            # Update the current_user object with new team number
            current_user.teamNumber = updated_user.teamNumber
            flash(f"Successfully joined team {team.team_number}", "success")
            return redirect(url_for("team.manage_team", team_number=team.team_number))
        else:
            flash(f"Failed to join team: {result}", "error")
            return redirect(url_for("team.join_team_page"))

    return render_template('team/join.html')

@team_bp.route('/create', methods=['GET', 'POST'])
@login_required
@async_route
async def create_team():
    """Handle team creation"""
    if current_user.teamNumber:
        return redirect(url_for('team.manage_team'))

    form = CreateTeamForm()
    
    if form.validate_on_submit():
        current_app.logger.debug("Form validated successfully")
        try:
            team_manager = TeamManager(current_app.config['MONGO_URI'])
            
            # Handle logo upload using GridFS
            logo_id = None
            if form.logo.data:
                # Use the MongoDB connection from TeamManager instead
                fs = GridFS(team_manager.db)
                
                filename = secure_filename(f"team_{form.team_number.data}_{form.logo.data.filename}")
                current_app.logger.debug(f"Uploading file: {filename}")
                
                # Store file in GridFS
                logo_id = fs.put(
                    form.logo.data,
                    filename=filename,
                    content_type=form.logo.data.content_type
                )
            
            # Create the team
            success, result = await team_manager.create_team(
                team_number=form.team_number.data,
                creator_id=current_user.id,
                team_name=form.team_name.data,
                description=form.description.data,
                logo_id=str(logo_id) if logo_id else None
            )
            
            if success:
                flash('Team created successfully!', 'success')
                return redirect(url_for('team.manage_team'))
            else:
                if logo_id:  # Clean up uploaded file if team creation failed
                    fs = GridFS(team_manager.db)
                    fs.delete(logo_id)
                flash(f'Error creating team: {result}', 'error')
                
        except Exception as e:
            current_app.logger.error(f"Error in create_team route: {str(e)}")
            flash(f'Error creating team: {str(e)}', 'error')
            
    return render_template('team/create.html', form=form)

@team_bp.route('/<int:team_number>/leave', methods=['POST'])
@login_required
@async_route
async def leave_team(team_number):
    """Leave a team"""
    team_manager = TeamManager(current_app.config['MONGO_URI'])
    success, message = await team_manager.leave_team(current_user.get_id(), team_number)

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'success': success, 'message': message})

    if success:
        current_user.teamNumber = None
        flash("Successfully left the team", "success")
        return redirect(url_for("team.join_team_page"))
    else:
        flash(f"Failed to leave team: {message}", "error")
        return redirect(url_for("team.manage_team", team_number=team_number))

@team_bp.route('/<int:team_number>/members', methods=['GET'])
@login_required
@async_route
async def get_team_members(team_number):
    """Get all members of a team"""
    team_manager = TeamManager(current_app.config['MONGO_URI'])
    members = await team_manager.get_team_members(team_number)
    
    return jsonify({
        'success': True,
        'members': [member.to_dict() for member in members]
    }), 200

@team_bp.route('/<int:team_number>/admin/add', methods=['POST'])
@login_required
@async_route
async def add_admin(team_number):
    """Add a new admin to the team"""
    data = request.get_json()
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({'success': False, 'message': 'User ID is required'}), 400

    team_manager = TeamManager(current_app.config['MONGO_URI'])
    success, message = await team_manager.add_admin(team_number, user_id, current_user.get_id())

    return jsonify({'success': success, 'message': message}), 200 if success else 400

@team_bp.route('/<int:team_number>/admin/remove', methods=['POST'])
@login_required
@async_route
async def remove_admin(team_number):
    """Remove an admin from the team"""
    data = request.get_json()
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({'success': False, 'message': 'User ID is required'}), 400

    team_manager = TeamManager(current_app.config['MONGO_URI'])
    success, message = await team_manager.remove_admin(team_number, user_id, current_user.get_id())

    return jsonify({'success': success, 'message': message}), 200 if success else 400

@team_bp.route('/<int:team_number>/assignments', methods=['POST'])
@login_required
@async_route
async def create_assignment(team_number):
    """Create a new assignment"""
    try:
        data = request.get_json()
        team_manager = TeamManager(current_app.config['MONGO_URI'])
        success, result = await team_manager.create_assignment(
            team_number=team_number,
            creator_id=current_user.get_id(),
            assignment_data=data
        )

        if success:
            return jsonify({'success': True, 'message': 'Assignment created successfully'}), 200
        return jsonify({'success': False, 'message': result}), 400

    except Exception as e:
        current_app.logger.error(f"Error creating assignment: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@team_bp.route('/assignments/<assignment_id>/status', methods=['PUT'])
@login_required
@async_route
async def update_assignment_status(assignment_id):
    """Update assignment status"""
    data = request.get_json()
    new_status = data.get('status')
    
    if not new_status:
        return jsonify({'success': False, 'message': 'Status is required'}), 400

    team_manager = TeamManager(current_app.config['MONGO_URI'])
    success, message = await team_manager.update_assignment_status(
        assignment_id, current_user.get_id(), new_status
    )

    return jsonify({'success': success, 'message': message}), 200 if success else 400

@team_bp.route('/assignments/<assignment_id>/update', methods=['PUT'])
@login_required
@async_route
async def update_assignment(assignment_id):
    """Update assignment"""
    data = request.get_json()
    team_manager = TeamManager(current_app.config['MONGO_URI'])
    success, message = await team_manager.update_assignment(assignment_id, current_user.get_id(), data)
    return jsonify({'success': success, 'message': message}), 200 if success else 400

@team_bp.route('/assignments/<assignment_id>/delete', methods=['DELETE'])
@login_required
@async_route
async def delete_assignment(assignment_id):
    """Delete assignment"""
    team_manager = TeamManager(current_app.config['MONGO_URI'])
    success, message = await team_manager.delete_assignment(assignment_id, current_user.get_id())
    return jsonify({'success': success, 'message': message}), 200 if success else 400

@team_bp.route('/manage', methods=['GET', 'POST'])
@team_bp.route('/manage/<int:team_number>', methods=['GET', 'POST'])
@team_bp.route('/', methods=['GET', 'POST'])
@login_required
@async_route
async def manage_team(team_number=None):
    """Manage team"""
    team_manager = TeamManager(current_app.config['MONGO_URI'])
    
    # If user has a team number, validate it
    if current_user.teamNumber:
        success, result = await team_manager.validate_user_team(
            current_user.get_id(), 
            current_user.teamNumber
        )
        
        if not success:
            current_user.teamNumber = None
            flash(result, "warning")
            return redirect(url_for('team.join_team_page'))
        
        team = result  # result is the team object if validation succeeded
    else:
        return redirect(url_for('team.join_team_page'))
    
    # Get team members and assignments
    team_members = await team_manager.get_team_members(team.team_number)
    assignments = await team_manager.get_team_assignments(team.team_number)
    
    # Create a dictionary of user IDs to usernames for easier lookup
    user_dict = {str(member.get_id()): member for member in team_members}
    
    # Ensure assignment.assigned_to contains string IDs
    for assignment in assignments:
        if hasattr(assignment, 'assigned_to'):
            assignment.assigned_to = [str(user_id) for user_id in assignment.assigned_to]
    
    return render_template(
        'team/manage.html', 
        team=team,
        current_user=current_user,
        team_members=team_members,
        user_dict=user_dict,
        assignments=assignments,
        is_admin=team.is_admin(current_user.get_id())
    )


@team_bp.route('/<int:team_number>/user/<user_id>/remove', methods=['POST'])
@login_required
@async_route
async def remove_user(team_number, user_id):
    """Remove a user from the team (admin only)"""
    team_manager = TeamManager(current_app.config['MONGO_URI'])
    success, message = await team_manager.remove_user(team_number, user_id, current_user.get_id())

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'success': success, 'message': message}), 200 if success else 400
    
    if success:
        if user_id == current_user.get_id():
            current_user.teamNumber = None
        flash('User removed successfully', 'success')
    else:
        flash(message, 'error')
    return redirect(url_for('team.manage_team'))

@team_bp.route('/<int:team_number>/assignments/clear', methods=['POST'])
@login_required
@async_route
async def clear_assignments(team_number):
    """Clear all assignments for a team (admin only)"""
    team_manager = TeamManager(current_app.config['MONGO_URI'])
    success, message = await team_manager.clear_assignments(team_number, current_user.get_id())

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'success': success, 'message': message}), 200 if success else 400
    
    if success:
        flash('All assignments cleared successfully', 'success')
    else:
        flash(message, 'error')
    return redirect(url_for('team.manage_team'))

@team_bp.route('/<int:team_number>/delete', methods=['DELETE'])
@login_required
@async_route
async def delete_team(team_number):
    """Delete team (owner only)"""
    team_manager = TeamManager(current_app.config['MONGO_URI'])
    success, message = await team_manager.delete_team(team_number, current_user.get_id())

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({'success': success, 'message': message}), 200 if success else 400
    
    if success:
        flash('Team deleted successfully', 'success')
        return redirect(url_for('team.join_team_page'))
    else:
        flash(message, 'error')
        return redirect(url_for('team.manage_team'))

@team_bp.route('/team_logo/<team_number>')
@async_route
async def team_logo(team_number):
    """Serve team logo from GridFS"""
    try:
        team_manager = TeamManager(current_app.config['MONGO_URI'])
        team = await team_manager.get_team_by_number(int(team_number))
        
        if team and team.logo_id:
            fs = GridFS(team_manager.db)
            try:
                # team.logo_id should already be ObjectId from the model
                logo_file = fs.get(team.logo_id)
                return send_file(
                    BytesIO(logo_file.read()),
                    mimetype=logo_file.content_type,
                    download_name=logo_file.filename,  # Add this for better browser handling
                    as_attachment=False
                )
            except Exception as e:
                current_app.logger.error(f"Error retrieving logo from GridFS: {str(e)}")
                
        # Return default logo path relative to the application root
        return send_file('static/images/default_team_logo.png', mimetype='image/png')
        
    except Exception as e:
        current_app.logger.error(f"Error in team_logo route: {str(e)}")
        return send_file('static/images/default_team_logo.png', mimetype='image/png')

@team_bp.route('/assignments/<assignment_id>/edit', methods=['PUT'])
@login_required
@async_route
async def edit_assignment(assignment_id):
    """Edit an existing assignment"""
    try:
        data = request.get_json()
        team_manager = TeamManager(current_app.config['MONGO_URI'])
        success, result = await team_manager.update_assignment(
            assignment_id=assignment_id,
            user_id=current_user.get_id(),
            assignment_data=data
        )

        return jsonify({'success': success, 'message': result}), 200 if success else 400

    except Exception as e:
        current_app.logger.error(f"Error editing assignment: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500