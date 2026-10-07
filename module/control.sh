#!/system/bin/sh
MODDIR=${0%/*}
# shellcheck source=/dev/null
. "${MODDIR}/common.sh"

usage() {
    cat <<EOF
Usage: $0 COMMAND

Commands:
  status                 Print module status as JSON
  start-core             Enable and start easytier-core now
  stop-core              Disable and stop easytier-core now
  restart-core           Restart easytier-core now
  core-version           Print the easytier-core version
  enable-boot            Enable boot startup
  disable-boot           Disable boot startup and stop core
  read-config            Print config/config.toml
  write-config           Read stdin and replace config/config.toml atomically
  read-command-args      Print config/command_args if present
  write-command-args     Read stdin and replace config/command_args atomically
  remove-command-args    Remove config/command_args so config.toml is used
  logs                   Print recent core log
  latest                 Print latest GitHub release info as JSON
  update-binary [tag]    Download latest/tag linux-aarch64 release and update binaries
EOF
}

ok_json() {
    msg=$(printf '%s' "$1" | json_escape)
    printf '{"ok":true,"message":"%s"}\n' "${msg}"
}

err_json() {
    msg=$(printf '%s' "$1" | json_escape)
    printf '{"ok":false,"message":"%s"}\n' "${msg}"
    exit 1
}

require_lock() {
    control_lock_acquire || err_json "无法获取控制锁，请稍后重试"
    trap 'control_lock_release' 0
    trap 'exit 1' 1 2 3 15
}

release_lock() {
    control_lock_release
}

case "${1:-}" in
    status)
        module_status_json
        ;;
    core-version)
        [ -x "${EASYTIER_CORE}" ] || err_json "主程序二进制缺失或不可执行"
        core_version=$("${EASYTIER_CORE}" --version 2>/dev/null | head -n 1)
        [ -n "${core_version}" ] || err_json "无法读取主程序版本"
        printf '{"core_version":"%s"}\n' "$(printf '%s' "${core_version}" | json_escape)"
        ;;
    start-core)
        require_lock
        validate_core_config || { release_lock; err_json "配置不存在或为空，无法启动 core"; }
        rm -f "${CORE_DISABLE_FILE}"
        start_core_once >/dev/null 2>&1 || { release_lock; err_json "启动失败或检测到多个 core 实例；请查看日志，必要时执行重启清理"; }
        release_lock
        ok_json "easytier-core 已启动"
        ;;
    stop-core)
        require_lock
        touch "${CORE_DISABLE_FILE}"
        kill_core || { release_lock; err_json "无法停止 easytier-core"; }
        update_module_description "主程序已关闭 | $(redir_status)"
        release_lock
        ok_json "easytier-core 已停止"
        ;;
    restart-core)
        require_lock
        validate_core_config || { release_lock; err_json "配置不存在或为空，无法重启 core"; }
        kill_core || { release_lock; err_json "无法停止 easytier-core"; }
        rm -f "${CORE_DISABLE_FILE}"
        start_core_once >/dev/null 2>&1 || { release_lock; err_json "easytier-core 重启失败，请查看日志"; }
        release_lock
        ok_json "easytier-core 已重启"
        ;;
    enable-boot)
        require_lock
        touch "${START_ON_BOOT_FILE}"
        rm -f "${CORE_DISABLE_FILE}"
        release_lock
        ok_json "开机启动已启用；core 将在下次开机时自动启动"
        ;;
    disable-boot)
        require_lock
        rm -f "${START_ON_BOOT_FILE}"
        touch "${CORE_DISABLE_FILE}"
        kill_core || { release_lock; err_json "无法停止 easytier-core"; }
        update_module_description "开机启动已关闭 | $(redir_status)"
        release_lock
        ok_json "开机启动已禁用，core 已停止"
        ;;
    read-config)
        [ -f "${CONFIG_FILE}" ] || exit 0
        cat "${CONFIG_FILE}"
        ;;
    write-config)
        mkdir -p "${CONFIG_DIR}"
        tmp="${CONFIG_FILE}.tmp.$$"
        cat > "${tmp}" || { rm -f "${tmp}"; err_json "写入配置临时文件失败"; }
        chmod 0644 "${tmp}" 2>/dev/null || { rm -f "${tmp}"; err_json "设置配置文件权限失败"; }
        mv "${tmp}" "${CONFIG_FILE}" || { rm -f "${tmp}"; err_json "替换配置文件失败"; }
        log_msg "config.toml updated from module control"
        ok_json "配置已保存；如需生效请重启 core"
        ;;
    read-command-args)
        [ -f "${COMMAND_ARGS}" ] || exit 0
        cat "${COMMAND_ARGS}"
        ;;
    write-command-args)
        mkdir -p "${CONFIG_DIR}"
        tmp="${COMMAND_ARGS}.tmp.$$"
        cat > "${tmp}" || { rm -f "${tmp}"; err_json "写入参数临时文件失败"; }
        chmod 0644 "${tmp}" 2>/dev/null || { rm -f "${tmp}"; err_json "设置参数文件权限失败"; }
        mv "${tmp}" "${COMMAND_ARGS}" || { rm -f "${tmp}"; err_json "替换参数文件失败"; }
        log_msg "command_args updated from module control"
        ok_json "启动参数已保存；当前会优先使用 command_args"
        ;;
    remove-command-args)
        rm -f "${COMMAND_ARGS}"
        ok_json "command_args 已删除；下次启动将使用 config.toml"
        ;;
    logs)
        file="${LOG_FILE}"
        [ -f "${file}" ] || exit 0
        tail -n 200 "${file}"
        ;;
    latest)
        tmp="${RUN_DIR}/latest_release.json"
        if command -v curl >/dev/null 2>&1; then
            curl -fsSL --connect-timeout 20 https://api.github.com/repos/EasyTier/EasyTier/releases/latest > "${tmp}" || err_json "获取 GitHub Release 信息失败"
        elif command -v wget >/dev/null 2>&1; then
            wget -qO "${tmp}" https://api.github.com/repos/EasyTier/EasyTier/releases/latest || err_json "获取 GitHub Release 信息失败"
        else
            err_json "系统缺少 curl/wget，无法检查更新"
        fi
        tag=$(sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${tmp}" | head -n 1)
        asset=$(grep -o 'https://[^" ]*/easytier-linux-aarch64-[^" ]*\.zip' "${tmp}" | head -n 1 | sed 's#\\/#/#g')
        printf '{"tag":"%s","asset":"%s"}\n' "$(printf '%s' "${tag}" | json_escape)" "$(printf '%s' "${asset}" | json_escape)"
        ;;
    update-binary)
        tag="${2:-latest}"
        tmpdir="${RUN_DIR}/update.$$"
        mkdir -p "${tmpdir}" || { release_lock; err_json "无法创建临时目录"; }
        api_url="https://api.github.com/repos/EasyTier/EasyTier/releases/latest"
        [ "${tag}" = "latest" ] || api_url="https://api.github.com/repos/EasyTier/EasyTier/releases/tags/${tag}"
        if command -v curl >/dev/null 2>&1; then
            curl -fsSL --connect-timeout 20 "${api_url}" > "${tmpdir}/release.json" || { rm -rf "${tmpdir}"; release_lock; err_json "获取 Release 信息失败"; }
        elif command -v wget >/dev/null 2>&1; then
            wget -qO "${tmpdir}/release.json" "${api_url}" || { rm -rf "${tmpdir}"; release_lock; err_json "获取 Release 信息失败"; }
        else
            rm -rf "${tmpdir}"; release_lock; err_json "系统缺少 curl/wget，无法更新"
        fi
        asset=$(grep -o 'https://[^" ]*/easytier-linux-aarch64-[^" ]*\.zip' "${tmpdir}/release.json" | head -n 1 | sed 's#\\/#/#g')
        rel_tag=$(sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${tmpdir}/release.json" | head -n 1)
        [ -n "${asset}" ] || { rm -rf "${tmpdir}"; release_lock; err_json "Release 中未找到 linux-aarch64 资产"; }
        if command -v curl >/dev/null 2>&1; then
            curl -fL --connect-timeout 30 --retry 3 -o "${tmpdir}/easytier-linux-aarch64.zip" "${asset}" || { rm -rf "${tmpdir}"; release_lock; err_json "下载 linux-aarch64 资产失败"; }
        else
            wget -O "${tmpdir}/easytier-linux-aarch64.zip" "${asset}" || { rm -rf "${tmpdir}"; release_lock; err_json "下载 linux-aarch64 资产失败"; }
        fi
        unzip -o "${tmpdir}/easytier-linux-aarch64.zip" -d "${tmpdir}/unzip" >/dev/null 2>&1 || { rm -rf "${tmpdir}"; release_lock; err_json "解压 linux-aarch64 资产失败"; }
        for bin in easytier-core easytier-cli; do
            src=$(find "${tmpdir}/unzip" -type f -name "${bin}" | head -n 1)
            [ -n "${src}" ] || { rm -rf "${tmpdir}"; release_lock; err_json "更新包缺少 ${bin}"; }
            cp "${src}" "${tmpdir}/${bin}.new" || { rm -rf "${tmpdir}"; err_json "暂存 ${bin} 失败"; }
            chmod 0755 "${tmpdir}/${bin}.new" 2>/dev/null || { rm -rf "${tmpdir}"; err_json "设置 ${bin} 权限失败"; }
        done

        require_lock
        core_process_records || { rm -rf "${tmpdir}"; release_lock; err_json "无法确认 core 进程，取消二进制更新"; }
        core_was_running=0
        [ "${CORE_PROCESS_COUNT}" -gt 0 ] && core_was_running=1
        kill_core || { rm -rf "${tmpdir}"; release_lock; err_json "停止 core 失败，取消二进制更新"; }
        for bin in easytier-core easytier-cli; do
            cp "${tmpdir}/${bin}.new" "${MODDIR}/${bin}.new.$$" || { rm -rf "${tmpdir}"; release_lock; err_json "复制 ${bin} 到安装目录失败"; }
            if [ -f "${MODDIR}/${bin}" ]; then
                cp -p "${MODDIR}/${bin}" "${MODDIR}/${bin}.bak.new.$$" || { rm -f "${MODDIR}/${bin}.new.$$"; rm -rf "${tmpdir}"; release_lock; err_json "备份 ${bin} 失败"; }
                mv "${MODDIR}/${bin}.bak.new.$$" "${MODDIR}/${bin}.bak" || { rm -f "${MODDIR}/${bin}.new.$$"; rm -rf "${tmpdir}"; release_lock; err_json "保存 ${bin} 备份失败"; }
            fi
            chmod 0755 "${MODDIR}/${bin}.new.$$" 2>/dev/null || { rm -rf "${tmpdir}"; release_lock; err_json "设置 ${bin} 权限失败"; }
            mv "${MODDIR}/${bin}.new.$$" "${MODDIR}/${bin}" || { rm -rf "${tmpdir}"; release_lock; err_json "替换 ${bin} 失败"; }
        done
        if [ "${core_was_running}" = 1 ]; then
            rm -f "${CORE_DISABLE_FILE}"
            start_core_once >/dev/null 2>&1 || { rm -rf "${tmpdir}"; release_lock; err_json "二进制已更新，但 core 恢复启动失败"; }
        fi
        echo "${rel_tag}" > "${CONFIG_DIR}/binary_version"
        log_msg "core and cli binaries updated to ${rel_tag} from ${asset}"
        rm -rf "${tmpdir}"
        release_lock
        ok_json "Core/CLI 二进制已更新到 ${rel_tag}"
        ;;
    -h|--help|help|"")
        usage
        ;;
    *)
        usage >&2
        exit 1
        ;;
esac
