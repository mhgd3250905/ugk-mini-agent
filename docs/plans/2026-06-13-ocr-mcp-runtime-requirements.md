# OCR MCP GPU Runtime Self-Contained Startup Requirements

## 2026-06-13 交付验收记录

OCR MCP 侧已交付 `run_mcp.cmd`、`mcp_runtime_bootstrap.py`，并在 `ocr_mcp_server.py` 增加 `run_with_preload()` 和 stderr logger。UGK Mini Agent 侧按本文件约定只配置 `run_mcp.cmd`、空 args、项目 cwd 和 `300000` ms timeout。

UGK 侧复验记录：

- `AgentMcpClientManager.testServer()` 使用 `E:\AII\ugk-qr-scan\run_mcp.cmd` 返回 `ok: true`。
- `tools/list` 返回 `ocr_recognize`，schema 仍是 `{ params: OCRInput }`，UGK 不需要改参数包装。
- `AgentMcpClientManager.callTool()` 调用 `ocr_recognize` 识别 `E:\AII\ugk-qr-scan\test.jpg` 返回 `isError: false`，识别出 `Hello World` 和 `PaddleOCR测试`。
- 本机 `main` Agent 的运行态配置已写入 `.data/agent/mcp/servers.json`；该文件属于运行态数据，不提交。

## 背景

UGK Mini Agent 已支持通过配置启动本地 stdio MCP 服务。当前本地 OCR MCP 可以被 Agent 平台识别，`local-ocr` 能列出 `ocr_recognize` 工具，但调用工具时 Paddle GPU 运行时失败：

```text
PreconditionNotMetError: The third-party dynamic library (cudnn64_8.dll) that Paddle depends on is not configured correctly. (error code is 126)
```

用户本机已存在对应 DLL：

```text
E:\AII\ugk-qr-scan\venv\Lib\site-packages\nvidia\cudnn\bin\cudnn64_8.dll
```

这说明问题不是 Agent 平台无法连接 MCP，也不是 OCR 服务完全没有部署，而是 OCR MCP 作为子进程启动时，没有在进程环境里正确暴露 Paddle GPU 依赖的 NVIDIA DLL 目录。

## 目标

OCR MCP 需要提供一个自包含、稳定、可被外部平台直接启动的入口。UGK Mini Agent 侧只需要配置：

```text
Command: E:\AII\ugk-qr-scan\run_mcp.cmd
Args: 空
CWD: E:\AII\ugk-qr-scan
Timeout ms: 300000
```

用户不应该在 Agent 平台里理解或填写 CUDA、cuDNN、Paddle、venv、`PATH`、DLL 目录等运行时细节。

## 非目标

- 不要求 UGK Mini Agent 内置 Paddle/CUDA/cuDNN 知识。
- 不要求用户在 Agent 平台 MCP 配置里手工追加 DLL 路径。
- 不要求用户改成 CPU 版 Paddle；本需求保留 GPU 版 PaddleOCR。
- 不要求 Agent 平台为每个 MCP 服务维护专用 wrapper。

## 当前问题

1. OCR MCP 工具发现正常，说明 stdio MCP 协议链路基本可用。
2. 工具调用进入 `ocr_recognize` 后才失败，说明 PaddleOCR/GPU 运行时是懒加载阶段出错。
3. `cudnn64_8.dll` 已安装在 venv 的 `site-packages\nvidia\cudnn\bin` 下，但子进程启动环境没有把该目录加入 DLL 搜索路径。
4. 如果错误只在工具调用阶段暴露，Agent 用户会看到“工具失败”或长时间等待，很难判断是 OCR 服务部署问题还是 Agent 调用问题。

## 必须交付

### 1. 单一启动入口

OCR MCP 项目需要提供一个稳定启动入口，例如：

```text
E:\AII\ugk-qr-scan\run_mcp.cmd
```

或等价的：

```text
python -m ugk_qr_scan_mcp
```

该入口必须能被普通 `cmd.exe`、PowerShell、UGK Mini Agent 子进程直接启动。

### 2. GPU DLL 路径自发现

启动入口必须在导入 `paddle` / `paddleocr` 之前，自动发现并注入 venv 内的 NVIDIA DLL 目录。

至少覆盖这些存在时的目录：

```text
venv\Lib\site-packages\nvidia\cudnn\bin
venv\Lib\site-packages\nvidia\cublas\bin
venv\Lib\site-packages\nvidia\cuda_runtime\bin
venv\Lib\site-packages\nvidia\cufft\bin
venv\Lib\site-packages\nvidia\curand\bin
venv\Lib\site-packages\nvidia\cusolver\bin
venv\Lib\site-packages\nvidia\cusparse\bin
venv\Lib\site-packages\nvidia\nvjitlink\bin
```

实现建议：

```python
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE_PACKAGES = ROOT / "venv" / "Lib" / "site-packages"

dll_dirs = []
for name in [
    "cudnn",
    "cublas",
    "cuda_runtime",
    "cufft",
    "curand",
    "cusolver",
    "cusparse",
    "nvjitlink",
]:
    path = SITE_PACKAGES / "nvidia" / name / "bin"
    if path.exists():
        dll_dirs.append(str(path))

for path in dll_dirs:
    if hasattr(os, "add_dll_directory"):
        os.add_dll_directory(path)

os.environ["PATH"] = ";".join(dll_dirs + [os.environ.get("PATH", "")])
```

