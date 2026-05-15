import os
from pathlib import Path
from typing import List, Optional
from rich.console import Console

console = Console()

# Default ignore patterns
DEFAULT_IGNORE = {
    ".git", "node_modules", ".venv", "venv", "__pycache__", 
    "dist", "build", ".env", ".env.local", ".env.development",
    ".env.test", ".env.production", "*.pem", "*.key", "*.crt",
    "*.p12", "*.sqlite", "*.db", "package-lock.json", "poetry.lock"
}

class FileHandler:
    def __init__(self, project_root: Optional[Path] = None):
        self.project_root = project_root or Path.cwd()

    def read_file(self, file_path: str) -> Optional[str]:
        """
        Membaca isi file dengan aman.
        """
        full_path = self.project_root / file_path
        
        if not full_path.exists():
            console.print(f"[red]Error: File {file_path} tidak ditemukan.[/red]")
            return None
        
        if not full_path.is_file():
            console.print(f"[red]Error: {file_path} bukan merupakan file.[/red]")
            return None

        # Check for sensitive files (basic check)
        if full_path.name in DEFAULT_IGNORE or any(full_path.match(p) for p in DEFAULT_IGNORE):
            console.print(f"[yellow]Warning: File {file_path} diabaikan karena alasan keamanan/sensitivitas.[/yellow]")
            return None

        try:
            with open(full_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            console.print(f"[red]Error membaca file {file_path}:[/red] {e}")
            return None

    def get_file_extension(self, file_path: str) -> str:
        return Path(file_path).suffix.lower().replace(".", "")
