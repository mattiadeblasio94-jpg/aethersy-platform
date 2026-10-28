#!/usr/bin/env bash
# 05-branding.sh — Fase 8 (Aethersy)
# Scopo: completare/verificare il branding Aethersy.
# Prerequisiti: stack up (container `aethersy-app`), cartella `branding/` presente.
# Effetto:
#   - verifica che theme.js e gli asset siano montati (bind-mount, vedi compose);
#   - patcha `index.html` (titolo + favicon + link al CSS di brand) in modo
#     VERSION-AWARE, perche' contiene gli hash dei bundle JS/CSS che cambiano
#     a ogni release.
#   - il re-skin profondo (Layer A) sta in `branding/web/brand/aethersy.css`,
#     iniettato come ULTIMO stylesheet cosi' vince a parita' di specificita'.
# Idempotente: rilanciabile a ogni deploy/upgrade.
#
# PERCHE' il patch e' necessario: la Community edition serve sempre `defaultTheme`
# (nome "Activepieces") e ignora nome/logo/colori del DB; `index.html` e' generato
# upstream con `<title>Activepieces</title>` e favicon esterna. Vedi docs/phases.md.
set -euo pipefail

cd "$(dirname "$0")/.."

APP="${APP_CONTAINER:-aethersy-app}"
THEME_DST="/usr/src/app/packages/server/api/dist/src/app/flags/theme.js"
WEB_DST="/usr/src/app/dist/packages/web"

usage() {
  echo "Uso: $0 [--check]" >&2
  echo "  --check   non modifica nulla, verifica solo che il branding sia applicato." >&2
}

check() {
  local rc=0
  echo "==> Verifica branding in ${APP}"
  if docker exec "$APP" grep -q "websiteName: 'Aethersy'" "$THEME_DST"; then
    echo "  theme.js: OK (websiteName Aethersy)"
  else
    echo "  theme.js: NON applicato (bind-mount mancante?)"; rc=1
  fi
  if docker exec "$APP" grep -q "primaryColor: '#00D4FF'" "$THEME_DST"; then
    echo "  palette: OK (primary #00D4FF)"
  else
    echo "  palette: NON aggiornata"; rc=1
  fi
  if docker exec "$APP" grep -q "<title>Aethersy</title>" "$WEB_DST/index.html"; then
    echo "  index.html: OK (title Aethersy)"
  else
    echo "  index.html: NON patchato"; rc=1
  fi
  if docker exec "$APP" grep -q 'href="/favicon.ico"' "$WEB_DST/index.html"; then
    echo "  favicon ref: OK (locale)"
  else
    echo "  favicon ref: ancora esterna"; rc=1
  fi
  if docker exec "$APP" grep -q 'href="/brand/aethersy.css"' "$WEB_DST/index.html"; then
    echo "  brand css ref: OK (/brand/aethersy.css)"
  else
    echo "  brand css ref: NON iniettato"; rc=1
  fi
  if docker exec "$APP" grep -q -- '--primary: 190 100% 50% !important' "$WEB_DST/brand/aethersy.css"; then
    echo "  brand css palette: OK (primary ciano)"
  else
    echo "  brand css palette: NON allineata"; rc=1
  fi
  return $rc
}

if [[ "${1:-}" == "--check" ]]; then
  check
  exit $?
fi
[[ -n "${1:-}" ]] && { usage; exit 2; }

[[ -f branding/theme.js ]] || { echo "ERRORE: branding/theme.js assente." >&2; exit 1; }
[[ -d branding/web ]]     || { echo "ERRORE: branding/web/ assente." >&2; exit 1; }

echo "==> [1/2] Patch di index.html (titolo + favicon + CSS brand), version-aware"
tmp="$(mktemp)"
docker exec "$APP" cat "$WEB_DST/index.html" > "$tmp"
python3 - "$tmp" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1])
html = p.read_text()
html = re.sub(r"<title>.*?</title>", "<title>Aethersy</title>", html, count=1)
html = re.sub(
    r'<link rel="icon" type="image/x-icon" href="[^"]*">',
    '<link rel="icon" type="image/x-icon" href="/favicon.ico">',
    html,
)
# Inietta il CSS di brand come ULTIMO stylesheet di <head> (idempotente).
css_link = '<link rel="stylesheet" href="/brand/aethersy.css">'
if 'href="/brand/aethersy.css"' not in html:
    html = html.replace("</head>", f"  {css_link}\n</head>", 1)
p.write_text(html)
PY
docker cp "$tmp" "${APP}:${WEB_DST}/index.html"
rm -f "$tmp"

echo "==> [2/2] Verifica"
check || true

echo
echo "Verifica pubblica:"
echo "  curl -s https://app.aethersy.online/api/v1/flags | grep -o '\"websiteName\":\"[^\"]*\"'"
echo
echo "NOTA: theme.js e gli asset sono bind-mount (compose), quindi sopravvivono a"
echo "'up -d'. Solo index.html va ripatchato dopo un cambio di AP_VERSION:"
echo "esegui questo script (o '03-deploy.sh', che lo richiama)."
