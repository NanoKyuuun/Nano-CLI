import typer
from nanocli.llm import LLMService
from nanocli.memory import MemoryManager
from rich.console import Console

console = Console()

def plan(
    goal: str = typer.Argument(..., help="Tujuan atau fitur yang ingin direncanakan"),
    model: str = typer.Option(None, "--model", "-m", help="Model yang digunakan"),
    project: bool = typer.Option(True, "--project", help="Gunakan Project Memory"),
):
    """
    Buat rencana implementasi teknis untuk fitur baru.
    """
    llm = LLMService()
    selected_model = model or llm.config.models.default
    
    system_prompt = (
        "You are a software architect. "
        "Create a technical implementation plan based on the user's goal and project context. "
        "Identify affected files, break down steps, and consider risks and testing."
    )
    
    if project:
        memory = MemoryManager()
        context = memory.get_project_context()
        relevant_mem = memory.get_relevant_memory()
        file_index = memory.get_file_index()
        
        if context or relevant_mem or file_index:
            system_prompt += "\n\nProject Context:\n"
            if context: system_prompt += context
            if relevant_mem: system_prompt += relevant_mem
            if file_index: system_prompt += file_index
            console.print("[dim]Project Memory aktif untuk planning.[/dim]")

    user_prompt = f"Goal: {goal}\n\nBuat rencana implementasi teknis yang detail."
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    console.print(f"[dim]Planning for: '{goal}' using {selected_model}...[/dim]")
    
    response_gen = llm.chat(messages, model=selected_model)
    if response_gen:
        llm.stream_response(response_gen)
