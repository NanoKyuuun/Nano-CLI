import time
import typer
from nanocli.llm import LLMService
from rich.console import Console
from rich.table import Table
from rich.progress import Progress

console = Console()

def benchmark(
    save: bool = typer.Option(False, "--save", help="Simpan hasil benchmark"),
):
    """
    Uji performa model lokal di laptop kamu.
    """
    llm = LLMService()
    models_to_test = [
        llm.config.models.fast,
        llm.config.models.default,
        llm.config.models.deep,
        llm.config.models.fallback_coder
    ]
    
    results = []
    prompt = "Tulis fungsi Python singkat untuk menghitung faktorial."
    messages = [{"role": "user", "content": prompt}]

    console.print("[bold blue]Memulai Model Benchmark...[/bold blue]\n")

    with Progress() as progress:
        task = progress.add_task("[cyan]Testing models...", total=len(models_to_test))
        
        for model_name in models_to_test:
            progress.update(task, description=f"[cyan]Testing {model_name}...")
            
            start_time = time.time()
            response = llm.client.chat(
                model=model_name,
                messages=messages,
                stream=False,
                options={"num_predict": 100} # Limit output for benchmark
            )
            end_time = time.time()
            
            duration = end_time - start_time
            content = response.get("message", {}).get("content", "")
            token_count = len(content.split()) # Rough estimation
            tokens_per_sec = token_count / duration if duration > 0 else 0
            
            results.append({
                "model": model_name,
                "duration": f"{duration:.2f}s",
                "speed": f"{tokens_per_sec:.1f} tok/s",
                "status": "✅ Success"
            })
            progress.update(task, advance=1)

    table = Table(title="Model Benchmark Results")
    table.add_column("Model", style="cyan")
    table.add_column("Duration", style="magenta")
    table.add_column("Est. Speed", style="green")
    table.add_column("Status", style="yellow")

    for res in results:
        table.add_row(res["model"], res["duration"], res["speed"], res["status"])

    console.print(table)

# Typer group for models
models_app = typer.Typer(help="Kelola dan uji model Ollama")
models_app.command(name="benchmark")(benchmark)
