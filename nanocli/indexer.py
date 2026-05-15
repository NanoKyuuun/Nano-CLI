import os
import json
from pathlib import Path
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from nanocli.files import FileHandler, DEFAULT_IGNORE
from nanocli.llm import LLMService
from rich.console import Console
from rich.progress import Progress

console = Console()

class Indexer:
    def __init__(self, project_root: Optional[Path] = None):
        self.project_root = project_root or Path.cwd()
        self.memory_dir = self.project_root / ".nanocli"
        self.summaries_dir = self.memory_dir / "summaries" / "files"
        self.index_file = self.memory_dir / "index" / "file_index.json"
        self.file_handler = FileHandler(self.project_root)
        self.llm = LLMService()
        self.existing_index = self._load_existing_index()

    def _load_existing_index(self) -> Dict:
        if self.index_file.exists():
            try:
                with open(self.index_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except:
                return {}
        return {}

    def scan_project(self) -> List[Path]:
        """
        Scan project untuk mencari file yang perlu di-index.
        """
        files_to_index = []
        for root, dirs, files in os.walk(self.project_root):
            # Filter directories
            dirs[:] = [d for d in dirs if d not in DEFAULT_IGNORE and not d.startswith(".")]
            
            for file in files:
                # Skip common non-code/large files
                if file.startswith(".") or any(file.endswith(ext) for ext in [
                    ".pyc", ".exe", ".bin", ".png", ".jpg", ".jpeg", ".gif", ".pdf", 
                    ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mp3", ".wav", ".zip", ".tar.gz"
                ]):
                    continue
                
                rel_path = Path(root).relative_to(self.project_root) / file
                files_to_index.append(rel_path)
        
        return files_to_index

    def _is_cache_valid(self, file_path: Path) -> bool:
        """
        Cek apakah cache untuk file ini masih valid (mtime tidak berubah).
        """
        key = str(file_path)
        if key not in self.existing_index:
            return False
        full_path = self.project_root / file_path
        try:
            current_mtime = os.path.getmtime(full_path)
            return self.existing_index[key].get("mtime") == current_mtime
        except OSError:
            return False

    def summarize_file(self, file_path: Path) -> str:
        """
        Gunakan LLM untuk membuat ringkasan singkat isi file.
        Hanya dipanggil jika cache sudah dinyatakan tidak valid.
        """
        content = self.file_handler.read_file(str(file_path))
        if not content:
            return "Gagal membaca file."

        # Limit content for summarization — sesuai PRD §14.4 file_chunk_chars
        if len(content) > 4000:
            content = content[:4000] + "\n... (file truncated for summarization)"

        prompt = (
            f"Berikan ringkasan teknis singkat (maksimal 3 kalimat) tentang fungsi utama file ini:\n"
            f"Path: {file_path}\n\n"
            f"Content:\n```\n{content}\n```"
        )

        messages = [{"role": "user", "content": prompt}]
        # Gunakan fast model + num_ctx_fast untuk summarization.
        # PRD §7.8: Fast mode = 4096–8192. Summarization tidak butuh context besar.
        # num_predict dibatasi 512 karena output hanya 3 kalimat ringkasan.
        response_gen = self.llm.chat(
            messages,
            model=self.llm.config.models.fast,
            stream=False,
            num_ctx=self.llm.config.ollama.num_ctx_fast,
            num_predict=512,
        )

        if response_gen and "message" in response_gen:
            return response_gen["message"]["content"].strip()
        return "Gagal membuat ringkasan."

    def process_file(self, file_path: Path) -> tuple:
        """
        Panggil LLM untuk meringkas file, lalu simpan summary ke disk.
        Hanya dipanggil untuk file yang sudah diverifikasi tidak ada di cache.
        """
        summary = self.summarize_file(file_path)
        full_path = self.project_root / file_path
        mtime = os.path.getmtime(full_path)

        # Simpan individual summary file
        summary_path = self.summaries_dir / f"{file_path}.md"
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        with open(summary_path, "w", encoding="utf-8") as f:
            f.write(f"# Summary: {file_path}\n\n{summary}")

        return str(file_path), {
            "summary": summary,
            "extension": self.file_handler.get_file_extension(str(file_path)),
            "mtime": mtime,
        }

    def update_index(self):
        """
        Jalankan proses indexing dengan incremental update dan parallel LLM calls.

        Strategi:
        - File yang tidak berubah (cache hit by mtime) langsung dipakai dari index lama.
          Tidak ada LLM call dan tidak ada penulisan ulang summary file.
        - File yang berubah atau baru diproses secara paralel dengan ThreadPoolExecutor.
        - PRD §17.1 target: proyek kecil selesai dalam 1–5 menit.
        """
        if not self.memory_dir.exists():
            console.print("[red]Project belum terinisialisasi. Jalankan 'nanocli memory init' dulu.[/red]")
            return

        files = self.scan_project()
        new_index: Dict = {}

        # Pisahkan file yang perlu diproses dari yang sudah ada di cache
        files_to_process: List[Path] = []
        files_cached: List[Path] = []

        for f in files:
            if self._is_cache_valid(f):
                # Cache hit: salin langsung dari existing index, skip LLM + skip disk write
                new_index[str(f)] = self.existing_index[str(f)]
                files_cached.append(f)
            else:
                files_to_process.append(f)

        console.print(
            f"[cyan]Ditemukan {len(files)} file. "
            f"[green]{len(files_cached)} cached[/green], "
            f"[yellow]{len(files_to_process)} perlu diproses.[/yellow]"
        )

        files_summarized = 0
        files_failed = 0

        if files_to_process:
            # Parallel LLM calls hanya untuk file yang benar-benar perlu diperbarui.
            # max_workers=3 dipertahankan sesuai kapasitas RTX 3050 4GB (PRD §6.1).
            with Progress() as progress:
                task = progress.add_task(
                    f"[cyan]Memproses {len(files_to_process)} file baru/berubah...",
                    total=len(files_to_process),
                )

                with ThreadPoolExecutor(max_workers=3) as executor:
                    futures = {executor.submit(self.process_file, f): f for f in files_to_process}

                    for future in as_completed(futures):
                        try:
                            file_path_str, data = future.result()
                            new_index[file_path_str] = data
                            files_summarized += 1
                        except Exception as e:
                            failed_file = futures[future]
                            console.print(f"[red]Gagal memproses {failed_file}: {e}[/red]")
                            files_failed += 1
                        finally:
                            progress.update(task, advance=1)

        # Simpan global index
        with open(self.index_file, "w", encoding="utf-8") as f:
            json.dump(new_index, f, indent=2)

        # Output statistik sesuai PRD §12.7
        console.print(f"[bold green]Memory updated![/bold green]")
        console.print(f"  Files scanned   : {len(files)}")
        console.print(f"  Files cached    : [green]{len(files_cached)}[/green]")
        console.print(f"  Files summarized: [yellow]{files_summarized}[/yellow]")
        if files_failed:
            console.print(f"  Files failed    : [red]{files_failed}[/red]")
        console.print(f"  Index updated   : [cyan].nanocli/index/file_index.json[/cyan]")
