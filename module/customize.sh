SKIPMOUNT=false
PROPFILE=true
POSTFSDATA=true
LATESTARTSERVICE=true

set_perm_recursive $MODPATH 0 0 0755 0644
set_perm_recursive $MODPATH/webroot 0 0 0755 0644
set_perm $MODPATH/easytier-core 0 0 0755
set_perm $MODPATH/easytier-cli 0 0 0755
set_perm $MODPATH/*.sh 0 0 0755

ACTIVE_MODDIR=${ACTIVE_MODDIR:-/data/adb/modules/easytier_magisk}
if [ -d "$ACTIVE_MODDIR" ] && [ "$ACTIVE_MODDIR" != "$MODPATH" ]; then
    if [ -e "$ACTIVE_MODDIR/start_on_boot" ]; then
        touch "$MODPATH/start_on_boot"
    else
        rm -f "$MODPATH/start_on_boot"
    fi
else
    [ -e "$MODPATH/start_on_boot" ] || touch "$MODPATH/start_on_boot"
fi

for OLD_MODDIR in "$ACTIVE_MODDIR" "$MODPATH"; do
    [ -d "$OLD_MODDIR" ] || continue
    pkill -f "$OLD_MODDIR/easytier_web.sh" >/dev/null 2>&1 || true
    sleep 1
    pkill -f "$OLD_MODDIR/easytier-web" >/dev/null 2>&1 || true
    rm -f "$OLD_MODDIR/easytier-web" "$OLD_MODDIR/easytier-web.bak" \
        "$OLD_MODDIR/easytier-web.new" "$OLD_MODDIR/easytier_web.sh" \
        "$OLD_MODDIR/easytier_web.sh.bak" "$OLD_MODDIR/easytier_web.sh.new" \
        "$OLD_MODDIR/disable_web" "$OLD_MODDIR/run/easytier-web.pid" \
        "$OLD_MODDIR/web.log" "$OLD_MODDIR/config/web_port" \
        "$OLD_MODDIR/config/config_server_port" \
        "$OLD_MODDIR/config/config_server_protocol"
    if [ -L "$OLD_MODDIR/config/web" ]; then
        rm -f "$OLD_MODDIR/config/web"
    elif [ -d "$OLD_MODDIR/config/web" ]; then
        rm -rf "$OLD_MODDIR/config/web"
    fi
done

ui_print "系统架构为：$ARCH"
ui_print "系统 SDK 版本：$API"
ui_print "EasyTier 安装位置：/data/adb/modules/easytier_magisk"
ui_print "配置文件位置：/data/adb/modules/easytier_magisk/config/config.toml"
ui_print "模块前端入口：KernelSU/APatch 模块页面"
ui_print "功能：手动启动/停止 core、配置预览/编辑、arm64 二进制在线更新"
ui_print "保留开机启动设置；可在模块前端中关闭/开启"
ui_print "如需使用启动参数模式，请将 config/command_args_sample 重命名为 command_args，并修改其中的内容"
ui_print "config 目录中存在 command_args 文件时，模块会自动忽略 config.toml 文件"
ui_print "----------------------------------"
ui_print "注意！启动参数文件中不能存在 \" 和 '，配置文件则没有这个限制"
ui_print "----------------------------------"
ui_print "模块安装完成，重启设备生效"
