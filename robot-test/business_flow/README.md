# 完整业务流脚本（打开 → 上传 → 生成 → 下载）

用于演示模型 **SampleFlow Demo** 的端到端冒烟测试：选中演示模型后，无论上传什么，
生成与评审都返回固定结果（假 loading），因此可脱离真实 AI 后端把整条业务流跑通。

## 目录结构

```
business_flow/
├── generate_flow.robot      # 测试用例：打开-上传-生成-下载
├── resources/common.resource # 复用关键字（选模型/上传/生成/下载）
├── variables.py             # 变量文件：地址、浏览器、测试数据、下载目录
└── demo-input.txt           # 示例输入（演示模型不看内容）
```

## 安装依赖

```bash
pip install robotframework robotframework-seleniumlibrary selenium
```

## 运行

先在仓库根目录启动本地前端服务（`npm run dev`，端口 5173），然后在 **business_flow 目录**下执行：

```bash
robot --outputdir output generate_flow.robot
```

结果会生成 `output/report.html`（总览）、`output/log.html`（步骤日志），浏览器打开即可查看。

## 切换环境 / 浏览器

- 改被测地址：设环境变量 `BASE_URL`（默认 `http://localhost:5173`；切线上时
  `$env:BASE_URL="https://你的域名"`）。
- 换浏览器：默认 `chrome`，如遇本地 Chromedriver 不稳定（版本不匹配偶发崩溃），改 Edge 一行即可：
  ```bash
  robot --variable BROWSER:edge --outputdir output generate_flow.robot
  ```

## 脚本做了什么

每个环节都带断言，面试时可逐段讲：

| 环节 | 关键字 | 断言 |
|---|---|---|
| 打开 | `Open Application` | 页面标题/侧栏正常 |
| 选模型 | `Select Demo Model` | 侧栏显示 `demo/sample-flow` |
| 上传 | `Upload PRD File` | 出现输入池，`N 个解析成功` |
| 生成 | `Generate Test Cases` | 出现 `生成完成` + `生成结果` |
| 下载 | `Download Excel` | 出现 `已导出全部用例` 提示 |

要点：跨 React 重渲染的文本断言用全文包含 + 重试（`Wait Text Appear`），
避免 `Page Should Contain` 缓存旧 DOM 报 `StaleElementReferenceException`；
上传用的 `<input type=file>` 是隐藏控件，用 `Choose File` 直接操作即可。