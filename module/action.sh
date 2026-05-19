#!/system/bin/sh
MODDIR=${0%/*}
# shellcheck source=/dev/null
. "${MODDIR}/common.sh"
IP_RULE_SCRIPT="${MODDIR}/hotspot_iprule.sh"

chmod +x "${IP_RULE_SCRIPT}" 2>/dev/null || true

if [ -f "${IP_RULE_ENABLE_FILE}" ]; then
    rm -f "${IP_RULE_ENABLE_FILE}"
    "${IP_RULE_SCRIPT}" del >/dev/null 2>&1 || true
    redir="转发已禁用"
    echo "热点子网转发已禁用"
    log_msg "Action: IP rule disabled"
else
    touch "${IP_RULE_ENABLE_FILE}"
    if is_core_running; then
        "${IP_RULE_SCRIPT}" del >/dev/null 2>&1 || true
        "${IP_RULE_SCRIPT}" add_once >/dev/null 2>&1 || true
        echo "转发规则将立即生效，无需重启"
    else
        echo "主程序未运行，转发规则将在下次启动时生效"
    fi
    redir="转发已激活"
    echo "----------------------------------"
    echo "热点子网转发已激活"
    echo "热点开启后将自动将热点加入转发网络"
    echo "需要在配置中提前配置好 cidr 参数"
    echo "----------------------------------"
    log_msg "Action: IP rule enabled"
fi

if is_core_running; then
    update_module_description "主程序正在运行（$(core_mode)）| ${redir}"
else
    update_module_description "主程序未运行 | ${redir}"
fi
sync