### 3. 启动预检

在 `mcp.run()` 之前完成预检，失败时尽早退出并给出清晰诊断。

预检至少包括：

- 当前 Python 是否来自 OCR MCP 项目 venv。
- `paddlepaddle-gpu` 是否安装。
- `paddleocr` 是否安装。
- 关键 DLL 是否能被当前进程加载，例如 `cudnn64_8.dll`。
- GPU 运行检查是否通过，例如 Paddle 官方 `run_check()` 或等价检查。

诊断信息必须输出到 `stderr`，不能污染 `stdout`。

### 4. Stdio MCP 输出规范

stdio MCP 的 `stdout` 必须只输出 JSON-RPC 协议内容。

以下内容必须走 `stderr`：

- 启动日志。
- 预检日志。
- PaddleOCR 下载、初始化、警告、耗时信息。
- 错误诊断。

否则 Agent 平台可能无法稳定解析 MCP 协议。

### 5. OCR 预加载与失败前置

建议在 MCP server 启动阶段预加载 OCR 引擎，而不是第一次工具调用时才初始化：

```python
get_ocr("ch")
mcp.run()
```

如果预加载耗时较长，应在 `stderr` 打印阶段性日志。若预加载失败，应直接退出并返回明确错误，不要等到 Agent 调用工具时才失败。

### 6. 配置项

OCR MCP 可以支持以下环境变量，但 Agent 平台不应必须配置它们：

```text
MCP_OCR_LANG=ch
MCP_OCR_DEVICE=gpu
MCP_OCR_PRELOAD=1
MCP_OCR_TIMEOUT_HINT_MS=300000
```

默认行为建议：

- 检测到 GPU 版 Paddle 且 GPU 运行时可用时，默认使用 GPU。
- GPU 配置异常时，默认 fail fast，不自动静默降级 CPU，除非显式设置 `MCP_OCR_DEVICE=auto`。

### 7. 错误契约

当 GPU 运行时不可用时，错误信息需要包含：

- 缺失或无法加载的 DLL 名称。
- 已尝试注入的 DLL 目录。
- 当前 Python 路径。
- 当前 venv 路径。
- 建议修复动作。

工具调用阶段如果仍发生异常，应返回 MCP JSON error，不应长时间挂起。

## 验收标准

### 本地命令行验收

在没有手工修改系统 `PATH` 的新 `cmd.exe` 中运行：

```bat
cd /d E:\AII\ugk-qr-scan
run_mcp.cmd
```

结果：

- MCP 服务启动。
- 启动日志只出现在 `stderr`。
- `stdout` 保持 MCP JSON-RPC 可解析。
- GPU/Paddle 预检通过。

### UGK Agent 平台验收

在 UGK Mini Agent 的 MCP 配置中只填写：

```text
Server ID: local-ocr
Name: Local OCR
Command: E:\AII\ugk-qr-scan\run_mcp.cmd
Args: 空
CWD: E:\AII\ugk-qr-scan
Timeout ms: 300000
Enabled: 启用
```

结果：

- 测试连接成功。
- 工具列表能看到 `ocr_recognize`。
- Agent 调用 `ocr_recognize` 能识别本地图片。
- 不需要在 UGK UI 中配置 CUDA/cuDNN/Paddle DLL 路径。

### GPU 验收

在 MCP 启动入口注入运行时路径后，以下检查通过：

```bat
E:\AII\ugk-qr-scan\venv\Scripts\python.exe -c "import paddle; paddle.utils.run_check()"
```

如果该命令仍依赖外部 `PATH`，则不满足本需求。

## 建议实现结构

```text
E:\AII\ugk-qr-scan\
  run_mcp.cmd
  mcp_runtime_bootstrap.py
  ocr_mcp_server.py
  venv\
```

`run_mcp.cmd` 只负责调用项目 venv：

```bat
@echo off
setlocal
cd /d "%~dp0"
"%~dp0venv\Scripts\python.exe" "%~dp0mcp_runtime_bootstrap.py"
```

`mcp_runtime_bootstrap.py` 负责：

1. 计算项目根目录和 venv。
2. 注入 NVIDIA DLL 搜索目录。
3. 执行预检。
4. 导入 OCR MCP server。
5. 预加载 OCR 引擎。
6. 启动 `mcp.run()`。

## 对 UGK Mini Agent 的期望边界

UGK Mini Agent 只需要做到：

- 按用户配置启动 MCP 子进程。
- 传递 command、args、cwd、timeout、enabled 等通用字段。
- 保持 stdout/stderr 分离。
- 展示 MCP 连接、工具发现、工具调用错误。

UGK Mini Agent 不应为 OCR MCP 写死 CUDA/cuDNN/Paddle 运行时路径，也不应要求用户在 Agent 配置里维护这些细节。

## 完成定义

- OCR MCP 提供一个可复制、可迁移的启动入口。
- Agent 平台只配置 command/cwd 即可使用 OCR 工具。
- GPU 依赖异常能在启动或测试连接阶段暴露。
- 用户不需要理解 Paddle GPU 依赖链。
- 文档包含 Windows 安装、GPU 验收、Agent 平台配置三段最小步骤。
