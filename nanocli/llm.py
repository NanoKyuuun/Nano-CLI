import ollama
from typing import Generator, Optional, List, Dict, Any
from nanocli.config import Config, load_config
from rich.console import Console
from rich.markdown import Markdown

console = Console()

class LLMService:
    def __init__(self, config: Optional[Config] = None):
        self.config = config or load_config()
        self.client = ollama.Client(host=self.config.ollama.host)

    def chat(
        self, 
        messages: List[Dict[str, str]], 
        model: Optional[str] = None,
        stream: bool = True,
        num_ctx: Optional[int] = None,
        num_predict: Optional[int] = None,
    ) -> Any:
        model = model or self.config.models.default
        num_ctx = num_ctx or self.config.ollama.num_ctx_normal
        
        options = {
            "temperature": self.config.ollama.temperature,
            "top_p": self.config.ollama.top_p,
            "num_ctx": num_ctx,
        }
        if num_predict is not None:
            options["num_predict"] = num_predict

        try:
            if stream:
                return self.client.chat(
                    model=model,
                    messages=messages,
                    stream=True,
                    options=options
                )
            else:
                return self.client.chat(
                    model=model,
                    messages=messages,
                    stream=False,
                    options=options
                )
        except Exception as e:
            console.print(f"[bold red]Error connecting to Ollama:[/bold red] {e}")
            return None

    def stream_response(self, response_gen: Generator) -> str:
        """
        Stream output dari Ollama ke terminal secara langsung per-chunk.

        Menggunakan direct print per-chunk (bukan rich.Live) untuk menghindari
        flicker/jitter saat konten melebihi tinggi terminal. rich.Live melakukan
        cursor repositioning dan clear-area pada setiap update, yang menyebabkan
        scroll-jerk ketika konten overflow. Direct print tidak memiliki masalah ini.
        """
        full_response = ""

        for chunk in response_gen:
            content = chunk.get("message", {}).get("content", "")
            if content:
                full_response += content
                # Print chunk langsung — terminal natural scroll, tanpa re-render
                console.print(content, end="", markup=False, highlight=False)

        # Newline setelah streaming selesai
        console.print()
        return full_response
