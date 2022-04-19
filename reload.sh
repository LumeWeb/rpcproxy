#!/bin/sh

if [ ! -d /data ]; then
    exit 0
fi

while true; do
  inotifywait -e create -e modify --include ".reload" /data
  killall -9 node
  npm start
  echo "RPC Proxy Restarted"
  rm -f /data/.reload
done
