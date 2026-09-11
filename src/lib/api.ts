/** 前端到 API 的调用封装。API Key 通过请求头传递，仅存内存。 */

import type { TestCase } from "@/types";
import { buildScriptMessages, buildTestCaseExtractionMessages } from "@/lib/scriptPrompt";

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

/** 将一条手工测试用例转换为 Robot Framework 脚本（复用生成 API）。htmlSource 非空时按带 HTML 解析的 Prompt 生成真实定位脚本。 */
export async function generateScriptRequest(
  testCase: TestCase,
  options: {
    model: string;
    apiKey?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
    htmlSource?: string;
  }
): Promise<GenerateResponse> {
  return generateRequest(
    {
      model: options.model,
      messages: buildScriptMessages(testCase, options.htmlSource),
      temperature: 0.2,
      maxTokens: 4000,
      apiKey: options.apiKey,
      signal: options.signal,
      useJsonSchema: false,
    },
    options.timeoutMs ?? 600_000,
  );
}

/** 从测试用例文档中提取全部手工测试用例（复用 /api/generate 链路）。 */
export async function extractTestCasesRequest(options: {
  documentText: string;
  images?: Array<{ mime: string; dataUrl: string }>;
  model: string;
  apiKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<GenerateResponse> {
  return generateRequest(
    {
      model: options.model,
      messages: buildTestCaseExtractionMessages(options.documentText),
      images: options.images,
      temperature: 0.1,
      maxTokens: 12000,
      apiKey: options.apiKey,
      signal: options.signal,
      useJsonSchema: false,
    },
    options.timeoutMs ?? 600_000,
  );
}

/** AI 审查用例请求（复用生成链路，构造不同的 messages） */
export async function reviewRequest(
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
    const res = await fetch("/api/review", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(req.apiKey ? { "x-openrouter-key": req.apiKey } : {}),
      },
      body: JSON.stringify(bodyReq as GenerateRequest),
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

/** AI 需求预审请求（复用生成链路，构造不同的 messages） */
export async function prereviewRequest(
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
    const res = await fetch("/api/prereview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(req.apiKey ? { "x-openrouter-key": req.apiKey } : {}),
      },
      body: JSON.stringify(bodyReq as GenerateRequest),
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

// ─── AI Bug 分析 ────────────────────────────────────────────

export interface BugAnalyseApiResponse {
  code: number;
  data?: {
    problemType: string;
    belong: string;
    reason: string;
    suggest: string[];
    focusPoint: string;
    regressionAdvice?: unknown;
  };
  message?: string;
}

export interface BugAnalyseRequest {
  text: string;
  imageBase64?: string;
  signal?: AbortSignal;
}

/** AI Bug 分析请求：后端负责 OCR + 模型调用 + 结构化输出 */
export async function bugAnalyseRequest(
  req: BugAnalyseRequest,
  timeoutMs = 60_000
): Promise<BugAnalyseApiResponse["data"] & object> {
  const controller = new AbortController();
  const externalSignal = req.signal;
  const abortFromExternal = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body: Record<string, unknown> = { text: req.text };
    if (req.imageBase64) body.imageBase64 = req.imageBase64;
    const res = await fetch("/api/ai/bug-analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let resp: BugAnalyseApiResponse | null = null;
    try {
      resp = (await res.json()) as BugAnalyseApiResponse;
    } catch {
      /* 非 JSON 响应 */
    }
    if (!res.ok) {
      const msg = resp?.message ?? `HTTP ${res.status}`;
      const code = resp?.code !== undefined ? String(resp.code) : "http";
      throw new ApiClientError(code, msg);
    }
    if (!resp || resp.code !== 0 || !resp.data) {
      throw new ApiClientError(
        resp?.code !== undefined ? String(resp.code) : "bad_response",
        resp?.message ?? "接口返回格式异常"
      );
    }
    return resp.data;
  } catch (err) {
    if (externalSignal?.aborted) throw new DOMException("请求已停止", "AbortError");
    if (err instanceof ApiClientError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiClientError("timeout", "AI分析请求超时，请减少内容重试");
    }
    throw new ApiClientError("network", apiUnavailableMessage());
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}
