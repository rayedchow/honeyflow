from typing import Optional

from pydantic import BaseModel
from pydantic_settings import BaseSettings


class GraphDefaults(BaseModel):
    max_depth: int = 3
    max_children: int = 10
    decay: float = 0.8
    dev_dep_weight_multiplier: float = 0.2
    usage_freq_weight: float = 0.6
    llm_importance_weight: float = 0.4
    contributor_lines_weight: float = 0.5
    contributor_files_weight: float = 0.3
    contributor_commits_weight: float = 0.2


class Settings(BaseSettings):
    app_name: str = "Contribution Tracer"
    debug: bool = False

    github_token: Optional[str] = None
    github_api_base: str = "https://api.github.com"

    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-2.0-flash"
    gemini_api_base: str = "https://generativelanguage.googleapis.com/v1beta"

    graph: GraphDefaults = GraphDefaults()

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
