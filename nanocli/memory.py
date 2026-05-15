import yaml
from pathlib import Path
from typing import Optional, Dict, Any
from rich.console import Console

console = Console()

class MemoryManager:
    def __init__(self, project_root: Optional[Path] = None):
        self.project_root = project_root or Path.cwd()
        self.memory_dir = self.project_root / ".nanocli"
        self.context_file = self.memory_dir / "PROJECT_CONTEXT.md"
        self.decisions_file = self.memory_dir / "memory" / "decisions.md"
        self.changelog_file = self.memory_dir / "memory" / "changelog.md"
        self.bugs_file = self.memory_dir / "memory" / "bugs.md"

    def init_project(self):
        """
        Inisialisasi struktur folder .nanocli
        """
        if self.memory_dir.exists():
            console.print("[yellow]NanoCLI sudah terinisialisasi di folder ini.[/yellow]")
            return

        # Create directories
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        (self.memory_dir / "memory").mkdir(exist_ok=True)
        (self.memory_dir / "index").mkdir(exist_ok=True)
        (self.memory_dir / "summaries" / "files").mkdir(parents=True, exist_ok=True)
        (self.memory_dir / "sessions").mkdir(exist_ok=True)
        (self.memory_dir / "cache").mkdir(exist_ok=True)

        # Create initial files
        self._create_initial_context()
        self._create_initial_memory_files()
        
        console.print(f"[bold green]NanoCLI initialized successfully at {self.project_root}[/bold green]")
        console.print(f"Project memory created at [cyan].nanocli/[/cyan]")

    def _create_initial_context(self):
        content = """# Project Context

## Project Name
{project_name}

## Project Goal
Deskripsikan tujuan utama proyek ini di sini.

## Tech Stack
- Language: 
- Framework: 
- Database: 

## Main Architecture
Jelaskan arsitektur utama proyek ini.

## Important Commands
- Install: 
- Run: 
- Test: 

## Current Development Focus
Apa yang sedang dikerjakan saat ini?

## Known Issues
Daftar masalah yang diketahui.

## Coding Rules
Aturan penulisan kode untuk proyek ini.
""".format(project_name=self.project_root.name)
        
        with open(self.context_file, "w", encoding="utf-8") as f:
            f.write(content)

    def _create_initial_memory_files(self):
        files = {
            self.decisions_file: "# Technical Decisions\n\n",
            self.changelog_file: "# Project Changelog\n\n",
            self.bugs_file: "# Known Bugs\n\n",
        }
        for path, content in files.items():
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)

    def get_project_context(self) -> str:
        """
        Membaca PROJECT_CONTEXT.md jika ada.
        """
        if self.context_file.exists():
            with open(self.context_file, "r", encoding="utf-8") as f:
                return f.read()
        return ""

    def get_relevant_memory(self) -> str:
        """
        Mengambil ringkasan memori (decisions, changelog, bugs).
        """
        memory_text = ""
        for label, path in [("Decisions", self.decisions_file), 
                            ("Changelog", self.changelog_file), 
                            ("Bugs", self.bugs_file)]:
            if path.exists():
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if content and content != f"# {label}":
                        memory_text += f"\n### {label}\n{content}\n"
        return memory_text

    def get_file_index(self) -> str:
        """
        Membaca file_index.json untuk memberikan gambaran struktur file dan fungsinya.
        """
        index_path = self.memory_dir / "index" / "file_index.json"
        if index_path.exists():
            import json
            try:
                with open(index_path, "r", encoding="utf-8") as f:
                    index_data = json.load(f)
                
                index_text = "\n### Project File Structure & Summaries:\n"
                for file_path, data in index_data.items():
                    index_text += f"- **{file_path}**: {data.get('summary', 'No summary available.')}\n"
                return index_text
            except:
                return ""
        return ""
