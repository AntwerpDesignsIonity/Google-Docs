#!/usr/bin/env bash
# IONITY GUI installer launcher (Linux / macOS terminal).
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found in PATH."
  echo "Install Node.js 18 or newer from https://nodejs.org/ and re-run this script."
  exit 1
fi

exec node installer.js
