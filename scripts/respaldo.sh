#!/usr/bin/env bash
# Respaldo de Cambios JC: base de datos (pg_dump comprimido) + carpeta de subidas (logo).
#
# Uso:   scripts/respaldo.sh
# Lee DATABASE_URL y CARPETA_SUBIDAS del .env de la raíz (o del entorno, que tiene prioridad).
# Variables opcionales:
#   RESPALDOS_DIR        carpeta de destino (por defecto ./respaldos)
#   RESPALDOS_CONSERVAR  cuántos respaldos de cada tipo conservar (por defecto 14)
#   PG_BIN               carpeta de pg_dump si no está en el PATH
# Restaurar: ver README, sección "Respaldo y restauración".
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -n "${PG_BIN:-}" ] && PATH="$PG_BIN:$PATH"

# Lee una variable del .env sin ejecutarlo como script (el entorno manda sobre el archivo).
leer_env() {
  local nombre="$1" valor="${!1:-}"
  if [ -z "$valor" ] && [ -f "$RAIZ/.env" ]; then
    valor="$(grep -E "^${nombre}=" "$RAIZ/.env" | tail -n 1 | cut -d= -f2- | tr -d '\r' || true)"
    valor="${valor%\"}"; valor="${valor#\"}"
  fi
  printf '%s' "$valor"
}

DATABASE_URL="$(leer_env DATABASE_URL)"
CARPETA_SUBIDAS="$(leer_env CARPETA_SUBIDAS)"
DESTINO="${RESPALDOS_DIR:-$RAIZ/respaldos}"
CONSERVAR="${RESPALDOS_CONSERVAR:-14}"

[ -n "$DATABASE_URL" ] || { echo "Falta DATABASE_URL (en el .env o en el entorno)." >&2; exit 1; }
command -v pg_dump >/dev/null || { echo "No se encontró pg_dump. Instala el cliente de PostgreSQL 18 o define PG_BIN." >&2; exit 1; }
case "$CONSERVAR" in ''|*[!0-9]*|0) echo "RESPALDOS_CONSERVAR debe ser un número mayor que 0." >&2; exit 1;; esac

# Las subidas se declaran relativas a apps/api (donde arranca la API). Una ruta con letra de unidad
# (Windows) también es absoluta.
UNIDAD_WINDOWS='^[A-Za-z]:[\/]'
if [ -n "$CARPETA_SUBIDAS" ] && [ "${CARPETA_SUBIDAS#/}" = "$CARPETA_SUBIDAS" ] && ! [[ "$CARPETA_SUBIDAS" =~ $UNIDAD_WINDOWS ]]; then
  CARPETA_SUBIDAS="$RAIZ/apps/api/$CARPETA_SUBIDAS"
fi

# La contraseña viaja por variable de entorno (PGPASSWORD), no por la línea de comandos.
eval "$(DATABASE_URL="$DATABASE_URL" node -e '
  const u = new URL(process.env.DATABASE_URL);
  const q = (v) => "\x27" + v.replace(/\x27/g, "\x27\\x27\x27") + "\x27";
  console.log(`export PGHOST=${q(u.hostname)} PGPORT=${q(u.port || "5432")} PGUSER=${q(decodeURIComponent(u.username))} PGPASSWORD=${q(decodeURIComponent(u.password))} PGDATABASE=${q(u.pathname.slice(1))}`);
')"

mkdir -p "$DESTINO"
SELLO="$(date +%Y-%m-%d_%H%M%S)"
BASE="$DESTINO/cambios_jc_${SELLO}.dump"
SUBIDAS="$DESTINO/subidas_${SELLO}.tar.gz"

# Se escribe a un archivo temporal y se renombra al final: un respaldo a medias nunca parece completo.
trap 'rm -f "$BASE.parcial" "$SUBIDAS.parcial"' EXIT

pg_dump --format=custom --compress=6 --no-owner --file="$BASE.parcial"
mv "$BASE.parcial" "$BASE"
echo "Base de datos: $BASE ($(du -h "$BASE" | cut -f1))"

if [ -n "$CARPETA_SUBIDAS" ] && [ -d "$CARPETA_SUBIDAS" ]; then
  tar --force-local -czf "$SUBIDAS.parcial" -C "$CARPETA_SUBIDAS" .
  mv "$SUBIDAS.parcial" "$SUBIDAS"
  echo "Subidas:       $SUBIDAS ($(du -h "$SUBIDAS" | cut -f1))"
else
  echo "Subidas:       no hay carpeta de subidas todavía; se omite."
fi

# Retención: se conservan los últimos N de cada tipo.
for patron in 'cambios_jc_*.dump' 'subidas_*.tar.gz'; do
  # shellcheck disable=SC2012
  ls -1t "$DESTINO"/$patron 2>/dev/null | tail -n +"$((CONSERVAR + 1))" | while read -r viejo; do
    rm -f -- "$viejo" && echo "Eliminado por antigüedad: $viejo"
  done
done
