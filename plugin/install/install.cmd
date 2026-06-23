@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM ============================================================
REM   carrot v8 plugin 安装脚本 (Windows)
REM   - 定位酒馆根目录
REM   - 把 config.yaml 的 enableServerPlugins 改为 true
REM   - 复制本扩展目录的 plugin 到 <ST_ROOT>/plugins/carrot
REM ============================================================

echo.
echo === carrot plugin 安装脚本 ===
echo.

REM 1. 计算源 plugin 目录（脚本所在目录的上一级）
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "SRC_PLUGIN=%%~fI"
echo [信息] 源 plugin 目录: !SRC_PLUGIN!

if not exist "!SRC_PLUGIN!\index.js" (
    echo [错误] 找不到 plugin\index.js，脚本似乎放在了错误的位置
    echo        本脚本应位于 carrot\plugin\install\install.cmd
    pause
    exit /b 1
)

REM 2. 从源目录路径反推 ST_ROOT
REM    路径模板: <ST_ROOT>\data\<user>\extensions\carrot\plugin
REM    上溯 4 级即为 ST_ROOT
set "ST_ROOT="
for %%I in ("!SRC_PLUGIN!\..\..\..\..\..") do set "GUESS_ROOT=%%~fI"
if exist "!GUESS_ROOT!\config.yaml" if exist "!GUESS_ROOT!\server.js" set "ST_ROOT=!GUESS_ROOT!"

REM 3. 若没找到，扫描常见路径
if "!ST_ROOT!"=="" (
    echo [信息] 自动定位失败，扫描常见路径...
    for %%P in (
        "%CD%"
        "%USERPROFILE%\SillyTavern"
        "C:\SillyTavern"
        "D:\SillyTavern"
    ) do (
        if exist "%%~P\config.yaml" if exist "%%~P\server.js" (
            set "ST_ROOT=%%~P"
            goto :found_root
        )
    )
)
:found_root

if "!ST_ROOT!"=="" (
    echo [错误] 没找到酒馆根目录
    echo        请把酒馆完整路径作为参数: install.cmd "D:\path\to\SillyTavern"
    pause
    exit /b 1
)
echo [信息] 酒馆根目录: !ST_ROOT!

REM 允许通过参数覆盖
if not "%~1"=="" set "ST_ROOT=%~1"

REM 4. （v8.0.2+ 不再用软链，无需管理员）

REM 5. 改 config.yaml: enableServerPlugins true
set "CONFIG=!ST_ROOT!\config.yaml"
echo [步骤] 改写 !CONFIG!
powershell -NoProfile -Command ^
    "$p='!CONFIG!';" ^
    "$c=Get-Content -LiteralPath $p -Raw;" ^
    "if ($c -match '(?m)^enableServerPlugins:\s*true') { Write-Host '       已经是 true，跳过' }" ^
    "elseif ($c -match '(?m)^enableServerPlugins:\s*false') { ($c -replace '(?m)^enableServerPlugins:\s*false','enableServerPlugins: true') | Set-Content -LiteralPath $p -NoNewline; Write-Host '       已改为 true' }" ^
    "else { Add-Content -LiteralPath $p -Value \"`nenableServerPlugins: true\"; Write-Host '       未找到该字段，已追加' }"
if errorlevel 1 (
    echo [错误] config.yaml 改写失败
    pause
    exit /b 1
)

REM 6. 复制 plugin 到 <ST_ROOT>\plugins\carrot（不再用软链，无需管理员权限）
set "DEST=!ST_ROOT!\plugins\carrot"
if not exist "!ST_ROOT!\plugins" mkdir "!ST_ROOT!\plugins"

if exist "!DEST!" (
    echo [信息] !DEST! 已存在（可能是旧软链或上次安装），删除
    rmdir /s /q "!DEST!" 2>nul
    if exist "!DEST!" del /f /q "!DEST!" 2>nul
)

echo [步骤] 复制 !SRC_PLUGIN! -^> !DEST!
xcopy /E /I /Y /Q "!SRC_PLUGIN!" "!DEST!" >nul
if errorlevel 1 (
    echo [错误] xcopy 失败
    pause
    exit /b 1
)

echo.
echo ============================================================
echo === 安装完成 ===
echo ============================================================
echo.
echo *** 下一步：重启酒馆服务器进程 ***
echo.
echo 检测你的酒馆是怎么启动的：
where pm2 >nul 2>&1
if not errorlevel 1 (
    echo   - 看起来装了 pm2：执行  pm2 restart sillytavern  ^(或对应进程名^)
    echo     首次安装后 pm2 重启即可；以后 carrot 升级可在设置里点"重启后端"一键完成。
    echo.
)
echo   - 如果用 Start.bat 双击启动：
echo       1) 找到正在跑 node 的黑窗口，关闭它
echo       2) 重新双击 Start.bat
echo.
echo   - 如果直接 node server.js：Ctrl+C 停掉，重新执行
echo.
echo ⚠ 重启 = 关闭并重启 node 进程，不是按 F5 刷新网页！
echo.
echo 重启完成后回到 carrot 设置面板，「API」标签会显示绿色「已启用」
echo ============================================================
pause
