from app.app import create_app
import sys
import logging
import os

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    app = create_app()
    app.debug = False
except Exception as e:
    logger.error(f"Failed to create app: {str(e)}")
    sys.exit(1)

# Add error handler
@app.errorhandler(500)
def handle_500(e):
    logger.error(f"Internal server error: {str(e)}")
    return "Internal Server Error", 500

if __name__ == "__main__":
    app.run(host=os.getenv("HOST"), port=int(os.getenv("PORT", 5000)))