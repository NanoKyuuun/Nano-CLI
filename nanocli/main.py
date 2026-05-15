import typer
from rich.console import Console
from nanocli import __version__
from nanocli.commands.ask import ask
from nanocli.commands.chat import chat
from nanocli.commands.review import review
from nanocli.commands.debug import debug
from nanocli.commands.test import test
from nanocli.commands.memory import memory_app
from nanocli.commands.plan import plan
from nanocli.commands.patch import patch
from nanocli.commands.models import models_app
from nanocli.commands.config import config_app

app = typer.Typer(
    name="nanocli",
    help="NanoCLI: Local AI Coding Assistant with Project Memory",
    add_completion=False,
)
console = Console()

app.command(name="ask")(ask)
app.command(name="chat")(chat)
app.command(name="review")(review)
app.command(name="debug")(debug)
app.command(name="test")(test)
app.add_typer(memory_app, name="memory")
app.command(name="plan")(plan)
app.command(name="patch")(patch)
app.add_typer(models_app, name="models")
app.add_typer(config_app, name="config")

@app.callback()
def callback():
    """
    NanoCLI - Local AI Coding Assistant.
    """
    pass

@app.command()
def version():
    """
    Tampilkan versi NanoCLI.
    """
    console.print(f"[bold blue]NanoCLI[/bold blue] version: [green]{__version__}[/green]")

if __name__ == "__main__":
    app()
