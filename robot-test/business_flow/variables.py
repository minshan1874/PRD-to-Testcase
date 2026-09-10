# -*- coding: utf-8 -*-
"""业务流脚本变量文件：集中管理被测地址、浏览器、测试数据与下载目录。
修改环境时只改这一处即可（BASE_URL 切到线上、TEST_FILE 换成你的 PRD 文件）。"""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))          # 本文件所在目录（在 business_flow/ 下运行，即 business_flow/）

# 被测环境：本地开发服务器（配合 npm run dev）或线上地址
BASE_URL = os.getenv("BASE_URL", "http://localhost:5173")
BROWSER = os.getenv("BROWSER", "chrome")

# 输入文件：与脚本同一目录下的示例 txt；选中 SampleFlow Demo 后，任何内容都会返回固定结果
TEST_FILE = os.environ.get("TEST_FILE") or os.path.join(BASE_DIR, "demo-input.txt")

# 下载目录：导出 Excel 后如需校验文件落盘，把浏览器下载目录指到这里
DOWNLOAD_DIR = os.environ.get("DOWNLOAD_DIR") or os.path.join(BASE_DIR, "downloads")

# 预期固定结果（SampleFlow Demo）
EXPECTED_MODULE = "老照片修复"
EXPECTED_DEMO_MODEL_TAG = "demo/sample-flow"