from backend.main import app as fastapi_app

# Expose the FastAPI application to Vercel's Python runtime so it can serve all
# backend routes from the `/api/python` namespace without requiring an
# additional deployment target.
app = fastapi_app
