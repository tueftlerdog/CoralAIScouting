from app.app import create_app
from waitress import serve
from dotenv import load_dotenv
import os

load_dotenv()

app = create_app()

if __name__ == "__main__":
    app.run(debug=True) if os.getenv("DEBUG") == "True" else serve(app, host="0.0.0.0", port=5000)
