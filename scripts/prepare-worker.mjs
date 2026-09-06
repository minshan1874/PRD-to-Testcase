import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const workerDir = path.join(dist, "server");
const publicDir = path.join(workerDir, "public");

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
