#!/usr/bin/env bash
set -e

echo
echo "=== carrot plugin 卸载脚本 ==="
echo

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_PLUGIN="$(cd "$SCRIPT_DIR/.." && pwd)"

ST_ROOT=""
GUESS_ROOT="$(cd "$SRC_PLUGIN/../../../.." 2>/dev/null && pwd || true)"
if [ -n "$GUESS_ROOT" ] && [ -f "$GUESS_ROOT/config.yaml" ]; then
    ST_ROOT="$GUESS_ROOT"
fi

if [ -z "$ST_ROOT" ]; then
    read -r -p "请输入酒馆根目录: " ST_ROOT
fi

LINK="$ST_ROOT/plugins/carrot"
if [ ! -e "$LINK" ] && [ ! -L "$LINK" ]; then
    echo "[信息] $LINK 不存在，已经卸载过了"
    exit 0
fi

echo "[步骤] 删除 $LINK"
rm -rf "$LINK"

if [ -d "$ST_ROOT/plugins/carrot-covers" ]; then
    echo "[步骤] 删除独立缓存目录"
    rm -rf "$ST_ROOT/plugins/carrot-covers"
fi

echo
read -r -p "是否把 config.yaml 的 enableServerPlugins 改回 false？(可能影响其他 plugin) [y/N]: " REVERT
if [ "$REVERT" = "y" ] || [ "$REVERT" = "Y" ]; then
    sed -i.tmp -E 's/^enableServerPlugins:[[:space:]]*true/enableServerPlugins: false/' "$ST_ROOT/config.yaml"
    rm -f "$ST_ROOT/config.yaml.tmp"
    echo "[信息] 已改回 false"
fi

echo
echo "=== 卸载完成 ==="
echo "重启酒馆服务器以生效"
echo
