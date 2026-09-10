# -*- coding: utf-8 -*-
"""业务流脚本（我的平台 · SampleFlow Demo 演示模型）
范围：打开页面 → 上传需求文档 → 开始生成 → 下载 Excel。
选中演示模型后全程为固定结果（假 loading），不依赖真实 AI 后端，可脱离网络把整条业务流跑通。
"""
*** Settings ***
Documentation    打开 → 上传 → 生成 → 下载 完整业务流冒烟测试（SampleFlow Demo）
Resource         resources/common.resource
Variables        variables.py
Test Setup       Open Application
Test Teardown    Close Browser

*** Test Cases ***
完整业务流：打开-上传-生成-下载
    [Documentation]    依次完成四个环节并逐段断言，验证生成结果与下载文档符合 SampleFlow Demo 的固定输出。
    [Tags]    smoke    demo    e2e

    Select Demo Model
    Upload PRD File      ${TEST_FILE}
    Generate Test Cases
    Download Excel

    # 全流程收尾断言：固定结果主题存在
    Page Should Contain    ${EXPECTED_MODULE}

*** Keywords ***
Open Application
    Open Browser             ${BASE_URL}    ${BROWSER}
    Set Selenium Timeout     15 s
    Set Window Size          1440        900