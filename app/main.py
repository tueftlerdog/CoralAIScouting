import logging
import os
import sys

from app.app import create_app

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    app = create_app()
    app.debug = False
except Exception as e:
    logger.error(f"Failed to create app: {str(e)}")
    sys.exit(1)

if __name__ == "__main__":
    app.run(host=os.getenv("HOST"), port=int(os.getenv("PORT", 5000)))