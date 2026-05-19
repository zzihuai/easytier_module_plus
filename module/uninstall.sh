#!/system/bin/sh
MODDIR=${0%/*}
if [ -f "${MODDIR}/common.sh" ]; then
    # shellcheck source=/dev/null
    . "${MODDIR}/common.sh"
    kill_core
    kill_web
else
    pkill -f "${MODDIR}/easytier-core" >/dev/null 2>&1 || true
    pkill -f "${MODDIR}/easytier-web" >/dev/null 2>&1 || true
fi
"${MODDIR}/hotspot_iprule.sh" del >/dev/null 2>&1 || true
rm -rf "${MODDIR:?}/"*
