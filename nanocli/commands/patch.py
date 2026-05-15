import typer
from nanocli.llm import LLMService
from nanocli.files import FileHandler
from nanocli.memory import MemoryManager
from rich.console import Console

console = Console()

def patch(
    file_path: str = typer.Argument(..., help="Path ke file yang ingin di-patch"),
    instruction: str = typer.Argument(..., help="Instruksi perubahan"),
    model: str = typer.Option(None, "--model", "-m", help="Model yang digunakan"),
    project: bool = typer.Option(True, "--project", help="Gunakan Project Memory"),
):
    """
    Berikan saran patch (diff) untuk perubahan kode.
    """
    llm = LLMService()
    file_handler = FileHandler()
    
    content = file_handler.read_file(file_path)
    if not content:
        return

    selected_model = model or llm.config.models.default
    
    system_prompt = (
        "You are a coding assistant. "
        "Provide a minimal patch in unified diff format for the requested change. "
        "Explain why each change is needed. "
        "Do not rewrite the whole file."
    )
    
    if project:
        memory = MemoryManager()
        context = memory.get_project_context()
        relevant_mem = memory.get_relevant_memory()
        if context or relevant_mem:
            system_prompt += "\n\nProject Context for consistency:\n"
            if context: system_prompt += context
            if relevant_mem: system_prompt += relevant_mem
            console.print("[dim]Project Memory aktif untuk patching.[/dim]")

    user_prompt = (
        f"File: {file_path}\n"
        f"Instruction: {instruction}\n\n"
        f"Current Content:\n```\n{content}\n```\n\n"
        "Berikan saran patch dalam format unified diff."
    )
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    console.print(f"[dim]Generating patch for {file_path} using {selected_model}...[/dim]")
    
    response_gen = llm.chat(messages, model=selected_model)
    if response_gen:
        llm.stream_response(response_gen)
