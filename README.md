# 🧪 AI 测试效能工作台



***

## 🚀 项目简介

> 🌐 **在线体验**：https://test-ai-studio.yangf999212.workers.dev/（需科学上网访问）

测试工作流里有大量重复、机械的环节，而真正有价值的判断（需求是否清晰、用例是否覆盖关键路径、Bug 到底出在哪一层）却往往被淹没在体力活里。本项目把 LLM 引入测试全链路，用 AI 完成**第一遍粗活**，再由测试工程师做**关键裁决**：



* 🔍 **需求预审**：需求提报后、人工评审前，AI 先扫一遍 PRD，找出歧义点、遗漏项与风险

* 📝 **用例生成**：上传 PRD 一键产出结构化测试用例，内置 10 个字段 + 自定义字段，在线编辑后导出 Excel

* ✅ **用例评审**：AI 对照 PRD 逐条审查用例，识别遗漏与冗余，给出可执行的优化建议

* 🐛 **Bug 分析**：粘贴报错日志 / 上传截图，AI 定位问题类型与归属，并附带回归建议

> 💡 **设计原则**：AI 生成结果始终标注「AI 推测，仅供参考」，需要人工校验后使用——工具是放大你的效率，不是替代你的判断。



***

## ⚡ 快速开始

### 环境要求



* **Node.js** `^20.19.0 || >=22.12.0`（Vite 8 要求）

* npm /pnpm/yarn 任选

### 安装与启动



```
\# 1. 安装依赖

npm install

\# 2. 启动开发服务（前端 + API 同时启动）

npm run dev
```

### 首次使用

在左侧侧边栏输入 **OpenRouter API Key** 即可开始使用，Key 仅存浏览器内存，刷新即清空。

> 🧪 没有 API Key 想先体验？选择 SampleFlow Demo 模型，无需真实调用，输入任意内容，返回固定结果。



***

## 📂 项目结构



```
test-ai-studio/

├── src/                        # 前端源码（React + TypeScript）

│   ├── components/             # 功能组件

│   │   ├── steps/              # 用例生成四步流程：上传 → 配置 → 生成 → 结果

│   │   └── ui/                 # 基于 Radix UI 的通用组件库

│   ├── lib/                    # 文档解析 / 提示词 / Schema / Excel 导出

│   └── store/                  # Zustand 全局状态

├── server/                     # Express 后端

│   ├── index.ts                # 本地服务（含生产模式静态托管）

│   ├── index-worker.ts         # Cloudflare Worker 入口

│   └── openrouter.ts           # OpenRouter API 封装（多模型、JSON Schema）

├── samples/                    # 示例 PRD 文档

├── scripts/                    # 构建等辅助脚本

└── tests/                      # Playwright E2E 测试
```



***

## 🛠️ 技术栈



| 层       | 技术                                                    |
| ------- | ----------------------------------------------------- |
| 前端框架    | React 19 · TypeScript 7 · Vite 8                      |
| UI 与样式  | Tailwind CSS 4・Radix UI（shadcn 风格组件库）・lucide-react 图标 |
| 状态管理    | Zustand                                               |
| 数据校验    | Zod                                                   |
| 表格 / 导出 | @fortune-sheet/react（在线 Excel 预览编辑）・exceljs（导出）       |
| 文档解析    | pdfjs-dist（PDF，含扫描件转图）・mammoth（DOCX）                  |
| 后端      | Express 5 · Cloudflare Workers（wrangler）              |
| AI      | OpenRouter API（多模型切换，支持图片与 JSON Schema 结构化输出）         |
| 测试      | Playwright（E2E）                                       |



***

## ☁️ 部署



```
npm run build    # 构建前端 + 后端

npm start        # Express 托管 dist 静态资源，默认端口 3000
```



***

## ⚠️ 安全与注意事项



* 🔑 **API Key 安全**：Key 仅存浏览器内存，刷新即清空

* 🤖 **AI 结果仅供参考**：所有生成结果均标注「AI 推测，仅供参考 / 需要进一步验证」，使用前请人工校验准确性

* 📄 本项目为私有项目，请勿在未授权情况下分发源码

## 📄 License

Private