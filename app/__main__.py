import os

from dotenv import load_dotenv
from waitress import serve

from app.app import create_app

load_dotenv()

app = create_app()

if __name__ == "__main__":
    debug_mode = os.getenv("DEBUG", "False") == "True"
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", 5000))

    if debug_mode:
        debug = os.getenv("DEBUG", "False").lower() == "true"
        app.run(debug=debug, host=host, port=port)
    else:
        serve(app, host=host, port=port)
