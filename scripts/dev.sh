#!/bin/bash

# 停止所有 vite 和 esbuild 进程
pkill -9 -f "vite" 2>/dev/null
pkill -9 -f "esbuild" 2>/dev/null
sleep 1

# 启动 vite
cd "$(dirname "$0")/.."
npx vite &
PID=$!

echo "Vite started with PID: $PID"
echo "URL: http://localhost:5173/"
