/** 前端到 API 的调用封装。API Key 通过请求头传递，仅存内存。 */

export interface CatalogModel {
  id: string;
  name: string;
  description: string;
  created?: number;
  pricing?: { prompt?: string; completion?: string };
  supportsImage: boolean;
  supportsJsonSchema: boolean;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  detail?: string;
}

export class ApiClientError extends Error {
  code: string;
  detail?: string;
  constructor(code: string, message: string, detail?: string) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export function apiUnavailableMessage(): string {
  const hostname = typeof window === "undefined" ? "" : window.location.hostname;
  const local = import.meta.env.DEV || hostname === "localhost" || hostname === "127.0.0.1";
  return local
    ? "无法连接到本地 API 服务，请确认 API 已启动"
    : "无法连接到线上 API 服务，请稍后重试";
}

async function handle<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }
  if (!res.ok) {
    const err = (body as { error?: ApiErrorBody } | null)?.error;
    if (err) {
      const detail = err.detail ? `：${err.detail}` : "";
      throw new ApiClientError(err.code, `${err.message}${detail}`, err.detail);
    }
    throw new ApiClientError("http", `HTTP ${res.status}`);
  }
  return body as T;
}

export async function fetchHealth(): Promise<{ ok: boolean; version: string; mock: boolean; defaultModel: string }> {
  return handle(await fetch("/api/health"));
}

export async function fetchModels(apiKey?: string): Promise<{ models: CatalogModel[]; mock: boolean }> {
  return handle<{ models: CatalogModel[]; mock: boolean }>(
    await fetch("/api/models", {
      headers: apiKey ? { "x-openrouter-key": apiKey } : undefined,
    })
  );
}

export interface GenerateRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  images?: Array<{ mime: string; dataUrl: string }>;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  useJsonSchema?: boolean;
  jsonSchema?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface GenerateResponse {
  content: string;
  model: string;
  structuredUsed: boolean;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export async function generateRequest(
  req: GenerateRequest & { apiKey?: string },
  timeoutMs = 600_000
): Promise<GenerateResponse> {
  const controller = new AbortController();
  const externalSignal = req.signal;
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { signal: _signal, ...bodyReq } = req;
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(req.apiKey ? { "x-openrouter-key": req.apiKey } : {}),
      },
      body: JSON.stringify({ ...bodyReq, images: req.images } as GenerateRequest),
      signal: controller.signal,
    });
    return await handle<GenerateResponse>(res);
  } catch (err) {
    if (externalSignal?.aborted) throw new DOMException("请求已停止", "AbortError");
    if (err instanceof ApiClientError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiClientError("timeout", "请求超时（10 分钟），请重试");
    }
    throw new ApiClientError("network", apiUnavailableMessage());
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}
