@echo off
setlocal

set REPO_ROOT=%~dp0..\..
set SPEC=%REPO_ROOT%\electron\scripts\server.spec
set DIST=%REPO_ROOT%\electron\resources\backend

echo [build-backend] Running PyInstaller...
cd /d "%REPO_ROOT%\backend"
pyinstaller "%SPEC%" --distpath "%DIST%" --workpath "%TEMP%\pyinstaller-build" --noconfirm

echo [build-backend] Done -^> %DIST%\server\
