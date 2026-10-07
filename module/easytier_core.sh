#!/system/bin/sh
MODDIR=${0%/*}
# shellcheck source=/dev/null
. "${MODDIR}/common.sh"

log_msg "core guard started"

GUARD_LOCK_DIR="${RUN_DIR}/core-guard.lock"
GUARD_START_TIME=""

read_guard_start_time() {
    guard_stat_line=""
    IFS= read -r guard_stat_line < "/proc/$1/stat" || return 1
    guard_stat_fields=${guard_stat_line##*) }
    guard_field_index=0
    for guard_stat_field in ${guard_stat_fields}; do
        guard_field_index=$((guard_field_index + 1))
        if [ "${guard_field_index}" -eq 20 ]; then echo "${guard_stat_field}"; return 0; fi
    done
    return 1
}

claim_guard_lock() {
    guard_wait_count=0
    while ! mkdir "${GUARD_LOCK_DIR}" 2>/dev/null; do
        guard_owner_pid=$(cat "${GUARD_LOCK_DIR}/pid" 2>/dev/null)
        guard_owner_start=$(cat "${GUARD_LOCK_DIR}/start" 2>/dev/null)
        if [ -n "${guard_owner_pid}" ] && kill -0 "${guard_owner_pid}" 2>/dev/null; then
            current_guard_start=$(read_guard_start_time "${guard_owner_pid}")
            if [ -z "${guard_owner_start}" ] || [ "${current_guard_start}" = "${guard_owner_start}" ]; then
                return 1
            fi
        fi
        if [ -n "${guard_owner_pid}" ] || [ "${guard_wait_count}" -ge 10 ]; then
            if mkdir "${GUARD_LOCK_DIR}/reaper" 2>/dev/null; then
                guard_owner_pid=$(cat "${GUARD_LOCK_DIR}/pid" 2>/dev/null)
                guard_owner_start=$(cat "${GUARD_LOCK_DIR}/start" 2>/dev/null)
                if [ -n "${guard_owner_pid}" ] && kill -0 "${guard_owner_pid}" 2>/dev/null; then
                    current_guard_start=$(read_guard_start_time "${guard_owner_pid}")
                    if [ -z "${guard_owner_start}" ] || [ "${current_guard_start}" = "${guard_owner_start}" ]; then
                        rmdir "${GUARD_LOCK_DIR}/reaper" 2>/dev/null || true
                        return 1
                    fi
                elif [ -z "${guard_owner_pid}" ] && [ "${guard_wait_count}" -lt 10 ]; then
                    rmdir "${GUARD_LOCK_DIR}/reaper" 2>/dev/null || true
                    return 1
                fi
                rm -rf "${GUARD_LOCK_DIR}"
            fi
        fi
        guard_wait_count=$((guard_wait_count + 1))
        sleep 0.1
    done
    GUARD_START_TIME=$(read_guard_start_time "$$") || { rmdir "${GUARD_LOCK_DIR}"; return 1; }
    printf '%s\n' "$$" > "${GUARD_LOCK_DIR}/pid"
    printf '%s\n' "${GUARD_START_TIME}" > "${GUARD_LOCK_DIR}/start"
}

release_guard_lock() {
    guard_owner_pid=$(cat "${GUARD_LOCK_DIR}/pid" 2>/dev/null)
    guard_owner_start=$(cat "${GUARD_LOCK_DIR}/start" 2>/dev/null)
    if [ "${guard_owner_pid}" = "$$" ] && [ "${guard_owner_start}" = "${GUARD_START_TIME}" ]; then
        rm -rf "${GUARD_LOCK_DIR}"
    fi
}

claim_guard_lock || exit 0
trap 'release_guard_lock; control_lock_release' 0
trap 'exit 0' 1 2 3 15

while true; do
    if control_lock_acquire 1; then
        if [ -f "${CORE_DISABLE_FILE}" ]; then
            update_module_description "主程序已关闭 | $(redir_status)"
            if is_core_running; then
                log_msg "core disabled by switch; stopping"
                kill_core || log_msg "core stop failed while disabled"
            fi
        elif core_process_records; then
            if [ "${CORE_PROCESS_COUNT}" -gt 1 ]; then
                log_msg "multiple easytier-core processes found: ${CORE_PROCESS_RECORDS}"
                update_module_description "检测到多个主程序，请手动重启清理"
            elif [ "${CORE_PROCESS_COUNT}" -eq 0 ]; then
                start_core_once >/dev/null 2>&1 || true
            else
                write_core_pid "${CORE_PROCESS_RECORDS%% *}"
                update_module_description "主程序正在运行（$(core_mode)）| $(redir_status)"
            fi
        else
            log_msg "core process discovery failed; refusing to start another instance"
        fi
        control_lock_release
    fi

    sleep 5
done
