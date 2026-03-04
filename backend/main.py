from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import os

from app.api import templates, projects, llm, export, chat, papers, profile, tags
from app.db.session import engine
from app.models import base as models_base

APP_VERSION = "0.1.0"

app = FastAPI(title="Deadline API", version=APP_VERSION)

# Ensure uploads directory exists (respects DATA_DIR if set)
_data_dir = os.environ.get("DATA_DIR")
_upload_dir = os.path.join(_data_dir, "uploads") if _data_dir else "uploads/papers"
os.makedirs(_upload_dir, exist_ok=True)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "message": str(exc)},
    )


app.include_router(templates.router, prefix="/api/templates", tags=["templates"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(llm.router, prefix="/api/llm", tags=["llm"])
app.include_router(chat.router, prefix="/api/projects", tags=["chat"])
app.include_router(export.router, prefix="/api/projects", tags=["export"])
app.include_router(papers.router, prefix="/api/papers", tags=["papers"])
app.include_router(profile.router, prefix="/api/profile", tags=["profile"])
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/version")
def version():
    return {"version": APP_VERSION}


# Serve built React frontend in packaged mode
_app_env = os.environ.get("APP_ENV", "development")
if _app_env == "production":
    _static_dir = os.path.join(os.path.dirname(__file__), "static")
    if os.path.isdir(_static_dir):
        app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
