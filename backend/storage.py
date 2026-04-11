from pathlib import Path

from backend.config import settings


def _ensure_dir(workspace_id: str) -> Path:
    base = Path(settings.STORAGE_DIR) / workspace_id
    base.mkdir(parents=True, exist_ok=True)
    return base


def save_file(workspace_id: str, filename: str, content: bytes) -> str:
    """Save a file and return its path."""
    path = _ensure_dir(workspace_id) / filename
    path.write_bytes(content)
    return str(path)


def get_file(workspace_id: str, filename: str) -> bytes:
    path = Path(settings.STORAGE_DIR) / workspace_id / filename
    if not path.exists():
        raise FileNotFoundError(f"File not found: {filename}")
    return path.read_bytes()


def list_files(workspace_id: str) -> list[str]:
    path = Path(settings.STORAGE_DIR) / workspace_id
    if not path.exists():
        return []
    return [f.name for f in path.iterdir() if f.is_file()]


def delete_file(workspace_id: str, filename: str) -> bool:
    path = Path(settings.STORAGE_DIR) / workspace_id / filename
    if path.exists():
        path.unlink()
        return True
    return False
