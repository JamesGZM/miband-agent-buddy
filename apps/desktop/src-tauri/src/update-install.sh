#!/bin/sh
# All arguments are validated local paths from the running app, never remote text.
set -eu
pid=$1
current=$2
next=$3
backup=$4
open_app=$5
count=0
while kill -0 "$pid" 2>/dev/null; do
  count=$((count + 1))
  [ "$count" -le 30 ] || exit 1
  sleep 1
done
[ -d "$current" ] && [ -d "$next" ] && [ ! -e "$backup" ] || exit 1
if /bin/mv "$current" "$backup"; then
  if /bin/mv "$next" "$current"; then
    if "$open_app" "$current"; then
      /bin/rm -f "$0"
      /bin/rmdir "$(/usr/bin/dirname "$0")" 2>/dev/null || true
      exit 0
    fi
    /bin/mv "$current" "$next" || exit 1
  fi
  /bin/mv "$backup" "$current" || exit 1
  "$open_app" "$current" || true
else
  "$open_app" "$current" || true
fi
exit 1
