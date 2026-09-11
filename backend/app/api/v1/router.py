from fastapi import APIRouter

from app.api.v1 import auth, dashboard, finance, fitness, habits, routines

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(dashboard.router)
api_router.include_router(routines.router)
api_router.include_router(habits.router)
api_router.include_router(finance.router)
api_router.include_router(fitness.router)
