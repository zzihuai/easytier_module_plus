# EasyTier Magisk 模块

这是基于 [EasyTier/EasyTier](https://github.com/EasyTier/EasyTier) 的 Android 模块，用于在 Magisk / KernelSU / APatch 环境中运行 EasyTier，并通过管理器模块前端提供控制台。

当前打包版本：`v2.6.4-module-ui4`

仓库内已附带可刷入 zip：

```text
dist/EasyTier-Magisk-v2.6.4-module-ui4.zip
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
- 管理器模块前端：
  - 查看模块、core、配置、开机启动、热点转发状态。
  - 手动启动 / 停止 / 重启 `easytier-core`。
  - 启用 / 关闭开机启动。
  - 预览和编辑 `config.toml`。
  - 预览、编辑和删除 `command_args`。
  - 查看 core 日志。
  - 从 EasyTier GitHub Release 检查并更新 linux-aarch64 二进制。
- 保留热点/USB 子网转发开关逻辑，可通过模块 action 或脚本控制。

## 兼容性说明

该模块 zip 可用于：

- Magisk
- KernelSU
- APatch

但需要注意：

- 模块前端依赖 KernelSU/APatch 管理器提供的 `window.ksu.exec`。
- 也可以通过 root 终端执行 `control.sh` 完成控制。

## 安装

1. 将仓库内的以下 zip 复制到手机：

   ```text
   dist/EasyTier-Magisk-v2.6.4-module-ui4.zip
   ```

2. 在 Magisk / KernelSU / APatch 中刷入该模块。
3. 重启设备。
4. 首次安装默认启用开机启动。

## 模块前端使用

在 KernelSU/APatch 管理器中打开 EasyTier 模块页面，然后进入模块前端。

模块前端采用 Material You 风格，包含四个页面：

- **概览：** Core 状态、启停/重启、开机启动和热点转发状态。
- **配置：** `config.toml` 与 `command_args` 编辑、保存及删除。
- **日志：** 按需读取 Core 最近日志，不自动轮询。
- **管理：** 模块/Core 版本、配置路径、Release 更新和外观设置。

主题默认为跟随系统，也可选择浅色或深色；可用时会记住选择。页面切换不会清除未保存的编辑草稿。

保存配置后不会自动重启 core。如需让配置立即生效，请点击模块前端中的“重启 core”。

配置文件不存在、零字节或只包含空白时，前端会显示具体状态；启动 core 会被拒绝。空的 `command_args` 同样不能用于启动。

配置编辑器使用原生文本输入控件，支持空内容输入、显式聚焦和独立的读取/保存反馈。Android 键盘行为仍需在目标管理器 WebView 上实际验收。

Core 的启动、停止、重启和守护共用进程锁。正常状态查询使用登记的 PID 快速校验；启动和停止会核对模块二进制的实际进程身份，重启会清理所有已确认的重复实例。无法确认进程时不会尝试再启动一个。

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
- 模块前端中提供“删除”按钮，可直接删除 `command_args`。

## 命令行控制

也可以通过 root 终端执行：

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

# 查看 core 日志
/data/adb/modules/easytier_magisk/control.sh logs core

# 检查最新 Release
/data/adb/modules/easytier_magisk/control.sh latest

# 更新到最新 linux-aarch64 二进制
/data/adb/modules/easytier_magisk/control.sh update-binary latest

# 更新到指定 tag
/data/adb/modules/easytier_magisk/control.sh update-binary v2.6.4
```

## 日志

core 日志：

```text
/data/adb/modules/easytier_magisk/log.log
```

模块前端可以直接查看最近 core 日志。

## 二进制更新机制

模块前端或 `control.sh update-binary` 会从 EasyTier GitHub Release 中查找：

```text
easytier-linux-aarch64-*.zip
```

更新内容包括 `easytier-core` 和 `easytier-cli`。

更新流程：

1. 查询 GitHub Release。
2. 下载 linux-aarch64 zip。
3. 解压并检查 core 与 CLI 二进制是否存在。
4. 备份旧二进制为 `.bak`。
5. 替换新二进制并设置 0755 权限。
6. 如果更新前 core 正在运行，更新后会尝试重新启动。

## 开机启动逻辑

首次安装后模块会创建：

```text
/data/adb/modules/easytier_magisk/start_on_boot
```

存在该文件时，开机后会自动启动：

- `easytier_core.sh`

关闭开机启动时会删除 `start_on_boot`，并停止 core。

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
├── easytier_core.sh
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


## 注意事项

- 该模块使用官方 Release 中的 arm64/aarch64 core 与 CLI 二进制。
- 更新二进制需要手机可以访问 GitHub，并且系统中存在 `curl` 或 `wget`。
- 修改配置后建议手动重启 core。
- 如果 core 启动失败，优先查看 `log.log`。
- 配置文件缺失或仅包含空白时，前端会明确提示，core 不会以空配置启动。
