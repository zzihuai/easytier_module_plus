# EasyTier Magisk WebUI 模块

这是基于 [EasyTier/EasyTier](https://github.com/EasyTier/EasyTier) Android/Magisk 模块重构的 WebUI 版本，用于在 Magisk / KernelSU / APatch 环境中运行 EasyTier，并提供模块内控制台。

当前打包版本：`v2.6.4-webui1`

仓库内已附带可刷入 zip：

```text
dist/EasyTier-Magisk-v2.6.4-webui1.zip
```

模块安装后的默认目录：

```text
/data/adb/modules/easytier_magisk
```

## 功能特性

- 保留原模块的开机启动能力。
- 内置 EasyTier `v2.6.4` arm64/aarch64 二进制：
  - `easytier-core`
  - `easytier-cli`
  - `easytier-web`
- 新增模块 WebUI：
  - 查看模块、core、web、开机启动、热点转发状态。
  - 手动启动 / 停止 / 重启 `easytier-core`。
  - 手动启动 / 停止 / 重启 `easytier-web`。
  - 启用 / 关闭开机启动。
  - 预览和编辑 `config.toml`。
  - 预览、编辑和删除 `command_args`。
  - 查看 core/web 日志。
  - 从 EasyTier GitHub Release 检查并更新 linux-aarch64 二进制。
- 保留热点/USB 子网转发开关逻辑，可通过模块 action 或脚本控制。

## 兼容性说明

该模块 zip 可用于：

- Magisk
- KernelSU
- APatch

但需要注意：

- 模块 WebUI 依赖 KernelSU/APatch 风格的 WebUI API，即 `window.ksu.exec`。
- 在支持 WebUI 的管理器中，可以直接从模块页面打开 WebUI 控制台。
- Magisk 官方管理器通常不提供模块 WebUI API，因此 WebUI 可能无法直接使用；这种情况下可以通过 root 终端执行 `control.sh` 完成相同操作。

## 安装

1. 将仓库内的以下 zip 复制到手机：

   ```text
   dist/EasyTier-Magisk-v2.6.4-webui1.zip
   ```

2. 在 Magisk / KernelSU / APatch 中刷入该模块。
3. 重启设备。
4. 首次安装默认启用开机启动。

## WebUI 使用

在支持模块 WebUI 的管理器中打开 `EasyTier_Magisk_WebUI` 模块页面，然后进入 WebUI。

WebUI 包含以下区域：

- 运行状态
- Core 控制
- `config.toml` 预览 / 编辑
- `command_args` 启动参数编辑
- EasyTier 二进制更新
- 日志查看

保存配置后不会自动重启 core。如需让配置立即生效，请点击 WebUI 中的“重启 core”。

## 配置文件

默认配置文件路径：

```text
/data/adb/modules/easytier_magisk/config/config.toml
```

默认启动方式是配置文件模式：

```sh
/data/adb/modules/easytier_magisk/easytier-core -c /data/adb/modules/easytier_magisk/config/config.toml
```

如果配置文件中没有设置 `hostname`，模块会自动使用 Android 设备品牌和型号生成 hostname。

## command_args 启动参数模式

如果以下文件存在：

```text
/data/adb/modules/easytier_magisk/config/command_args
```

模块会优先使用 `command_args`，并忽略 `config.toml`。

示例：

```text
--network-name my-network --network-secret my-secret -p tcp://example.com:11010
```

注意：

- `command_args` 中不要写复杂 shell 引号。
- 删除 `command_args` 后，下次启动会恢复使用 `config.toml`。
- WebUI 中提供“删除”按钮，可直接删除 `command_args`。

## 命令行控制

如果无法使用 WebUI，可以通过 root 终端执行：

```sh
su
/data/adb/modules/easytier_magisk/control.sh status
```

常用命令：

```sh
# 查看状态
/data/adb/modules/easytier_magisk/control.sh status

# 启动 / 停止 / 重启 core
/data/adb/modules/easytier_magisk/control.sh start-core
/data/adb/modules/easytier_magisk/control.sh stop-core
/data/adb/modules/easytier_magisk/control.sh restart-core

# 启动 / 停止 / 重启 web
/data/adb/modules/easytier_magisk/control.sh start-web
/data/adb/modules/easytier_magisk/control.sh stop-web
/data/adb/modules/easytier_magisk/control.sh restart-web

# 启用 / 关闭开机启动
/data/adb/modules/easytier_magisk/control.sh enable-boot
/data/adb/modules/easytier_magisk/control.sh disable-boot

# 读取配置
/data/adb/modules/easytier_magisk/control.sh read-config

# 写入配置
cat /sdcard/config.toml | /data/adb/modules/easytier_magisk/control.sh write-config

# 读取 / 写入 / 删除 command_args
/data/adb/modules/easytier_magisk/control.sh read-command-args
echo '--network-name my-network --network-secret my-secret' | /data/adb/modules/easytier_magisk/control.sh write-command-args
/data/adb/modules/easytier_magisk/control.sh remove-command-args

# 查看日志
/data/adb/modules/easytier_magisk/control.sh logs core
/data/adb/modules/easytier_magisk/control.sh logs web

# 检查最新 Release
/data/adb/modules/easytier_magisk/control.sh latest

# 更新到最新 linux-aarch64 二进制
/data/adb/modules/easytier_magisk/control.sh update-binary latest

# 更新到指定 tag
/data/adb/modules/easytier_magisk/control.sh update-binary v2.6.4
```

## easytier-web Dashboard

模块会尝试启动 EasyTier 官方 `easytier-web`。

默认监听：

```text
0.0.0.0:11211
```

访问地址：

```text
http://设备IP:11211/
```

默认 config server：

```text
udp://0.0.0.0:22020
```

可通过以下文件覆盖端口：

```text
/data/adb/modules/easytier_magisk/config/web_port
/data/adb/modules/easytier_magisk/config/config_server_port
/data/adb/modules/easytier_magisk/config/config_server_protocol
```

## 日志

core 日志：

```text
/data/adb/modules/easytier_magisk/log.log
```

web 日志：

```text
/data/adb/modules/easytier_magisk/web.log
```

WebUI 中也可以直接查看最近日志。

## 二进制更新机制

WebUI 或 `control.sh update-binary` 会从 EasyTier GitHub Release 中查找：

```text
easytier-linux-aarch64-*.zip
```

更新内容包括：

- `easytier-core`
- `easytier-cli`
- `easytier-web`

更新流程：

1. 查询 GitHub Release。
2. 下载 linux-aarch64 zip。
3. 解压并检查三个二进制是否存在。
4. 备份旧二进制为 `.bak`。
5. 替换新二进制并设置 0755 权限。
6. 如果更新前 core/web 正在运行，更新后会尝试重新启动。

## 开机启动逻辑

首次安装后模块会创建：

```text
/data/adb/modules/easytier_magisk/start_on_boot
```

存在该文件时，开机后会自动启动：

- `easytier_core.sh`
- `easytier_web.sh`

关闭开机启动时会删除 `start_on_boot`，并停止 core/web。

## 热点 / USB 子网转发

模块保留原有热点/USB 子网转发逻辑：

```text
/data/adb/modules/easytier_magisk/hotspot_iprule.sh
```

可通过模块 action 切换转发开关。开启后会创建：

```text
/data/adb/modules/easytier_magisk/enable_IP_rule
```

## 目录结构

```text
module/
├── META-INF/com/google/android/update-binary
├── META-INF/com/google/android/updater-script
├── README.md
├── action.sh
├── common.sh
├── config/
│   ├── command_args_sample
│   └── config.toml
├── control.sh
├── customize.sh
├── easytier-cli
├── easytier-core
├── easytier-web
├── easytier_core.sh
├── easytier_web.sh
├── hotspot_iprule.sh
├── module.prop
├── service.sh
├── system/etc/resolv.conf
├── uninstall.sh
└── webroot/
    ├── app.js
    ├── index.html
    ├── kernelsu.js
    └── style.css
```

## 构建与验证记录

本地已完成以下验证：

- zip 完整性测试：通过。
- 必需文件存在性检查：通过。
- shell 脚本语法检查：通过。
- WebUI 引用检查：通过。
- `control.sh status` 冒烟测试：通过。
- `control.sh latest` GitHub Release 查询：通过。
- 二进制架构检查：通过。

## 注意事项

- 该模块使用官方 Release 中的 arm64/aarch64 二进制，不是在本机重新交叉编译得到的二进制。
- 本机源码交叉编译时缺少 `aarch64-linux-musl-gcc`，因此最终采用官方 Release 资产，符合“以仓库 release，arm64 为准”的要求。
- 更新二进制需要手机可以访问 GitHub，并且系统中存在 `curl` 或 `wget`。
- 修改配置后建议手动重启 core。
- 如果 core 启动失败，优先查看 `log.log`。
- 如果 web 启动失败，优先查看 `web.log`。
