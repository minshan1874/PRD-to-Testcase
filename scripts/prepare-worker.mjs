import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const workerDir = path.join(dist, "server");
const publicDir = path.join(workerDir, "public");

// 跨平台：把 worker 编译产物 index-worker.js 复制为 wrangler 的 main 入口 index.js
const srcWorker = path.join(workerDir, "index-worker.js");
const dstWorker = path.join(workerDir, "index.js");
if (fs.existsSync(srcWorker)) {
  fs.copyFileSync(srcWorker, dstWorker);
} else {
  throw new Error(`未找到 worker 入口: ${srcWorker}`);
}

// 清理并重建 public 目录（承载前端静态资源）
fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });
fs.copyFileSync(path.join(dist, "index.html"), path.join(publicDir, "index.html"));
fs.cpSync(path.join(dist, "assets"), path.join(publicDir, "assets"), { recursive: true });

fs.writeFileSync(
  path.join(workerDir, "wrangler.json"),
  `${JSON.stringify({
    name: "prd-to-testcase",
    main: "./index.js",
    compatibility_date: "2026-09-05",
    workers_dev: true,
    assets: {
      directory: "./public",
      binding: "ASSETS",
      not_found_handling: "single-page-application",
    },
  }, null, 2)}\n`,
);
