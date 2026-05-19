SKIPMOUNT=false
PROPFILE=true
POSTFSDATA=true
LATESTARTSERVICE=true

set_perm_recursive $MODPATH 0 0 0755 0644
set_perm_recursive $MODPATH/webroot 0 0 0755 0644
set_perm $MODPATH/easytier-core 0 0 0755
set_perm $MODPATH/easytier-cli 0 0 0755
set_perm $MODPATH/easytier-web 0 0 0755
set_perm $MODPATH/*.sh 0 0 0755

[ -e "$MODPATH/start_on_boot" ] || touch "$MODPATH/start_on_boot"

ui_print "系统架构为：$ARCH"
ui_print "系统 SDK 版本：$API"
ui_print "EasyTier 安装位置：/data/adb/modules/easytier_magisk"
ui_print "配置文件位置：/data/adb/modules/easytier_magisk/config/config.toml"
ui_print "WebUI 入口：KernelSU/APatch 模块页，或 easytier-web http://设备IP:11211/"
ui_print "新增功能：WebUI 手动启动/停止 core、配置预览/编辑、arm64 二进制在线更新"
ui_print "保留功能：默认开机启动；可在 WebUI 中关闭/开启"
ui_print "如需使用启动参数模式，请将 config/command_args_sample 重命名为 command_args，并修改其中的内容"
ui_print "config 目录中存在 command_args 文件时，模块会自动忽略 config.toml 文件"
ui_print "----------------------------------"
ui_print "注意！启动参数文件中不能存在 \" 和 '，配置文件则没有这个限制"
ui_print "----------------------------------"
ui_print "模块安装完成，重启设备生效"