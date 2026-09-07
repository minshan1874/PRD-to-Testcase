import { ApiError, fetchModels, generate } from "./openrouter.js";

interface WorkerEnv {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
}

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

function apiJson(request: Request, data: unknown, status = 200) {
  return json(data, status, corsHeaders(request));
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const headers = corsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return apiJson(request, {
        ok: true,
        version: "1.0.0",
        mock: false,
        defaultModel: "openai/gpt-5.6-luna",
      });
    }

    if (url.pathname === "/api/models" && request.method === "GET") {
      return handleModels(request, env);
    }

    if (url.pathname === "/api/generate" && request.method === "POST") {
      return handleChat(request, env);
    }

    // AI 审查用例：与生成共用同一条 OpenRouter 调用链路（messages 由前端构造为审查提示词）
    if (url.pathname === "/api/review" && request.method === "POST") {
      return handleChat(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return apiJson(request, { error: { code: "not_found", message: "接口不存在" } }, 404);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not Found", { status: 404 });
  },
};

async function handleModels(request: Request, env: WorkerEnv): Promise<Response> {
  try {
    const models = await fetchModels(env.OPENROUTER_API_KEY);
    return apiJson(request, { models, mock: false });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiJson(request, {
        error: { code: err.code, message: err.message, detail: err.detail },
      }, err.status ?? 502);
    }
    return apiJson(request, { error: { code: "upstream", message: "获取模型目录失败" } }, 502);
  }
}

async function handleChat(request: Request, env: WorkerEnv): Promise<Response> {
  if (!env.OPENROUTER_API_KEY) {
    return apiJson(request, {
      error: { code: "auth", message: "未配置服务端 API Key" },
    }, 500);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("请求体必须是 JSON 对象");
    body = parsed as Record<string, unknown>;
  } catch (err) {
    return apiJson(request, {
      error: { code: "bad_request", message: "请求体不是合法 JSON", detail: err instanceof Error ? err.message : String(err) },
    }, 400);
  }

  const model = body.model;
  const messages = body.messages;
  if (typeof model !== "string" || !model) {
    return apiJson(request, { error: { code: "bad_request", message: "缺少 model 参数" } }, 400);
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return apiJson(request, { error: { code: "bad_request", message: "缺少 messages 参数" } }, 400);
  }

  const sanitizedMessages = messages.map((message) => {
    const item = message && typeof message === "object" ? message as Record<string, unknown> : {};
    return {
      role: typeof item.role === "string" ? item.role : "user",
      content: typeof item.content === "string" ? item.content : "",
    };
  });
  const images = Array.isArray(body.images)
    ? body.images
        .filter((item) => {
          if (!item || typeof item !== "object") return false;
          const image = item as Record<string, unknown>;
          return typeof image.mime === "string" && typeof image.dataUrl === "string" && image.dataUrl.startsWith("data:");
        })
        .map((item) => {
          const image = item as Record<string, string>;
          return { mime: image.mime, dataUrl: image.dataUrl };
        })
    : [];

  try {
    const result = await generate({
      model,
      messages: sanitizedMessages,
      images,
      temperature: typeof body.temperature === "number" ? body.temperature : undefined,
      maxTokens: typeof body.maxTokens === "number" ? body.maxTokens : undefined,
      apiKey: env.OPENROUTER_API_KEY,
      useJsonSchema: typeof body.useJsonSchema === "boolean" ? body.useJsonSchema : undefined,
      jsonSchema: body.jsonSchema && typeof body.jsonSchema === "object"
        ? body.jsonSchema as Record<string, unknown>
        : undefined,
      // The hosted Worker would otherwise terminate a long-running request
      // before the browser's ten-minute client timeout. Return a JSON error
      // while the request is still alive so the UI does not misreport it as
      // localhost connectivity failure.
      // 95s：在 Cloudflare 约 100s 的单请求墙之前先自行超时并返回 504，
      // 否则平台会直接切断连接，前端将误报“无法连接到线上 API”（网络错误）。
      // 若仍需更大余量请改用本地服务或流式输出。
      timeoutMs: 95_000,
    });
    return apiJson(request, result);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiJson(request, {
        error: { code: err.code, message: err.message, detail: err.detail },
      }, err.status ?? 502);
    }
    return apiJson(request, {
      error: { code: "network", message: "网络错误：无法连接到 OpenRouter", detail: err instanceof Error ? err.message : String(err) },
    }, 502);
  }
}
