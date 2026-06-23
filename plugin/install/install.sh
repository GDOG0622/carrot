#!/usr/bin/env bash
# ============================================================
#   carrot v8 plugin 安装脚本 (Linux / macOS / Termux)
#   - 定位酒馆根目录
#   - 把 config.yaml 的 enableServerPlugins 改为 true
#   - 建立软链接 <ST_ROOT>/plugins/carrot -> 本扩展目录的 plugin
# ============================================================
set -e

echo
echo "=== carrot plugin 安装脚本 ==="
echo

# 1. 源 plugin 目录（脚本所在目录的上一级）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_PLUGIN="$(cd "$SCRIPT_DIR/.." && pwd)"
echo "[信息] 源 plugin 目录: $SRC_PLUGIN"

if [ ! -f "$SRC_PLUGIN/index.js" ]; then
    echo "[错误] 找不到 plugin/index.js"
    echo "       本脚本应位于 carrot/plugin/install/install.sh"
    exit 1
fi

# 2. 反推 ST_ROOT：<ST_ROOT>/data/<user>/extensions/carrot/plugin → 上溯 4 级
ST_ROOT=""
GUESS_ROOT="$(cd "$SRC_PLUGIN/../../../.." 2>/dev/null && pwd || true)"
if [ -n "$GUESS_ROOT" ] && [ -f "$GUESS_ROOT/config.yaml" ] && [ -f "$GUESS_ROOT/server.js" ]; then
    ST_ROOT="$GUESS_ROOT"
fi

# Termux 检测
IS_TERMUX=0
if [ -n "${PREFIX:-}" ] && echo "$PREFIX" | grep -q "com.termux"; then
    IS_TERMUX=1
    echo "[信息] 检测到 Termux 环境"
fi

# 3. 扫常见路径
if [ -z "$ST_ROOT" ]; then
    echo "[信息] 自动定位失败，扫描常见路径..."
    CANDIDATES=(
        "$PWD"
        "$HOME/SillyTavern"
        "/data/SillyTavern"
        "/opt/SillyTavern"
        "/root/SillyTavern"
    )
    # Termux 常见位置
    if [ "$IS_TERMUX" = "1" ]; then
        CANDIDATES+=(
            "$HOME/SillyTavern"
            "/data/data/com.termux/files/home/SillyTavern"
        )
    fi
    for p in "${CANDIDATES[@]}"; do
        if [ -f "$p/config.yaml" ] && [ -f "$p/server.js" ]; then
            ST_ROOT="$p"
            break
        fi
    done
fi

# 允许通过参数覆盖
if [ -n "${1:-}" ]; then
    ST_ROOT="$1"
fi

if [ -z "$ST_ROOT" ]; then
    echo "[错误] 没找到酒馆根目录"
    echo "       请把酒馆完整路径作为参数: ./install.sh /path/to/SillyTavern"
    exit 1
fi
echo "[信息] 酒馆根目录: $ST_ROOT"

# 4. 改 config.yaml
CONFIG="$ST_ROOT/config.yaml"
echo "[步骤] 改写 $CONFIG"
if grep -qE '^enableServerPlugins:\s*true' "$CONFIG"; then
    echo "       已经是 true，跳过"
elif grep -qE '^enableServerPlugins:\s*false' "$CONFIG"; then
    # 备份再改
    cp "$CONFIG" "$CONFIG.carrot.bak"
    sed -i.tmp -E 's/^enableServerPlugins:[[:space:]]*false/enableServerPlugins: true/' "$CONFIG"
    rm -f "$CONFIG.tmp"
    echo "       已改为 true（原文件备份为 config.yaml.carrot.bak）"
else
    echo "" >> "$CONFIG"
    echo "enableServerPlugins: true" >> "$CONFIG"
    echo "       未找到该字段，已追加"
fi

# 5. 建软链
mkdir -p "$ST_ROOT/plugins"
LINK="$ST_ROOT/plugins/carrot"

if [ -e "$LINK" ] || [ -L "$LINK" ]; then
    echo "[信息] $LINK 已存在，删除旧链接"
    rm -rf "$LINK"
fi

echo "[步骤] 建立软链 $LINK -> $SRC_PLUGIN"
ln -s "$SRC_PLUGIN" "$LINK"

echo
echo "=== 安装完成 ==="
echo
echo "下一步：重启酒馆服务器"
echo "  注意：是 kill 掉 node 进程重新启动，不是按 F5 刷新网页！"
echo "  pm2 用户：pm2 restart sillytavern"
echo "  systemd 用户：sudo systemctl restart sillytavern"
echo "  Termux 用户：Ctrl+C 停掉，重新跑 node server.js"
echo
echo "重启完成后回到 carrot 设置面板，状态会自动变成「已启用」"
echo
