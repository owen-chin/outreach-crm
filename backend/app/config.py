from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    secret_key: str
    officer_password: str
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    frontend_url: str = "http://localhost:5173"

    model_config = {"env_file": ".env"}


settings = Settings()
