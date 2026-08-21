from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    secret_key: str
    officer_password: str
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    frontend_url: str = "http://localhost:5173"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-lite-latest"
    internal_api_secret: str = ""
    token_encryption_key: str = ""
    github_token: str = ""
    github_repo: str = ""

    model_config = {"env_file": ".env"}


settings = Settings()
