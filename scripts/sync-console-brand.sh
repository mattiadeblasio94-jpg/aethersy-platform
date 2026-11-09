#!/usr/bin/env bash
# Sincronizza gli asset di brand Aethersy (branding/web/) in platform/public/.
# Idempotente: va rieseguito dopo ogni rigenerazione del logo (scripts/gen_brand_assets.py).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/branding/web"
DST="$ROOT/platform/public"

mkdir -p "$DST/brand"
cp -f "$SRC/favicon.ico"   "$DST/favicon.ico"
cp -f "$SRC/logo.svg"      "$DST/logo.svg"
cp -f "$SRC/logo-192.png"  "$DST/brand/logo-192.png"
cp -f "$SRC/logo-180.png"  "$DST/brand/logo-180.png"
cp -f "$SRC/brand/logo.png"      "$DST/brand/logo.png"
cp -f "$SRC/brand/full-logo.png" "$DST/brand/full-logo.png"

echo "Asset di brand sincronizzati in $DST"
