import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import citation_graph, contributions, graph, package_graph


def _setup_logging() -> None:
    fmt = "%(asctime)s  %(levelname)-5s  [%(name)s]  %(message)s"
    logging.basicConfig(format=fmt, datefmt="%H:%M:%S", level=logging.INFO)
    logging.getLogger("app").setLevel(logging.DEBUG if settings.debug else logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def create_app() -> FastAPI:
    _setup_logging()
    log = logging.getLogger(__name__)
    log.info("GitHub token: %s", "configured" if settings.github_token else "NOT SET")
    log.info(
        "Gemini API key: %s", "configured" if settings.gemini_api_key else "NOT SET"
    )
    log.info("Gemini model: %s", settings.gemini_model)

    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(contributions.router)
    app.include_router(graph.router)
    app.include_router(citation_graph.router)
    app.include_router(package_graph.router)

    @app.get("/health")
    async def health_check():
        return {"status": "ok"}

    return app


app = create_app()
