import typer
from nanocli.llm import LLMService
from nanocli.files import FileHandler
from nanocli.memory import MemoryManager
from rich.console import Console

console = Console()

def debug(
    file_path: str = typer.Argument(..., help="Path ke file yang bermasalah"),
    error_message: str = typer.Argument(None, help="Pesan error atau deskripsi masalah"),
    model: str = typer.Option(None, "--model", "-m", help="Model yang digunakan"),
    project: bool = typer.Option(False, "--project", help="Gunakan Project Memory"),
):
    """
    Bantu debugging file berdasarkan pesan error.
    """
    llm = LLMService()
    file_handler = FileHandler()
    
    content = file_handler.read_file(file_path)
    if not content:
        return

    selected_model = model or llm.config.models.default
    
    system_prompt = (
        "You are a debugging assistant. "
        "Analyze the provided file and error message. "
        "Identify the most likely cause and give a step-by-step fix. "
        "Do not guess beyond available evidence."
    )
    
    if project:
        memory = MemoryManager()
        context = memory.get_project_context()
        relevant_mem = memory.get_relevant_memory()
        if context or relevant_mem:
            system_prompt += "\n\nProject Context for debugging:\n"
            if context: system_prompt += context
            if relevant_mem: system_prompt += relevant_mem
            console.print("[dim]Project Memory aktif untuk debugging.[/dim]")

    user_prompt = f"File: {file_path}\n"
    if error_message:
        user_prompt += f"Error: {error_message}\n"
    user_prompt += f"\nContent:\n```\n{content}\n```"
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    console.print(f"[dim]Debugging {file_path} using {selected_model}...[/dim]")
    
    response_gen = llm.chat(messages, model=selected_model)
    if response_gen:
        llm.stream_response(response_gen)
