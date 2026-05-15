import typer
from nanocli.config import load_config, save_config
from rich.console import Console
from rich.table import Table

console = Console()

def show():
    """
    Tampilkan konfigurasi NanoCLI saat ini.
    """
    config = load_config()
    
    table = Table(title="NanoCLI Configuration")
    table.add_column("Category", style="cyan")
    table.add_column("Key", style="magenta")
    table.add_column("Value", style="green")

    # Models
    for key, value in config.models.model_dump().items():
        table.add_row("Models", key, str(value))
    
    # Ollama
    for key, value in config.ollama.model_dump().items():
        table.add_row("Ollama", key, str(value))

    console.print(table)

def set_val(
    key: str = typer.Argument(..., help="Key konfigurasi (misal: models.default)"),
    value: str = typer.Argument(..., help="Value baru"),
):
    """
    Ubah nilai konfigurasi.
    """
    config = load_config()
    
    try:
        parts = key.split(".")
        if len(parts) != 2:
            console.print("[red]Format key salah. Gunakan 'category.key' (misal: models.default)[/red]")
            return
        
        category, attr = parts
        if hasattr(config, category):
            cat_obj = getattr(config, category)
            if hasattr(cat_obj, attr):
                # Basic type conversion
                current_val = getattr(cat_obj, attr)
                if isinstance(current_val, bool):
                    new_val = value.lower() in ["true", "1", "yes"]
                elif isinstance(current_val, int):
                    new_val = int(value)
                elif isinstance(current_val, float):
                    new_val = float(value)
                else:
                    new_val = value
                
                setattr(cat_obj, attr, new_val)
                save_config(config)
                console.print(f"[green]Konfigurasi {key} berhasil diubah menjadi {new_val}[/green]")
            else:
                console.print(f"[red]Key '{attr}' tidak ditemukan di kategori '{category}'[/red]")
        else:
            console.print(f"[red]Kategori '{category}' tidak ditemukan[/red]")
            
    except Exception as e:
        console.print(f"[red]Gagal mengubah konfigurasi:[/red] {e}")

# Typer group for config
config_app = typer.Typer(help="Kelola konfigurasi NanoCLI")
config_app.command(name="show")(show)
config_app.command(name="set")(set_val)
