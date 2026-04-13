"""Configuration for Inyatsi File Portal backend."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """App settings from environment."""

    # AD / LDAP
    ad_server: str = "ldap://dc.inyatsi.com"
    ad_base_dn: str = "DC=inyatsi,DC=com"
    ad_domain: str = ""  # e.g. INYATSI for LookupAccountName
    ad_bind_user: str = ""
    ad_bind_password: str = ""
    ad_user_filter: str = "(&(objectClass=user)(sAMAccountName={username}))"

    # SMB File Server
    smb_server: str = "fileserver.inyatsi.com"
    smb_share: str = "InyatsiFiles"
    smb_username: str = ""
    smb_password: str = ""
    smb_domain: str = "INYATSI"

    # Or use UNC path (Windows)
    smb_unc: str = ""  # e.g. \\fileserver\InyatsiFiles

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 12

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Port
    port: int = 8000

    # AD Group → Department mapping (JSON path or inline)
    ad_groups_config: str = "config/ad_groups.json"

    # File scanner – mounted paths to scan for file counts
    # Env FILE_SCANNER_PATHS: "path|dept_id,path2|dept_id2" e.g. "Z:/Engineering/Site_Reports|site-reports"
    file_scanner_paths_env: str = ""
    # Or FILE_SERVER_ROOT for single path
    file_server_root: str = ""
    # Scan interval in seconds (0 = run once on startup only)
    file_scanner_interval: int = 300

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
