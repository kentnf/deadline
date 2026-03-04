# 科研写作助手 — Deadline

## 项目目标

构建一个基于自然语言对话的科研写作助手。支持基金申请书、学位论文、科研报告等有模版结构的学术写作场景。用户仅通过对话即可完成从想法到完整初稿的全流程写作。支持 Web 部署和 Windows / macOS / Linux 桌面安装包。

## 当前状态

**阶段：核心功能已实现，持续迭代优化中**

核心写作功能全部完成，已打包为 Electron 桌面应用，具备 GitHub Actions 自动发布流程。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | FastAPI + Uvicorn |
| 数据库 | SQLite + SQLAlchemy + Alembic |
| 前端 | React + Vite + TypeScript |
| Word 处理 | python-docx |
| LLM 调用 | OpenAI SDK（兼容接口）+ Anthropic SDK |
| 前端状态 | Zustand |
| Markdown 编辑 | @uiw/react-md-editor |
| 桌面打包 | Electron + electron-builder + PyInstaller |

---

## 核心设计决策摘要

1. **模版解析**：Word 上传 → python-docx 提取 → LLM 结构化 → 用户可视化确认和补充
2. **内部模版格式**：JSON，支持最多 3 级标题嵌套
3. **生成阈值**：< 800 字直接生成；≥ 800 字先规划段落结构再逐段生成
4. **对话体系**：纯 Markdown 文本，AI 用字母选项（A/B/C/D）引导选择，无专属 UI 组件
5. **项目启动**：模版验证 → AI 扮演评审人开场 → 帮助确定研究方向 → 用户触发骨架生成 → 骨架审阅确认 → 逐章节写作
6. **段落修改**：内容区为阅读模式，点击 ✏️ 进入独立段落修改对话；`paragraph_ref` 为 0-based 索引（按 `\n\n` 分割）
7. **规则覆盖**：项目级 Delta 模式，对话触发，不修改原模版
8. **上下文注入**：每次对话自动注入当前章节 content + 全局骨架摘要 + 有效章节规则
9. **LLM Provider**：统一抽象层，支持 OpenAI 兼容接口和 Anthropic，项目级配置
10. **流式响应**：SSE，全程纯文本 token 流
11. **Word 导出**：python-docx 重建，保留 Bold 和项目符号，其余 Markdown 降级纯文本
12. **桌面打包**：PyInstaller 打包 FastAPI 后端为独立二进制，Electron 管理子进程生命周期，DATA_DIR 指向 OS 用户数据目录
13. **前端 API**：全部使用相对路径 `/api/...`，兼容 Vite dev proxy 和 FastAPI StaticFiles 生产模式

---

## 项目目录结构

```
coproposal/
├── CLAUDE.md
├── README.md
├── CONTRIBUTING.md
├── LICENSE                     # MIT
├── .gitignore
├── .github/
│   ├── workflows/
│   │   └── release.yml         # 三平台自动构建发布
│   └── ISSUE_TEMPLATE/
├── backend/                    # FastAPI 后端
│   ├── main.py                 # 应用入口，APP_VERSION 常量，/api/health, /api/version
│   ├── server.py               # PyInstaller 打包入口
│   ├── requirements.txt
│   ├── requirements-dev.txt    # pyinstaller
│   ├── alembic.ini
│   ├── alembic/versions/
│   └── app/
│       ├── api/                # templates, projects, chat, export, papers, profile, tags, llm
│       ├── models/             # template, project, paper, profile
│       ├── services/           # llm_factory, template_parser, content_generator…
│       └── db/session.py       # DATA_DIR 支持
├── frontend/                   # React 前端
│   ├── vite.config.ts          # base: './', proxy: /api → 8000
│   └── src/
│       ├── App.tsx             # 导航栏含版本号显示
│       ├── pages/
│       ├── components/
│       ├── stores/
│       └── i18n/               # 中英文切换，中文为 key
└── electron/                   # Electron 桌面壳
    ├── main.js                 # 主进程：findFreePort, startBackend, waitForBackend, autoUpdater
    ├── preload.js
    ├── splash.html
    ├── package.json            # version: 0.1.0
    ├── electron-builder.yml    # nsis/dmg/AppImage
    └── scripts/
        ├── server.spec         # PyInstaller spec
        ├── build-backend.sh
        └── build-backend.bat
```

---

## 关键用户旅程

```
1. 上传 Word 模版 → LLM 解析 → 确认编辑 → 保存
   （或：点击"导入示例模版"直接体验）
2. 配置 LLM Provider（API Key、模型）
3. 创建项目 → 绑定模版
4. AI 评审人开场对话 → 帮助确定研究方向
5. 触发骨架生成 → 审阅全章节摘要 → 对话调整 → 确认
6. 点击章节树进入章节写作
   - 短章节（<800字）：对话收集信息 → 触发生成
   - 长章节（≥800字）：对话 → 段落结构规划 → 逐段生成+确认
7. 内容展示区查看 → 点击 ✏️ 进入段落修改对话 → 确认替换
8. 对话中自然表达模版调整意图 → AI 识别 → 字母选项确认 → 保存规则覆盖
9. 所有章节 reviewed → 导出 Word 草稿
```

---

## 发布流程

```bash
# 本地构建测试
bash electron/scripts/build-backend.sh
cd frontend && npm run build && cp -r dist/. ../backend/static/
cd electron && npm start

# 正式发布（触发 GitHub Actions 三平台构建）
git tag v0.x.x
git push origin v0.x.x
```

发布前需在 GitHub 仓库 Settings → Secrets 中配置 `GH_TOKEN`。

---

## 备注

- 所有对话交互均为纯文本 Markdown，无专属 UI 组件（单选框、多选框等）
- 内容修改通过对话完成，编辑器为阅读模式（小改动可直接编辑）
- 模版规则可通过对话覆盖，原模版始终保持不变
- 不含用户注册/认证，单用户本地部署
- 前端所有 API 调用使用相对路径，通过 Vite proxy（开发）或 FastAPI StaticFiles（生产）统一处理
