import typer
from nanocli.llm import LLMService
from nanocli.files import FileHandler
from rich.console import Console

console = Console()

def test(
    file_path: str = typer.Argument(..., help="Path ke file yang ingin dibuatkan test-nya"),
    model: str = typer.Option(None, "--model", "-m", help="Model yang digunakan"),
    framework: str = typer.Option("pytest", "--framework", help="Testing framework yang digunakan"),
):
    """
    Generate unit test untuk file tertentu.
    """
    llm = LLMService()
    file_handler = FileHandler()
    
    content = file_handler.read_file(file_path)
    if not content:
        return

    selected_model = model or llm.config.models.default
    
    system_prompt = (
        "You are a test generation assistant. "
        f"Generate practical unit tests for the given file using {framework}. "
        "Include edge cases and cover normal behavior. "
        "Do not test implementation details that should remain private."
    )
    
    user_prompt = f"Buat unit test untuk file berikut:\n\nPath: {file_path}\n\n```\n{content}\n```"
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    console.print(f"[dim]Generating tests for {file_path} using {selected_model}...[/dim]")
    
    response_gen = llm.chat(messages, model=selected_model)
    if response_gen:
        llm.stream_response(response_gen)
