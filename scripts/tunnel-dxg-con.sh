#!/usr/bin/env bash
# Mac 本地 3000 -> 远程 dxg-con (8.134.38.29) 127.0.0.1:3000
set -euo pipefail

HOST="${1:-dxg-con}"
LOCAL_PORT="${LOCAL_PORT:-3000}"
REMOTE_PORT="${REMOTE_PORT:-3000}"
URL="http://127.0.0.1:${LOCAL_PORT}/"

if lsof -nP -iTCP:"${LOCAL_PORT}" -sTCP:LISTEN 2>/dev/null | grep -q ssh; then
  echo "隧道已在运行: ${URL}"
  if curl -sf --connect-timeout 2 "${URL}" >/dev/null; then
    echo "远程服务正常 (HTTP 200)"
    open "${URL}" 2>/dev/null || true
  else
    echo "警告: 端口在监听但 HTTP 无响应，请检查远程 3000 服务是否已启动"
  fi
  exit 0
fi

echo "正在连接 ${HOST} 并转发 ${LOCAL_PORT} -> 127.0.0.1:${REMOTE_PORT} ..."
echo "登录成功后请勿关闭此窗口；浏览器打开: ${URL}"
exec ssh -N -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" -p 8089 evalops@8.134.38.29
