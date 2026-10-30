import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    ENVIRONMENT: str = "prod" if os.getenv("RENDER") else "local"
    NEBIUS_API_KEY: str = "fake_key_for_local"
    DATABASE_URL: str = "postgresql+psycopg://incidentpilot:incidentpilot@localhost:5432/incidentpilot"

    @property
    def openai_base_url(self) -> str:
        if self.ENVIRONMENT == "local":
            return "http://localhost:11434/v1"
        return "https://api.tokenfactory.nebius.com/v1/"

    @property
    def model_name(self) -> str:
        if self.ENVIRONMENT == "local":
            return "llama3"
        return "Qwen/Qwen3-235B-A22B-Instruct-2507"

    @property
    def api_key(self) -> str:
        if self.ENVIRONMENT == "local":
            return "ollama"
        return self.NEBIUS_API_KEY

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()