#!/system/bin/sh
MODDIR=${0%/*}
# shellcheck source=/dev/null
. "${MODDIR}/common.sh"

chmod 755 "${MODDIR}"/*.sh "${MODDIR}"/easytier-* 2>/dev/null || true

# First install and upgrades keep boot startup enabled unless the user disables it from WebUI.
[ -e "${START_ON_BOOT_FILE}" ] || touch "${START_ON_BOOT_FILE}"

while [ "$(getprop sys.boot_completed 2>/dev/null)" != "1" ]; do
    sleep 5
done

echo "PowerManagerService.noSuspend" > /sys/power/wake_lock 2>/dev/null || true
update_module_description "启动中 | $(redir_status)"
sleep 3

if [ -f "${START_ON_BOOT_FILE}" ]; then
    "${MODDIR}/easytier_core.sh" &
    "${MODDIR}/easytier_web.sh" &
else
    touch "${CORE_DISABLE_FILE}"
    log_msg "boot startup disabled; not starting core/web guards"
    update_module_description "开机启动已关闭 | $(redir_status)"
fi

"${MODDIR}/hotspot_iprule.sh" add &
