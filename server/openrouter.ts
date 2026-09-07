export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const NETWORK_RETRIES = 2;

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  created?: number;
  pricing?: { prompt?: string; completion?: string };
  supportsImage: boolean;
  supportsJsonSchema: boolean;
}

export interface GenerateParams {
  model: string;
  messages: Array<{ role: string; content: string }>;
  /** 附加图片（dataURL，含 mime 前缀） */
  images?: Array<{ mime: string; dataUrl: string }>;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  useJsonSchema?: boolean;
  jsonSchema?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface GenerateSuccess {
  content: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  finishReason?: string;
  structuredUsed: boolean;
}

export class ApiError extends Error {
  code: string;
  status?: number;
  detail?: string;
  constructor(code: string, message: string, status?: number, detail?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/** 从 OpenRouter 返回体判断是否为地域限制类错误 */
function isGeoError(detail: string): boolean {
  const low = detail.toLowerCase();
  if (low.includes("not available in your region")) return true;
  if (/geo\s*restriction/.test(low)) return true;
  if (/regional\s*surcharge/.test(low)) return true;
  if ((low.includes("region") || low.includes("geo") || low.includes("country")) &&
      /(not available|blocked|forbidden|restrict|unavailabl)/.test(low)) return true;
  return false;
}

export function mapHttpError(status: number, bodyText: string): ApiError {
  let detail = "";
  try {
    const body = JSON.parse(bodyText);
    detail = body?.error?.message || body?.message || "";
    if (body?.error?.metadata) detail = `${detail} | metadata: ${JSON.stringify(body.error.metadata)}`;
    if (!detail && body?.error) detail = JSON.stringify(body.error);
    if (!detail && body) detail = JSON.stringify(body);
  } catch {
    detail = bodyText.slice(0, 300);
  }
  if (isGeoError(detail)) {
    return new ApiError("region_not_supported", "该模型暂不支持您当前的访问区域（地域限制），请更换为其他可用模型后重试。", status, detail);
  }
  switch (status) {
    case 401:
    case 403:
      return new ApiError("auth", "API Key 无效或已被拒绝（401）", status, detail);
    case 402:
      return new ApiError("insufficient_credits", "OpenRouter 余额不足或需要充值（402）", status, detail);
    case 404:
      return new ApiError("not_found", "模型不存在或已被下架（404）", status, detail);
    case 413:
      return new ApiError("payload_too_large", "请求体过大，请减少文档或图片（413）", status, detail);
    case 429:
      // 取出 provider 给出的首行原因（去掉 metadata 原始 JSON，避免把整段英文糊到界面）
      const firstLine = detail.split("| metadata:")[0].trim().slice(0, 160);
      return new ApiError("rate_limited", "请求过于频繁（429）：当前 AI 服务暂时繁忙或被限流，请稍等片刻后重试，或更换其他模型。", status, firstLine);
    default:
      return new ApiError("upstream", `OpenRouter 服务异常（HTTP ${status}）`, status, detail);
  }
}

/** OpenRouter 的连接偶发失败时自动短暂重试，避免一次 DNS/TLS/连接抖动直接中断生成。 */
async function fetchOpenRouter(input: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= NETWORK_RETRIES; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastError = err;
      if (attempt >= NETWORK_RETRIES || (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError"))) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ─── 模型目录（5 分钟缓存） ────────────────────────────────

let modelCache: { at: number; data: ModelInfo[] } | null = null;

export async function fetchModels(apiKey?: string): Promise<ModelInfo[]> {
  const now = Date.now();
  if (modelCache && now - modelCache.at < 5 * 60 * 1000) {
    return modelCache.data;
  }
  const res = await fetchOpenRouter(`${OPENROUTER_BASE}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw mapHttpError(res.status, (await res.text()) ?? "");
  const body = (await res.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      description?: string;
      created?: number;
      pricing?: { prompt?: string; completion?: string };
      architecture?: { input_modalities?: string[] };
      supported_parameters?: string[];
    }>;
  };
  const list: ModelInfo[] = (body.data ?? []).map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    description: m.description ?? "",
    created: m.created,
    pricing: m.pricing,
    supportsImage: Boolean(m.architecture?.input_modalities?.includes("image")),
    supportsJsonSchema: Boolean(
      m.supported_parameters?.some((p) => p === "response_format" || p === "structured_outputs")
    ),
  }));
  modelCache = { at: now, data: list };
  return list;
}

// ─── 生成请求 ──────────────────────────────────────────────

export async function generate(params: GenerateParams): Promise<GenerateSuccess> {
  const { model, messages, images = [], temperature, maxTokens, apiKey, useJsonSchema, jsonSchema } = params;

  // 复制消息（前 N-1 条保持纯文本）；最后一条 user 消息：
  // 无图片时保持纯字符串（兼容性最好），有图片时才转为多模态 content 数组
  const leading = messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));

  const lastUserText = messages.length > 0 ? messages[messages.length - 1].content : "";
  let lastUserContent: unknown = lastUserText;
  if (images.length > 0) {
    lastUserContent = [{ type: "text", text: lastUserText }];
    for (const img of images) {
      (lastUserContent as unknown[]).push({ type: "image_url", image_url: { url: img.dataUrl } });
    }
  }
  const payloadMessages: Array<{ role: string; content: unknown }> = [
    ...leading,
    { role: "user", content: lastUserContent },
  ];

  let schemaEnabled = Boolean(useJsonSchema && jsonSchema);
  const payload: Record<string, unknown> = {
    model,
    messages: payloadMessages,
    temperature: temperature ?? 0.2,
  };
  if (maxTokens) payload.max_tokens = maxTokens;
  if (schemaEnabled) {
    payload.response_format = { type: "json_schema", json_schema: jsonSchema };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 600_000);
  try {
    let res = await fetchOpenRouter(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey ?? ""}`,
        "HTTP-Referer": "http://localhost",
        "X-Title": "PRD Testcase Generator",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const firstBody = await res.text();
      const firstError = mapHttpError(res.status, firstBody);
      console.error("[openrouter] 请求失败", JSON.stringify({
        status: res.status,
        model,
        detail: firstError.detail,
        hasImages: images.length > 0,
        responseFormat: schemaEnabled,
      }));

      // 部分 provider 虽然能生成 JSON，但不接受 OpenAI 的 json_schema 参数。
      // 400 时去掉该参数重试，仍要求模型只返回 JSON，并由本地校验/修复。
      if (res.status === 400 && schemaEnabled) {
        schemaEnabled = false;
        delete payload.response_format;
        console.warn("[openrouter] response_format 被 provider 拒绝，已降级为普通 JSON 输出后重试", model);
        res = await fetchOpenRouter(`${OPENROUTER_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey ?? ""}`,
            "HTTP-Referer": "http://localhost",
            "X-Title": "PRD Testcase Generator",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!res.ok) {
          const retryBody = await res.text();
          const retryError = mapHttpError(res.status, retryBody);
          console.error("[openrouter] 降级重试仍失败", JSON.stringify({
            status: res.status,
            model,
            detail: retryError.detail,
            hasImages: images.length > 0,
            responseFormat: false,
          }));
          throw retryError;
        }
      } else {
        throw firstError;
      }
    }
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = body.choices?.[0]?.message?.content ?? "";
    if (!content) throw new ApiError("empty", "OpenRouter 返回了空内容", res.status);
    return {
      content,
      model: body.model ?? model,
      usage: body.usage,
      finishReason: body.choices?.[0]?.finish_reason,
      structuredUsed: schemaEnabled,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new ApiError("timeout", "上游模型响应超时，请缩短输入或稍后重试", 504);
    }
    if (err instanceof TypeError) {
      console.error("[openrouter] 网络/请求异常", err);
      throw new ApiError("network", "网络错误：无法连接到 OpenRouter", undefined, err.message);
    }
    console.error("[openrouter] 未预期异常", err);
    throw new ApiError("upstream", `未预期错误：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}
