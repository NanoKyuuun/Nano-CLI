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

# Typer group for memory
memory_app = typer.Typer(help="Kelola Project Memory NanoCLI")
memory_app.command(name="init")(init)
memory_app.command(name="update")(update)
memory_app.command(name="show")(show)
