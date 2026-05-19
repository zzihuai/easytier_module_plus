#!/system/bin/sh
MODDIR=${0%/*}
# shellcheck source=/dev/null
. "${MODDIR}/common.sh"

log_msg "web guard started"

while true; do
    if [ -f "${WEB_DISABLE_FILE}" ]; then
        if is_web_running; then
            log_msg "web disabled by switch; stopping"
            kill_web
        fi
        sleep 5
        continue
    fi

    if ! is_web_running; then
        start_web_once >/dev/null 2>&1 || true
    fi

    sleep 10
done
