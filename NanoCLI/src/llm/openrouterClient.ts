import axios, { AxiosInstance } from 'axios';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterTool {
  type: string;
  parameters?: Record<string, unknown>;
}

export interface ChatOptions {
  model?: string;
  models?: string[];     // OpenRouter fallback array
  messages: Message[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: OpenRouterTool[];  // OpenRouter server tools (e.g. openrouter:web_search)
}

/**
 * Factory untuk membuat konfigurasi OpenRouter Web Search tool.
 * Dokumentasi: https://openrouter.ai/docs/guides/features/server-tools/web-search
 */
export function createOpenRouterWebSearchTool(options?: {
  maxResults?: number;
  maxTotalResults?: number;
  contextSize?: 'low' | 'medium' | 'high';
}): OpenRouterTool {
  return {
    type: 'openrouter:web_search',
    parameters: {
      max_results: options?.maxResults ?? 5,
      max_total_results: options?.maxTotalResults ?? 10,
      search_context_size: options?.contextSize ?? 'low',
    },
  };
}

export interface OpenRouterResponse {
  id: string;
  choices: {
    message: Message;
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model?: string;        // Model yang benar-benar dipakai (bisa berbeda dari request jika fallback)
}

export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  modelUsed?: string;
}

export class OpenRouterClient {
  private client: AxiosInstance;
  private apiKey: string | undefined;

  constructor(apiKey?: string, baseUrl: string = 'https://openrouter.ai/api/v1') {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/NanoKyuuun/Nano-CLI',
        'X-Title': 'NanoCLI',
      },
    });
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  private getHeaders() {
    if (!this.apiKey) {
      throw new Error('OpenRouter API Key is not set. Please run "nanocli auth login" or set OPENROUTER_API_KEY environment variable.');
    }
    return {
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async chat(options: ChatOptions): Promise<OpenRouterResponse> {
    try {
      const response = await this.client.post<OpenRouterResponse>('/chat/completions', options, {
        headers: this.getHeaders(),
      });
      return response.data;
    } catch (error: any) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Fix Bug 3.5: Stream parser pakai SSE buffer agar tidak kehilangan chunk
   * yang terpotong di tengah JSON. Juga support `onUsage` callback untuk
   * capture usage aktual dari final SSE event.
   */
  async *streamChat(
    options: ChatOptions,
    onUsage?: (usage: UsageInfo) => void
  ): AsyncGenerator<string> {
    try {
      const response = await this.client.post(
        '/chat/completions',
        { ...options, stream: true },
        {
          headers: this.getHeaders(),
          responseType: 'stream',
          timeout: 120000
        }
      );

      let buffer = '';

      for await (const chunk of response.data) {
        buffer += (chunk as Buffer).toString('utf8');

        // Split by newline, tapi jangan buang sisa yang belum lengkap
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();

          // Skip empty lines dan SSE comment lines (diawali ':')
          if (!line || line.startsWith(':')) continue;
          if (!line.startsWith('data:')) continue;

          const data = line.slice(5).trim();
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);

            // Capture usage aktual jika ada di final chunk
            if (parsed.usage && onUsage) {
              onUsage({
                promptTokens: parsed.usage.prompt_tokens ?? 0,
                completionTokens: parsed.usage.completion_tokens ?? 0,
                totalTokens: parsed.usage.total_tokens ?? 0,
                modelUsed: parsed.model
              });
            }

            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // Dengan buffer, parse error seharusnya sangat jarang.
            // Jangan throw agar stream tidak langsung mati.
          }
        }
      }
    } catch (error: any) {
      this.handleError(error);
      throw error;
    }
  }

  async getModels() {
    try {
      const response = await this.client.get('/models', {
        headers: this.getHeaders(),
      });
      return response.data;
    } catch (error: any) {
      this.handleError(error);
      throw error;
    }
  }

  private handleError(error: any) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 401) {
        throw new Error('Invalid OpenRouter API Key.');
      } else if (status === 429) {
        throw new Error('OpenRouter Rate limit exceeded. Please try again later.');
      } else if (data && data.error) {
        throw new Error(`OpenRouter API Error: ${data.error.message || JSON.stringify(data.error)}`);
      }
    }
    throw new Error(`Connection Error: ${error.message}`);
  }
}
