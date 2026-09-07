import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { ApiError, fetchModels, generate, mapHttpError, type ModelInfo } from "./openrouter.js";
import { mockFetchModels, mockGenerate, OpenRouterHttpError } from "./mock.js";

const PORT = Number(process.env.PORT ?? 3000);
const MOCK = process.env.OPENROUTER_MOCK === "true";
const ENV_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const DEFAULT_MODEL = "openai/gpt-5.6-luna";

const app = express();
app.use(express.json({ limit: "32mb" }));

function resolveApiKey(_req: express.Request): string {
  return ENV_API_KEY;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, version: "1.0.0", mock: MOCK, defaultModel: DEFAULT_MODEL });
});

app.get("/api/models", async (req, res) => {
  try {
    const apiKey = resolveApiKey(req);
    const models: ModelInfo[] = MOCK ? await mockFetchModels() : await fetchModels(apiKey);
    res.json({ models, mock: MOCK });
  } catch (err) {
    if (err instanceof ApiError) {
      res.status(err.status ?? 502).json({ error: { code: err.code, message: err.message, detail: err.detail } });
      return;
    }
    res.status(502).json({ error: { code: "upstream", message: "获取模型目录失败" } });
  }
});

async function handleChat(req: express.Request, res: express.Response) {
  const { model, messages, images, temperature, maxTokens, useJsonSchema, jsonSchema } =
    req.body ?? {};

  // 仅支持信任的最小字段集合
  if (typeof model !== "string" || !model) {
    res.status(400).json({ error: { code: "bad_request", message: "缺少 model 参数" } });
    return;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: { code: "bad_request", message: "缺少 messages 参数" } });
    return;
  }
  const sanitizedMessages = messages.map((m: { role?: unknown; content?: unknown }) => ({
    role: typeof m?.role === "string" ? m.role : "user",
    content: typeof m?.content === "string" ? m.content : "",
  }));
  const sanitizedImages = Array.isArray(images)
    ? images
        .filter((i: { mime?: unknown; dataUrl?: unknown }) => typeof i?.mime === "string" && typeof i?.dataUrl === "string" && i.dataUrl.startsWith("data:"))
        .map((i: { mime: string; dataUrl: string }) => ({ mime: i.mime, dataUrl: i.dataUrl }))
    : [];
  // API Key 仅从服务端环境变量读取
  const apiKey = ENV_API_KEY;
  if (!apiKey && !MOCK) {
    res.status(401).json({ error: { code: "auth", message: "未配置服务端 API Key，请在 .env 设置 OPENROUTER_API_KEY" } });
    return;
  }

  try {
    const result = MOCK
      ? await mockGenerate({ model, apiKey, messages: sanitizedMessages, images: sanitizedImages })
      : await generate({
          model,
          messages: sanitizedMessages,
          images: sanitizedImages,
          temperature: typeof temperature === "number" ? temperature : undefined,
          maxTokens: typeof maxTokens === "number" ? maxTokens : undefined,
          apiKey,
          useJsonSchema: typeof useJsonSchema === "boolean" ? useJsonSchema : undefined,
          jsonSchema: jsonSchema && typeof jsonSchema === "object" ? jsonSchema : undefined,
        });
    res.json(result);
  } catch (err) {
    if (err instanceof OpenRouterHttpError) {
      const mapped = mapHttpError(err.status, err.message);
      res.status(err.status).json({ error: { code: mapped.code, message: mapped.message, detail: mapped.detail } });
      return;
    }
    if (err instanceof ApiError) {
      res.status(err.status ?? 502).json({ error: { code: err.code, message: err.message, detail: err.detail } });
      return;
    }
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      res.status(504).json({ error: { code: "timeout", message: "请求超时（10 分钟）" } });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: { code: "network", message: `网络错误：${msg}` } });
  }
}

app.post("/api/generate", handleChat);
// AI 审查用例：与生成共用同一条链路（messages 由前端构造为审查提示词）
app.post("/api/review", handleChat);

// ─── 生产模式：托管构建产物（dist），并提供 SPA 回退 ─────────
const distDir = path.join(import.meta.dirname, "..", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(path.join(distDir, "index.html"));
      return;
    }
    next();
  });
  console.log(`[server] 静态目录已挂载: ${distDir}`);
} else if (process.env.NODE_ENV !== "test") {
  console.log("[server] 未发现 dist 目录，仅提供 /api 接口（开发模式由 Vite 承载前端）");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: { code: "internal", message: "服务器内部错误" } });
});

app.listen(PORT, () => {
  console.log(`[server] PRD→测试用例本地服务已启动: http://localhost:${PORT} (mock=${MOCK})`);
});

export { DEFAULT_MODEL };
