@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

echo.
echo === carrot plugin 卸载脚本 ===
echo.

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "SRC_PLUGIN=%%~fI"

REM 反推 ST_ROOT
set "ST_ROOT="
for %%I in ("!SRC_PLUGIN!\..\..\..\..\..") do set "GUESS_ROOT=%%~fI"
if exist "!GUESS_ROOT!\config.yaml" set "ST_ROOT=!GUESS_ROOT!"

if "!ST_ROOT!"=="" (
    set /p ST_ROOT="请输入酒馆根目录: "
)

if not exist "!ST_ROOT!\plugins\carrot" (
    echo [信息] !ST_ROOT!\plugins\carrot 不存在，已经卸载过了
    pause
    exit /b 0
)

REM 删已复制的 plugin 目录（也兼容旧版目录软链）
echo [步骤] 删除 !ST_ROOT!\plugins\carrot
rmdir /s /q "!ST_ROOT!\plugins\carrot" 2>nul
if exist "!ST_ROOT!\plugins\carrot" (
    echo [错误] 删除失败
    pause
    exit /b 1
)

REM 删缓存目录（如果存在为真实目录）
if exist "!ST_ROOT!\plugins\carrot-covers" (
    echo [步骤] 删除独立缓存目录
    rmdir /s /q "!ST_ROOT!\plugins\carrot-covers"
)

REM 询问是否恢复 config.yaml
echo.
set /p REVERT="是否把 config.yaml 的 enableServerPlugins 改回 false？(可能影响其他 plugin) [y/N]: "
if /i "!REVERT!"=="y" (
    powershell -NoProfile -Command ^
        "$p='!ST_ROOT!\config.yaml';" ^
        "(Get-Content -LiteralPath $p -Raw) -replace '(?m)^enableServerPlugins:\s*true','enableServerPlugins: false' | Set-Content -LiteralPath $p -NoNewline"
    echo [信息] 已改回 false
)

echo.
echo === 卸载完成 ===
echo 重启酒馆服务器以生效
echo.
pause
