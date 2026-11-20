#!/bin/sh
# Uruchamia dev/e2e.html w headless Edge w czasie rzeczywistym (ok. 45 s) i wypisuje log testu.
# Wymaga dev/serve.ps1 (port 8092). Użycie: sh dev/run-e2e.sh [sekundy]
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
PROF="$(mktemp -d)"
timeout "${1:-75}" "$EDGE" --headless=new --disable-gpu --enable-logging=stderr --v=0 --user-data-dir="$(cygpath -w "$PROF")" \
  --window-size=1440,900 "http://localhost:8092/rozejrzyj/dev/e2e.html" 2>&1 | grep -o '\[e2e\].*' | sed 's/", source.*//'
