#!/usr/bin/env bash
# Restart the Expo web dev server on :8095 (Metro's watcher misses some edits on this machine).
cd "$(dirname "$0")/.."
PID=$(netstat -ano | grep ':8095 ' | grep LISTENING | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //T //PID $PID >/dev/null 2>&1
cd apps/customer-app
(CI=1 npx expo start --web --port 8095 ${1:+--clear} > ../../scripts/.expo.log 2>&1 &)
for i in $(seq 1 80); do sleep 3; curl -s -o /dev/null -w "%{http_code}" http://localhost:8095 2>/dev/null | grep -q 200 && break; done
echo "expo up"
