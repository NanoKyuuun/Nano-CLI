import typer
from nanocli.llm import LLMService
from nanocli.files import FileHandler
from nanocli.memory import MemoryManager
from rich.console import Console

console = Console()

def review(
    file_path: str = typer.Argument(..., help="Path ke file yang ingin di-review"),
    model: str = typer.Option(None, "--model", "-m", help="Model yang digunakan"),
    deep: bool = typer.Option(False, "--deep", help="Gunakan model deep review"),
    project: bool = typer.Option(False, "--project", help="Gunakan Project Memory"),
):
    """
    Review kode pada file tertentu.
    """
    llm = LLMService()
    file_handler = FileHandler()
    
    content = file_handler.read_file(file_path)
    if not content:
        return

    selected_model = model
    num_ctx = None
    
    if not selected_model:
        if deep:
            selected_model = llm.config.models.deep
            num_ctx = llm.config.ollama.num_ctx_deep
        else:
            selected_model = llm.config.models.default
            num_ctx = llm.config.ollama.num_ctx_normal

    system_prompt = (
        "You are a strict but practical code reviewer. "
        "Review the file based on correctness, maintainability, security, performance, and consistency. "
        "Return concise findings with location, issue, impact, and suggested fix. "
        "Do not rewrite the whole file unless requested."
    )
    
    if project:
        memory = MemoryManager()
        context = memory.get_project_context()
        relevant_mem = memory.get_relevant_memory()
        if context or relevant_mem:
            system_prompt += "\n\nProject Context for consistency:\n"
            if context: system_prompt += context
            if relevant_mem: system_prompt += relevant_mem
            console.print("[dim]Project Memory aktif untuk review.[/dim]")

    user_prompt = f"Review file berikut:\n\nPath: {file_path}\n\n```\n{content}\n```"
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    console.print(f"[dim]Reviewing {file_path} using {selected_model}...[/dim]")
    
    response_gen = llm.chat(messages, model=selected_model, num_ctx=num_ctx)
    if response_gen:
        llm.stream_response(response_gen)
