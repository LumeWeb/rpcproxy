#!/bin/sh

set -x

if [ ! -d /data ]; then
    exit 0
fi

while true; do
  inotifywait -q -e create -e modify --include ".reload" /data
  rm -f /data/.reload
  killall -9 node
done
