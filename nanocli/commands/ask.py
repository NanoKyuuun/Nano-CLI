import typer
from nanocli.llm import LLMService
from nanocli.memory import MemoryManager
from rich.console import Console

console = Console()

def ask(
    prompt: str = typer.Argument(..., help="Pertanyaan atau instruksi untuk AI"),
    model: str = typer.Option(None, "--model", "-m", help="Model yang digunakan"),
    fast: bool = typer.Option(False, "--fast", help="Gunakan model cepat"),
    deep: bool = typer.Option(False, "--deep", help="Gunakan model deep review"),
    project: bool = typer.Option(False, "--project", help="Gunakan Project Memory"),
):
    """
    Tanya cepat ke AI NanoCLI.
    """
    llm = LLMService()
    
    # Model selection logic
    selected_model = model
    num_ctx = None
    
    if not selected_model:
        if fast:
            selected_model = llm.config.models.fast
            num_ctx = llm.config.ollama.num_ctx_fast
        elif deep:
            selected_model = llm.config.models.deep
            num_ctx = llm.config.ollama.num_ctx_deep
        else:
            selected_model = llm.config.models.default
            num_ctx = llm.config.ollama.num_ctx_normal

    messages = []
    
    if project:
        memory = MemoryManager()
        context = memory.get_project_context()
        relevant_mem = memory.get_relevant_memory()
        file_index = memory.get_file_index()
        
        if context or relevant_mem or file_index:
            system_prompt = "You are NanoCLI, a local AI coding assistant.\n"
            if context:
                system_prompt += f"\nProject Context:\n{context}\n"
            if relevant_mem:
                system_prompt += f"\nRelevant Memory:\n{relevant_mem}\n"
            if file_index:
                system_prompt += f"\n{file_index}\n"
            
            messages.append({"role": "system", "content": system_prompt})
            console.print("[dim]Project Memory aktif.[/dim]")

    messages.append({"role": "user", "content": prompt})
    
    console.print(f"[dim]Menggunakan model: {selected_model}[/dim]")
    
    response_gen = llm.chat(messages, model=selected_model, num_ctx=num_ctx)
    if response_gen:
        llm.stream_response(response_gen)
