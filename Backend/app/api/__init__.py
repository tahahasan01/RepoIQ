from fastapi import APIRouter
from .routes import auth, users, github, analysis, chat

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(github.router)
api_router.include_router(analysis.router)
api_router.include_router(chat.router)
