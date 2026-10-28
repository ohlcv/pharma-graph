#!/bin/bash
# pharma-graph 启动脚本
# 用法: ./start.sh            # 启动 dev server（先清理旧进程）
#       ./start.sh sync       # 启动并打开同步布局模式 ?layout=sync
set -euo pipefail
cd "$(dirname "$0")"

# 1. 清理旧进程
pkill -9 -f "vite" 2>/dev/null || true
pkill -9 -f "esbuild" 2>/dev/null || true
sleep 1

# 2. 依赖检查
if [ ! -d node_modules ]; then
  echo "未找到 node_modules，开始安装依赖..."
  npm install
fi

# 3. 启动 dev server（--host 同时监听 IPv4 127.0.0.1 与 IPv6 ::1，避免系统代理 502）
npx vite --host &
PID=$!

URL="http://localhost:5173/"
[ "${1:-}" = "sync" ] && URL="http://localhost:5173/?layout=sync"

echo "Vite started with PID: $PID"
echo "URL: $URL"

# 4. 自动在浏览器打开（macOS）
if [ "${AUTO_OPEN:-1}" = "1" ] && command -v open >/dev/null 2>&1; then
  sleep 2
  open "$URL"
fi

wait "$PID"
