#!/usr/bin/env bash
# Compatibilidad para instalaciones que ejecutan este archivo desde cron.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "$ROOT/scripts/deploy-safe.sh"
