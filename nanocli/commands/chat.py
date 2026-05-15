import typer
from nanocli.llm import LLMService
from rich.console import Console
from rich.prompt import Prompt
from rich.panel import Panel

console = Console()

def chat(
    model: str = typer.Option(None, "--model", "-m", help="Model yang digunakan"),
):
    """
    Mulai sesi chat interaktif dengan NanoCLI.
    """
    llm = LLMService()
    selected_model = model or llm.config.models.default
    
    messages = []
    
    console.print(Panel(
        f"Sesi Chat NanoCLI Dimulai\nModel: [bold green]{selected_model}[/bold green]\nKetik 'exit' atau 'quit' untuk keluar.",
        title="[bold blue]NanoCLI Chat[/bold blue]",
        expand=False
    ))

    while True:
        try:
            user_input = Prompt.ask("[bold cyan]You[/bold cyan]")
            
            if user_input.lower() in ["exit", "quit"]:
                console.print("[yellow]Keluar dari sesi chat.[/yellow]")
                break
            
            if not user_input.strip():
                continue

            messages.append({"role": "user", "content": user_input})
            
            console.print("[bold magenta]NanoCLI[/bold magenta]")
            response_gen = llm.chat(messages, model=selected_model)
            
            if response_gen:
                full_response = llm.stream_response(response_gen)
                messages.append({"role": "assistant", "content": full_response})
            else:
                console.print("[red]Gagal mendapatkan respons dari LLM.[/red]")
                
        except KeyboardInterrupt:
            console.print("\n[yellow]Sesi chat dihentikan oleh pengguna.[/yellow]")
            break
