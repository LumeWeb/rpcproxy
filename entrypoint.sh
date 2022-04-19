#!/bin/sh

sh /reload.sh &
exec "$@"
