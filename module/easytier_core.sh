#!/system/bin/sh
MODDIR=${0%/*}
# shellcheck source=/dev/null
. "${MODDIR}/common.sh"

log_msg "core guard started"

while true; do
    if [ -f "${CORE_DISABLE_FILE}" ]; then
        update_module_description "主程序已关闭 | $(redir_status)"
        if is_core_running; then
            log_msg "core disabled by switch; stopping"
            kill_core
        fi
        sleep 5
        continue
    fi

    if ! is_core_running; then
        start_core_once >/dev/null 2>&1 || true
    else
        update_module_description "主程序正在运行（$(core_mode)）| $(redir_status)"
    fi

    sleep 10
done
