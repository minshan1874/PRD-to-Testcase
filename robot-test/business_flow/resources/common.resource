# -*- coding: utf-8 -*-
*** Settings ***
Library    SeleniumLibrary
Library    OperatingSystem

*** Keywords ***
# 通用文本等待：基于全文包含匹配（不依赖单个文本节点），并用重试规避 React 重渲染导致的 stale。
Wait Text Appear
    [Arguments]    ${text}    ${timeout}=15 s
    Wait Until Keyword Succeeds    ${timeout}    1 s    Page Should Contain    ${text}

# ── 第一步：选择 SampleFlow Demo 演示模型（左侧「模型配置」下拉） ──────────
Select Demo Model
    Wait Until Element Is Visible    xpath=//aside//button[@aria-haspopup="listbox"]
    Click Element                    xpath=//aside//button[@aria-haspopup="listbox"]
    Wait Until Element Is Visible    xpath=//input[@placeholder="搜索模型名称或 ID…"]
    Input Text                       xpath=//input[@placeholder="搜索模型名称或 ID…"]    Sample
    Wait Until Element Is Visible    xpath=//*[@role="option"][contains(normalize-space(.),"SampleFlow Demo")]
    Click Element                    xpath=//*[@role="option"][contains(normalize-space(.),"SampleFlow Demo")]
    Wait Text Appear                 ${EXPECTED_DEMO_MODEL_TAG}

# ── 第二步：上传需求文档 ───────────────────────────────────────────────
Upload PRD File
    [Arguments]    ${file}
    # 等上传区提示出现，确保 React 已挂载、挂到隐藏 input 的事件监听器就绪
    Wait Text Appear                    点击选择或拖拽文件到此处
    Wait Until Page Contains Element    xpath=//input[@type='file']
    Choose File                         xpath=//input[@type='file']    ${file}
    # 等待输入池标题与解析成功计数字样（正文全文包含，兼容数字在 <span> 内的拆分）
    Wait Text Appear                    输入池
    Wait Text Appear                    个解析成功

# ── 第三步：开始生成 ──────────────────────────────────────────────────
Generate Test Cases
    Wait Until Element Is Visible    xpath=//button[contains(.,'开始生成')]
    Click Element                    xpath=//button[contains(.,'开始生成')]
    Wait Text Appear                 生成完成    30 s
    Wait Text Appear                 生成结果

# ── 第四步：导出 Excel ──────────────────────────────────────────────
# 说明：默认用“导出成功”提示兜底断言。如需校验文件落盘，可给浏览器配置下载目录为 ${DOWNLOAD_DIR} 后，在 Download Excel 末尾加：
#   Wait Until Keyword Succeeds  10 s  1 s  Expect Xlsx Downloaded
# Expect Xlsx Downloaded
#     ${files}=  List Files In Directory  ${DOWNLOAD_DIR}  *.xlsx
#     Should Be True  ${{len($files) > 0}}
Download Excel
    Wait Until Element Is Visible    xpath=//button[contains(.,'导出 Excel')]
    Click Element                    xpath=//button[contains(.,'导出 Excel')]
    Wait Text Appear                 已导出全部用例    10 s