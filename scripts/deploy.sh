#!/usr/bin/env bash
# Actualiza el sitio en el VPS a la última versión de la rama desplegada.
# Ejecutar DESDE la raíz del sitio en el VPS (donde se hizo el git clone), ej:
#   cd /home/<site-user>/htdocs/auxiliar.wolfiax.com && bash scripts/deploy.sh
set -euo pipefail

RAMA="${1:-claude/dian-siigo-import-app-lquv5j}"

echo "==> Actualizando a la rama: $RAMA"
git fetch origin "$RAMA"
git checkout "$RAMA"
git pull origin "$RAMA"

echo "==> Ajustando permisos"
chown -R "$(id -un):$(id -gn)" .

echo "==> Listo. Sitio actualizado en $(pwd)"
