# 334 Scouting App

| Images | Images |
| ---- | ----- |
| ![Home unlogined](./assets/home.png) | ![Home logined](./assets/home-2.png) |
| ![Scout](./assets/scout.png) | ![Add data](./assets/scout-2.png) |
| ![Search](./assets/search.png) | ![Compare](./assets/compare.png) |

## Prerequisite
- [MongoDB compass](https://www.mongodb.com/try/download/community) - https://www.mongodb.com/try/download/community
- [Python](https://python.org) - https://python.org



## How to install
1. Clone the repo
2. Create a database in [MongoDB compass](https://www.mongodb.com/try/download/community):
![MongoDB Compass](./assets/mongodb.png)
3. Create `.env` file in root directory, should look similar to this
> Example:
```
SECRET_KEY=your_secret_key
MONGO_URI=your_mongo_uri
TBA_AUTH_KEY=your_tba_api_key
DEBUG=False
```
3. Install the dependencies: `pip install -r requirements.txt`
4. Run the app through (in parent directory outside of app): `python app/app.py`