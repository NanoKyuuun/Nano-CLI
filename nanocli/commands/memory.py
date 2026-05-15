import typer
from nanocli.memory import MemoryManager
from nanocli.indexer import Indexer
from rich.console import Console

console = Console()

def init():
    """
    Inisialisasi NanoCLI di proyek saat ini.
    """
    manager = MemoryManager()
    manager.init_project()

def update():
    """
    Perbarui memori proyek dengan melakukan scan dan indexing file.
    """
    indexer = Indexer()
    indexer.update_index()

def show():
    """
    Tampilkan konteks memori saat ini.
    """
    manager = MemoryManager()
    context = manager.get_project_context()
    if context:
        console.print(context)
    else:
        console.print("[red]Project belum terinisialisasi. Jalankan 'nanocli init' terlebih dahulu.[/red]")

def search(
    query: str = typer.Argument(..., help="Kata kunci pencarian di memori"),
):
    """
    Cari informasi di memori proyek (file index).
    """
    manager = MemoryManager()
    index_path = manager.memory_dir / "index" / "file_index.json"
    
    if not index_path.exists():
        console.print("[red]Index belum tersedia. Jalankan 'nanocli memory update' dulu.[/red]")
        return

    import json
    with open(index_path, "r", encoding="utf-8") as f:
        index_data = json.load(f)
    
    results = []
    for file_path, data in index_data.items():
        summary = data.get("summary", "").lower()
        if query.lower() in file_path.lower() or query.lower() in summary:
            results.append((file_path, data.get("summary")))

    if results:
        console.print(f"[bold green]Hasil pencarian untuk '{query}':[/bold green]\n")
        for path, summary in results:
            console.print(f"- [cyan]{path}[/cyan]: {summary}")
    else:
        console.print(f"[yellow]Tidak ditemukan hasil untuk '{query}'[/yellow]")

# Typer group for memory
memory_app = typer.Typer(help="Kelola Project Memory NanoCLI")
memory_app.command(name="init")(init)
memory_app.command(name="update")(update)
memory_app.command(name="show")(show)
memory_app.command(name="search")(search)
