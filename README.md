# Deadline — AI 科研写作助手

> 通过自然语言对话，帮助科研人员撰写基金申请书、学位论文、科研报告等文档初稿。

> **⚠️ 注意**：本软件目前处于早期测试阶段，以体验和探索为主，功能可能不稳定。数据存储在你的本地计算机上，请务必定期备份你的重要内容（数据目录见下方说明）。

---

## 功能特性

- **对话式写作**：AI 扮演资深评审人，引导你从研究方向到完整初稿
- **模版管理**：上传 Word 模版，AI 自动解析章节结构和字数限制
- **骨架规划**：生成全章节摘要骨架，确认后逐章写作
- **智能生成**：短章节直接生成，长章节先规划段落结构再逐段生成
- **规则覆盖**：在对话中自然表达调整意图，AI 识别并保存章节规则
- **Word 导出**：一键导出 .docx 草稿，保留格式
- **多 LLM 支持**：兼容 OpenAI 接口（OpenAI、DeepSeek、Qwen 等）及 Anthropic Claude
- **桌面应用**：支持 Windows / macOS / Linux 本地安装，数据存储在本地

> 适用场景：基金申请书（国自然、省级基金等）、学位论文提纲、科研报告、项目可行性报告等有固定模版结构的学术写作。

---

## 下载安装

前往 [GitHub Releases](https://github.com/kentnf/deadline/releases) 下载最新版本：

| 平台 | 安装包 |
|------|--------|
| Windows | `Deadline-Setup-x.y.z.exe` |
| macOS (Intel) | `Deadline-x.y.z-x64.dmg` |
| macOS (Apple Silicon) | `Deadline-x.y.z-arm64.dmg` |
| Linux | `Deadline-x.y.z.AppImage` |

> **macOS 用户**：本应用未经 Apple 公证，首次打开会被 Gatekeeper 拦截。
> - 提示"来自身份不明的开发者" → 在**系统设置 → 隐私与安全性**中点击"仍要打开"
> - 提示"已损坏，无法打开" → 打开终端执行：`xattr -cr /Applications/Deadline.app`
>
> **Windows 用户**：Windows Defender SmartScreen 可能弹出警告，点击"更多信息" → "仍要运行"即可。

---

## 截图

*(截图待补充)*

---

## 使用流程
1. **配置 LLM**：在编辑器页面点击「LLM 配置」，填写 Provider、模型、API Key，测试连接后保存。
2. **上传模版**：进入「模版管理」，上传 `.docx` 模版，配置 LLM 后解析章节结构，确认编辑后保存。
3. **新建项目**：在「我的项目」点击「新建项目」，填写名称并选择模版。
4. **对话写作**：进入编辑器，AI 以评审人角色开场，引导确定研究方向；触发骨架生成后逐章节写作。
5. **导出 Word**：点击编辑器顶部「导出 Word」下载草稿文件。

---

## 开发环境搭建

### 环境要求

- Python 3.11+
- Node.js 20+
- conda 或 venv

### 后端

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev        # 启动 Vite 开发服务器（默认 5173 端口）
```

### Electron（开发模式）

开发模式下 Electron 直接连接后端 8000 端口，无需打包：

```bash
cd electron
npm install
npm start
```

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | FastAPI + Uvicorn + SQLAlchemy + Alembic |
| 数据库 | SQLite |
| 前端 | React + Vite + TypeScript + Zustand |
| 桌面 | Electron + electron-builder |
| LLM | OpenAI SDK（兼容接口）+ Anthropic SDK |
| Word 处理 | python-docx |

---

## 数据存储与备份

应用数据存储在本地，**不上传任何内容到云端**：

| 平台 | 数据目录 |
|------|----------|
| macOS | `~/Library/Application Support/Deadline/` |
| Windows | `%APPDATA%\Deadline\` |
| Linux | `~/.config/Deadline/` |

目录内包含 `coproposal.db`（数据库）和 `uploads/`（上传文件）。请定期手动备份该目录。

---

## 许可证

[MIT](./LICENSE) © 2026 kentnf
