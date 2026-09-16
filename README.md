# AI 测试效能工作台

基于大语言模型（LLM）的一站式测试效能工具平台，涵盖需求预审、测试用例生成、用例 AI 评审、Bug 智能分析等核心功能，助力测试团队提升全流程效率。

## 功能特性

### 需求预审
- 上传 PRD 文档，AI 自动识别需求中的歧义点、遗漏项和潜在风险
- 支持多种预审规则集：默认规则、安全合规校验、研发可行性校验、业务完整性校验
- 输出预审结论（通过 / 需要补充材料 / AI 建议驳回）及详细问题清单
- 按严重程度分级标注，便于产品同学优先修复高风险问题

### 生成测试用例
- 支持 Markdown、Word（.docx）、PDF、纯文本等多种 PRD 格式上传
- 可视化配置：可选择 AI 模型、用例粒度、覆盖范围等生成参数
- AI 自动分析需求并生成结构化测试用例
- 生成结果以表格形式展示，支持在线编辑调整
- 支持导出为 Excel 表格

### 用例评审
- 上传已有的测试用例 Excel，结合 PRD 进行 AI 智能评审
- 自动识别用例遗漏、冗余、描述不清晰等问题
- 按问题类型分类展示评审意见，辅助测试人员完善用例质量
- 支持导出评审结果

### Bug 分析
- 输入 Bug 现象描述 + 截图，AI 自动分析问题根因
- 智能分类问题类型：JS 异常、接口请求异常、渲染样式异常、网络&跨域、环境兼容等
- 自动判定问题归属：前端、后端服务、网络网关、浏览器环境等
- 提供排查建议与修复方向，提升 Bug 定位效率

## 技术栈

### 前端
- **框架**：React 19 + TypeScript
- **构建工具**：Vite
- **样式**：Tailwind CSS + Radix UI (shadcn/ui 风格)
- **状态管理**：Zustand
- **数据校验**：Zod
- **表格**：@fortune-sheet/react
- **图标**：lucide-react

### 后端
- **框架**：Express 5
- **语言**：TypeScript
- **AI 接入**：OpenRouter API（支持多模型切换）

### 测试
- **E2E 测试**：Playwright

## 项目结构

```
PRD-to-Testcase/
├── src/                  # 前端源码
│   ├── components/       # React 组件
│   │   ├── steps/        # 步骤组件（上传/配置/生成/预览）
│   │   ├── ui/           # 基础 UI 组件
│   │   ├── Sidebar.tsx   # 侧边栏导航
│   │   ├── PreReview.tsx # 需求预审
│   │   ├── ReviewPage.tsx# 用例评审
│   │   ├── BugAnalyse.tsx# Bug 分析
│   │   └── ...
│   ├── lib/              # 工具库（API、文档解析、Excel 等）
│   └── store/            # Zustand 状态管理
├── server/               # 后端服务
│   ├── index.ts          # Express 服务入口
│   ├── openrouter.ts     # OpenRouter API 封装
│   └── mock.ts           # Mock 数据（开发用）
├── samples/              # 示例 PRD 文档
├── tests/                # Playwright E2E 测试
├── scripts/              # 构建脚本
└── package.json
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env` 模板并填入你的 OpenRouter API Key：

```bash
cp .env.example .env
# 编辑 .env，填入 OPENROUTER_API_KEY
```

### 启动开发服务

```bash
npm run dev
```

前端默认运行在 `http://localhost:5173`，后端 API 运行在 `http://localhost:4179`。

### 构建生产版本

```bash
npm run build
npm start
```

## 使用说明

### 需求预审
1. 在左侧导航选择「需求预审」
2. 上传 PRD 文档
3. 选择预审规则集（默认规则 / 安全合规 / 研发可行性 / 业务完整性）
4. 点击开始预审，AI 自动分析并输出结论与问题清单

### 生成测试用例
1. 在左侧导航选择「生成测试用例」
2. 上传 PRD 文档
3. 配置生成参数（模型、用例粒度、覆盖范围等）
4. 点击生成，AI 自动输出结构化测试用例
5. 在线预览、编辑用例，导出为 Excel

### 用例评审
1. 在左侧导航选择「用例评审」
2. 上传 PRD 文档 + 待评审的测试用例 Excel
3. 点击开始评审，AI 自动识别用例问题
4. 查看评审结果，按问题类型分类浏览

### Bug 分析
1. 在左侧导航选择「Bug分析」
2. 输入 Bug 现象描述，可上传截图
3. 点击开始分析，AI 自动判断问题类型与归属
4. 查看分析结果与排查建议

## 注意事项

- 请妥善保管你的 API Key，**切勿提交到 GitHub**（已在 `.gitignore` 中忽略 `.env` 文件）
- 首次使用建议先使用 Mock 模式体验完整流程
- AI 生成结果仅供参考，使用前请人工校验准确性

## License

Private
