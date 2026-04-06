"""Router principal de la API."""

from fastapi import APIRouter

from .routes import auth
from .routes import pipelines
from .routes import jobs
from .routes import nodes
from .routes import webhooks
from .routes import agents

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(pipelines.router, prefix="/pipelines", tags=["pipelines"])
router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
router.include_router(nodes.router, prefix="/nodes", tags=["nodes"])
router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
router.include_router(agents.router, prefix="/agents", tags=["agents"])
