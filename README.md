# <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Test%20Tube.png" alt="Test Tube" width="30" height="30" /> AI 测试效能工作台

> 基于 LLM 的一站式测试效能工具，覆盖需求预审 → 用例生成 → 用例评审 → Bug 分析全流程。

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenRouter-API-FF6B35" />
  <img src="https://img.shields.io/badge/License-Private-999" />
</p>

<p align="center">
  <a href="https://test-ai-studio.yangf999212.workers.dev"><b>🚀 在线体验</b></a>
  ·
  <a href="#-功能一览">功能</a>
  ·
  <a href="#-快速开始">快速开始</a>
  ·
  <a href="#-技术栈">技术栈</a>
</p>

---

## ✨ 功能一览

| 功能 | 说明 | 输入 | 输出 |
|------|------|------|------|
| 🔍 **需求预审** | AI 识别 PRD 中的歧义点、遗漏项和潜在风险 | PRD 文档 + 规则集 | 预审结论 + 问题清单 |
| 📝 **生成测试用例** | 一键生成结构化测试用例，支持在线编辑 | PRD 文档 + 配置参数 | 测试用例（Excel 导出） |
| ✅ **用例评审** | 结合 PRD 智能评审用例质量，识别遗漏/冗余 | PRD + 用例 Excel | 评审报告 + 优化建议 |
| 🐛 **Bug 分析** | 输入报错现象/截图，AI 定位根因与归属 | 报错描述 + 截图 | 问题分类 + 排查建议 |

---

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务
npm run dev
```

前端运行在 `http://localhost:5173`，API 运行在 `http://localhost:4179`。

> 💡 **首次使用**：在左侧侧边栏输入 OpenRouter API Key 即可。Key 仅存内存，刷新即清空。

## 🏗️ 技术栈

<details>
<summary>展开查看详细技术栈</summary>

### 前端
- **框架**：React 19 + TypeScript
- **构建**：Vite
- **样式**：Tailwind CSS + Radix UI
- **状态管理**：Zustand
- **数据校验**：Zod
- **表格**：@fortune-sheet/react

### 后端
- **框架**：Express 5 + TypeScript
- **部署**：Cloudflare Workers
- **AI**：OpenRouter API（多模型切换）

### 测试
- **E2E**：Playwright

</details>

## 📦 部署

```bash
npm run build
npx wrangler deploy --config dist/server/wrangler.json
```

## ⚠️ 注意事项

- 🔑 API Key 仅存浏览器内存，刷新页面需重新输入，**切勿提交到 GitHub**
- 🤖 AI 生成结果仅供参考，使用前请人工校验准确性

## 📄 License

Private
