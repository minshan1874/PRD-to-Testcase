# AI 测试效能工作台

基于 LLM 的一站式测试效能工具，覆盖需求预审 → 用例生成 → 用例评审 → Bug 分析全流程。

线上地址：https://prd-to-testcase.yangf999212.workers.dev

## 功能

| 功能 | 说明 |
|------|------|
| 需求预审 | 上传 PRD，AI 识别歧义点和风险，输出结论与问题清单 |
| 生成测试用例 | 多格式上传 PRD，配置参数后 AI 生成结构化用例，支持在线编辑与 Excel 导出 |
| 用例评审 | 上传用例 Excel + PRD，AI 识别遗漏、冗余等问题并给出修改建议 |
| Bug 分析 | 输入报错描述/截图，AI 判断问题类型与归属，给出排查建议 |

## 技术栈

- **前端**：React 19 + TypeScript + Vite + Tailwind + Radix UI + Zustand + Zod
- **后端**：Express 5 + TypeScript，部署于 Cloudflare Workers
- **AI**：OpenRouter API（多模型切换）
- **测试**：Playwright

## 快速开始

```bash
npm install
npm run dev          # 前端 localhost:5173 / API localhost:4179
```

首次使用需在侧边栏输入 OpenRouter API Key（仅存内存，刷新即清空）。

## 部署

```bash
npm run build
npx wrangler deploy --config dist/server/wrangler.json
```

## 注意事项

- API Key 仅存浏览器内存，刷新页面需重新输入，切勿提交到 GitHub
- AI 结果仅供参考，使用前请人工校验

## License

Private
