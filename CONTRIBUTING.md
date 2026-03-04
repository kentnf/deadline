# Contributing to Deadline

感谢你对 Deadline（AI 科研写作助手）的关注！以下是参与贡献的指南。

---

## 环境要求

- Python 3.11+
- Node.js 20+
- conda 或 venv（推荐 conda 管理 Python 环境）
- Git

---

## 本地开发环境搭建

### 1. 克隆仓库

```bash
git clone https://github.com/kentnf/deadline.git
cd deadline
```

### 2. 后端

```bash
cd backend

# 创建并激活虚拟环境（conda）
conda create -n deadline python=3.11
conda activate deadline

# 安装依赖
pip install -r requirements.txt

# 初始化数据库
alembic upgrade head

# 启动后端
uvicorn main:app --reload --port 8000
```

### 3. 前端

```bash
cd frontend
npm install
npm run dev        # 启动 Vite 开发服务器，默认 http://localhost:5173
```

### 4. Electron（开发模式）

开发模式下 Electron 直接连接已运行的后端，无需打包：

```bash
cd electron
npm install
npm start
```

此时 Electron 会加载 `http://localhost:8000`，确保后端已在运行。

---

## 打包构建

### 打包后端（PyInstaller）

```bash
# 安装 pyinstaller
pip install pyinstaller

# 从项目根目录运行
bash electron/scripts/build-backend.sh
```

输出在 `electron/resources/backend/server/`。

### 打包前端

```bash
cd frontend
npm run build
# 构建产物在 frontend/dist/

# 复制到后端 static 目录（用于 production 模式）
mkdir -p ../backend/static
cp -r dist/. ../backend/static/
```

### 打包 Electron 安装包

```bash
cd electron
npm run build        # 所有平台
npm run build:mac    # 仅 macOS
npm run build:win    # 仅 Windows
npm run build:linux  # 仅 Linux
```

输出在 `electron/dist/`。

---

## 数据库迁移

新增数据库字段时，请创建 Alembic 迁移文件：

```bash
cd backend
alembic revision --autogenerate -m "描述变更内容"
alembic upgrade head
```

---

## PR 提交规范

1. 从 `main` 分支创建功能分支：`git checkout -b feat/your-feature`
2. 保持 PR 聚焦，每个 PR 只做一件事
3. PR 标题格式：`feat: 功能描述` / `fix: 修复描述` / `docs: 文档更新`
4. 提交前确认后端和前端均能正常启动

---

## 报告问题

请使用 GitHub Issues，选择对应的模版：
- [Bug Report](https://github.com/kentnf/deadline/issues/new?template=bug_report.md)
- [Feature Request](https://github.com/kentnf/deadline/issues/new?template=feature_request.md)
