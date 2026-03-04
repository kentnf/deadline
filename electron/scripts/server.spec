# -*- mode: python ; coding: utf-8 -*-
import os

block_cipher = None

a = Analysis(
    ['../../backend/server.py'],
    pathex=['../../backend'],
    binaries=[],
    datas=[
        ('../../backend/alembic', 'alembic'),
        ('../../backend/alembic.ini', '.'),
    ],
    hiddenimports=[
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'fastapi',
        'sqlalchemy',
        'sqlalchemy.dialects.sqlite',
        'alembic',
        'alembic.runtime.migration',
        'alembic.operations',
        'pypdf',
        'openai',
        'anthropic',
        'docx',
        'python_docx',
        'multipart',
        'aiofiles',
        'httpx',
        'dotenv',
        'app.api.templates',
        'app.api.projects',
        'app.api.llm',
        'app.api.export',
        'app.api.chat',
        'app.api.papers',
        'app.api.profile',
        'app.api.tags',
        'app.models.base',
        'app.models.paper',
        'app.models.project',
        'app.models.profile',
        'app.services.llm_factory',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='server',
)
