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
// AI 需求预审：与生成共用同一条链路（messages 由前端构造为预审提示词）
app.post("/api/prereview", handleChat);

// ─── AI Bug 分析 ────────────────────────────────────────────

const BUG_ANALYSE_SYSTEM = `你是bug分析助手，基于传入的报错日志、截图做问题分析，严格输出JSON格式，不要额外解释。

输出字段：
- problemType：问题类型，只能从【JS异常、接口请求异常、渲染样式异常、网络&跨域、环境兼容、其他】选择
- belong：问题归属，只能从【前端、后端服务、网络网关、浏览器环境、无法确定，信息不足】选择
- reason：根因推测，结尾必须带上【AI推测，需要进一步验证】
- suggest：数组，2-4条可执行排查步骤
- focusPoint：指出需要重点查看的堆栈、接口、字段信息
- regressionAdvice：对象，包含：
  - regressionSteps：数组，2-4条bug修复后的回归操作步骤；
  - verifyPoint：数组，2-3条回归通过的验证检查点；
  - compatibleScope：字符串，回归需要覆盖的浏览器、设备、系统环境；
  - riskTip：回归风险提示，结尾带上【AI推测，仅供参考】

只返回json，不要markdown、不要多余文字。`;

const BUG_JSON_SCHEMA = {
  name: "bug_analyse",
  strict: true,
  schema: {
    type: "object",
    properties: {
      problemType: {
        type: "string",
        enum: ["JS异常", "接口请求异常", "渲染样式异常", "网络&跨域", "环境兼容", "其他"],
      },
      belong: {
        type: "string",
        enum: ["前端", "后端服务", "网络网关", "浏览器环境", "无法确定，信息不足"],
      },
      reason: { type: "string" },
      suggest: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
      focusPoint: { type: "string" },
      regressionAdvice: {
        type: "object",
        properties: {
          regressionSteps: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
          verifyPoint: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
          compatibleScope: { type: "string" },
          riskTip: { type: "string" },
        },
        required: ["regressionSteps", "verifyPoint", "compatibleScope", "riskTip"],
        additionalProperties: false,
      },
    },
    required: ["problemType", "belong", "reason", "suggest", "focusPoint", "regressionAdvice"],
    additionalProperties: false,
  },
};

app.post("/api/ai/bug-analyse", async (req, res) => {
  const { text, imageBase64 } = req.body ?? {};
  const textStr = typeof text === "string" ? text : "";
  const hasImage = typeof imageBase64 === "string" && imageBase64.startsWith("data:");

  if (!textStr.trim() && !hasImage) {
    res.status(400).json({ code: 400, message: "请输入报错信息或上传截图" });
    return;
  }
  if (textStr.length > 12000) {
    res.status(400).json({ code: 400, message: "内容超出字符上限" });
    return;
  }

  const apiKey = ENV_API_KEY;
  if (!apiKey && !MOCK) {
    res.status(401).json({ code: 401, message: "未配置服务端 API Key" });
    return;
  }

  try {
    const parts: string[] = [];
    if (textStr.trim()) parts.push(`用户提供的报错/日志/描述：\n${textStr.trim()}`);
    if (hasImage) parts.push("（已附上报错截图，请结合图片内容一起分析）");
    const userText = `${parts.join("\n\n")}\n\n请按系统说明进行分析，并输出符合约定结构的 JSON 对象。`;

    const messages = [
      { role: "system", content: BUG_ANALYSE_SYSTEM },
      { role: "user", content: userText },
    ];

    const images = hasImage
      ? [{ mime: imageBase64.split(";")[0].split(":")[1] || "image/png", dataUrl: imageBase64 }]
      : [];

    // 有图片时优先用支持图片的模型；无图片时用默认模型
    const model = hasImage ? "openai/gpt-5.6-luna" : DEFAULT_MODEL;

    const result = MOCK
      ? await mockGenerate({ model, apiKey, messages, images })
      : await generate({
          model,
          messages,
          images,
          temperature: 0.2,
          maxTokens: 2000,
          apiKey,
          useJsonSchema: true,
          jsonSchema: BUG_JSON_SCHEMA,
          timeoutMs: hasImage ? 30_000 : 20_000,
        });

    // 解析并校验 JSON
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      // 尝试提取 JSON
      const match = result.content.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* ignore */ }
      }
    }

    if (!parsed || typeof parsed !== "object") {
      res.status(502).json({ code: 502, message: "AI 返回格式异常，请重试" });
      return;
    }
    const obj = parsed as Record<string, unknown>;

    const problemType = ["JS异常", "接口请求异常", "渲染样式异常", "网络&跨域", "环境兼容", "其他"]
      .includes(String(obj.problemType)) ? String(obj.problemType) : "其他";
    const belong = ["前端", "后端服务", "网络网关", "浏览器环境", "无法确定，信息不足"]
      .includes(String(obj.belong)) ? String(obj.belong) : "无法确定，信息不足";
    let reason = String(obj.reason || "");
    const tag = "【AI推测，需要进一步验证】";
    if (reason && !reason.endsWith(tag)) reason = `${reason}${tag}`;
    let suggest = Array.isArray(obj.suggest)
      ? obj.suggest.map((s: unknown) => String(s)).filter(Boolean)
      : [];
    if (suggest.length < 2) suggest = [...suggest, "复现问题并收集完整报错信息", "检查浏览器控制台与网络请求"];
    if (suggest.length > 4) suggest = suggest.slice(0, 4);
    const focusPoint = String(obj.focusPoint || "");

    const regressionAdvice = pickRegressionAdvice(obj.regressionAdvice);

    res.json({
      code: 0,
      data: { problemType, belong, reason, suggest, focusPoint, regressionAdvice },
    });
  } catch (err) {
    if (err instanceof OpenRouterHttpError) {
      const mapped = mapHttpError(err.status, err.message);
      res.status(err.status).json({ code: err.status, message: mapped.message });
      return;
    }
    if (err instanceof ApiError) {
      res.status(err.status ?? 502).json({ code: 502, message: err.message });
      return;
    }
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      res.status(504).json({ code: 504, message: "AI分析请求超时，请减少内容重试" });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ code: 502, message: "分析失败，请稍后重试" });
  }
});

/** 从 AI 返回的 regressionAdvice 字段中提炼回归建议；无实质内容返回 null */
function pickRegressionAdvice(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const stringList = (x: unknown): string[] =>
    Array.isArray(x) ? x.map((s: unknown) => String(s)).filter((s) => s.trim().length > 0) : [];
  let regressionSteps = stringList(v.regressionSteps);
  if (regressionSteps.length < 2) regressionSteps = [];
  if (regressionSteps.length > 4) regressionSteps = regressionSteps.slice(0, 4);
  let verifyPoint = stringList(v.verifyPoint);
  if (verifyPoint.length < 2) verifyPoint = [];
  if (verifyPoint.length > 3) verifyPoint = verifyPoint.slice(0, 3);
  const compatibleScope = typeof v.compatibleScope === "string" ? v.compatibleScope.trim() : "";
  let riskTip = typeof v.riskTip === "string" ? v.riskTip.trim() : "";
  const riskToken = "AI推测，仅供参考";
  const riskTag = "【AI推测，仅供参考】";
  if (riskTip && !riskTip.endsWith(riskToken) && !riskTip.endsWith(riskTag)) {
    riskTip = `${riskTip}${riskTag}`;
  }
  if (regressionSteps.length === 0 && verifyPoint.length === 0 && !compatibleScope && !riskTip) {
    return null;
  }
  return { regressionSteps, verifyPoint, compatibleScope, riskTip };
}

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
