import yaml
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Dict, List, Optional

DEFAULT_CONFIG_PATH = Path.home() / ".nanocli" / "config.yaml"

class ModelConfig(BaseModel):
    default: str = "qwen3.5:4b-q4_K_M"
    fast: str = "qwen3.5:2b-q4_K_M"
    deep: str = "qwen3.5:9b-q4_K_M"
    fallback_coder: str = "qwen2.5-coder:3b"
    deep_coder: str = "qwen2.5-coder:7b"
    embedding: str = "nomic-embed-text"

class OllamaConfig(BaseModel):
    host: str = "http://localhost:11434"
    stream: bool = True
    temperature: float = 0.2
    top_p: float = 0.9
    num_ctx_fast: int = 8192
    num_ctx_normal: int = 16384
    num_ctx_deep: int = 32768

class Config(BaseModel):
    models: ModelConfig = Field(default_factory=ModelConfig)
    ollama: OllamaConfig = Field(default_factory=OllamaConfig)

def load_config(config_path: Optional[Path] = None) -> Config:
    path = config_path or DEFAULT_CONFIG_PATH
    if not path.exists():
        return Config()
    
    with open(path, "r") as f:
        data = yaml.safe_load(f)
        return Config(**data)

def save_config(config: Config, config_path: Optional[Path] = None):
    path = config_path or DEFAULT_CONFIG_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        yaml.dump(config.model_dump(), f)
