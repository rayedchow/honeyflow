from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Contribution Tracer"
    debug: bool = False
    github_token: Optional[str] = None
    github_api_base: str = "https://api.github.com"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
