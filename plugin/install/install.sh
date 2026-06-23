#!/usr/bin/env bash
# ============================================================
#   carrot v8 plugin 安装脚本 (Linux / macOS / Termux)
#   - 定位酒馆根目录
#   - 把 config.yaml 的 enableServerPlugins 改为 true
#   - 复制本扩展目录的 plugin 到 <ST_ROOT>/plugins/carrot
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

# 2. 从源 plugin 目录向上寻找 ST_ROOT。
#    兼容 installForAll: <ST_ROOT>/public/scripts/extensions/third-party/carrot/plugin
#    兼容单用户安装: <ST_ROOT>/data/<user>/extensions[/third-party]/carrot/plugin
ST_ROOT=""
CUR="$SRC_PLUGIN"
for _ in 1 2 3 4 5 6 7 8; do
    CUR="$(cd "$CUR/.." 2>/dev/null && pwd || true)"
    if [ -z "$CUR" ] || [ "$CUR" = "/" ]; then break; fi
    if [ -f "$CUR/config.yaml" ] && [ -f "$CUR/server.js" ]; then
        ST_ROOT="$CUR"
        break
    fi
done

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

# 5. 复制 plugin 到酒馆 plugins 目录（不再用软链，更兼容）
mkdir -p "$ST_ROOT/plugins"
DEST="$ST_ROOT/plugins/carrot"

if [ -e "$DEST" ] || [ -L "$DEST" ]; then
    echo "[信息] $DEST 已存在（可能是旧软链或上次安装），删除"
    rm -rf "$DEST"
fi

echo "[步骤] 复制 $SRC_PLUGIN -> $DEST"
cp -r "$SRC_PLUGIN" "$DEST"

echo
echo "============================================================"
echo "=== 安装完成 ==="
echo "============================================================"
echo
echo "*** 下一步：重启酒馆服务器进程 ***"
echo
echo "检测你的酒馆是怎么启动的："

DETECTED=""
if command -v pm2 >/dev/null 2>&1 && pm2 list 2>/dev/null | grep -qi sillytavern; then
    DETECTED="pm2"
    echo "  ✓ 检测到 pm2 在管 sillytavern 进程"
    echo "    执行：pm2 restart sillytavern"
    echo "    首次安装后手动执行一次；以后 carrot 升级可在设置「重启后端」一键完成。"
elif systemctl list-units --type=service 2>/dev/null | grep -qi sillytavern; then
    DETECTED="systemd"
    echo "  ✓ 检测到 systemd 在管 sillytavern 服务"
    echo "    执行：sudo systemctl restart sillytavern"
fi

if [ -z "$DETECTED" ]; then
    if [ "$IS_TERMUX" = "1" ]; then
        echo "  - Termux 环境：在跑 node server.js 的会话里 Ctrl+C，然后重新执行"
    else
        echo "  - 裸 node：在跑 node 的终端 Ctrl+C，重新执行 node server.js"
        echo "  - 建议改用 pm2 管理：npm install -g pm2 && pm2 start server.js --name sillytavern"
        echo "    （改用 pm2 后，以后 carrot 升级可在设置里点「重启后端」一键完成）"
    fi
fi
echo
echo "⚠ 重启 = 关闭并重启 node 进程，不是按 F5 刷新网页！"
echo
echo "重启完成后回到 carrot 设置面板，「API」标签会显示绿色「已启用」"
echo "============================================================"
echo
