import { exec, enableEdgeToEdge } from './kernelsu.js';

const MODDIR = '/data/adb/modules/easytier_magisk';
const CONTROL = `${MODDIR}/control.sh`;
const $ = (id) => document.getElementById(id);

const el = {
  refreshBtn: $('refreshBtn'),
  moduleEnabled: $('moduleEnabled'),
  coreState: $('coreState'),
  configState: $('configState'),
  configFeedback: $('configFeedback'),
  bootState: $('bootState'),
  ipRuleState: $('ipRuleState'),
  versionInfo: $('versionInfo'),
  configEditor: $('configEditor'),
  argsEditor: $('argsEditor'),
  loadConfigBtn: $('loadConfigBtn'),
  saveConfigBtn: $('saveConfigBtn'),
  loadArgsBtn: $('loadArgsBtn'),
  saveArgsBtn: $('saveArgsBtn'),
  removeArgsBtn: $('removeArgsBtn'),
  tagInput: $('tagInput'),
  checkUpdateBtn: $('checkUpdateBtn'),
  updateBinaryBtn: $('updateBinaryBtn'),
  updateInfo: $('updateInfo'),
  actionStatus: $('actionStatus'),
  coreLogBtn: $('coreLogBtn'),
  logBox: $('logBox'),
  editConfigBtn: $('editConfigBtn'),
};

try { enableEdgeToEdge?.(true); } catch (_) {}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function run(command, options = {}) {
  if (!window.ksu) {
    throw new Error('当前模块前端未提供 root 命令接口，请从 KernelSU/APatch 模块页面打开。');
  }
  const res = await exec(command, options);
  if (Number(res.errno) !== 0) {
    throw new Error(res.stderr || res.stdout || `命令失败：${command}`);
  }
  return res.stdout || '';
}

async function runControl(args, input, timeoutOptions = {}) {
  if (typeof input === 'string') {
    return run(`printf %s ${shellQuote(input)} | ${shellQuote(CONTROL)} ${args}`, timeoutOptions);
  }
  return run(`${shellQuote(CONTROL)} ${args}`, timeoutOptions);
}

function setBool(node, enabled, onText = '开启', offText = '关闭') {
  node.textContent = enabled ? onText : offText;
  node.classList.toggle('status-on', !!enabled);
  node.classList.toggle('status-off', !enabled);
}

let statusRequest = null;
let configurationDirty = false;
let commandArgumentsDirty = false;
let latestStatus = null;
let displayedCoreVersion = '-';

function updateConfigurationStatus(configState, commandArgsState) {
  const configLabels = { missing: '配置文件不存在', empty: '配置文件为空', present: '配置已就绪' };
  const configStateText = commandArgsState === 'present'
    ? '启动参数已就绪（优先使用）'
    : commandArgsState === 'empty'
      ? '启动参数为空，无法启动'
      : configLabels[configState] || '配置状态未知';
  const hasValidLaunchInput = commandArgsState === 'present' || configState === 'present';
  el.configState.textContent = configStateText;
  el.configState.classList.toggle('status-off', !hasValidLaunchInput);
  el.configState.classList.toggle('status-on', hasValidLaunchInput);
}

function renderVersionInfo(status) {
  el.versionInfo.textContent = [
    `模块版本: ${status.module_version || '-'}`,
    `Core: ${displayedCoreVersion}`,
    `配置: ${status.config_path}`,
    `启动参数: ${status.command_args_path}`,
  ].join('\n');
}

function refreshStatus() {
  if (statusRequest) return statusRequest;
  statusRequest = runControl('status').then((out) => {
    const status = JSON.parse(out);
    latestStatus = status;
    setBool(el.moduleEnabled, status.module_enabled, '启用', '管理器禁用');
    if (status.core_discovery_error) {
      setBool(el.coreState, false, '进程状态不可确认', '进程状态不可确认');
    } else if (status.core_count > 1) {
      setBool(el.coreState, true, `检测到 ${status.core_count} 个实例`, `检测到 ${status.core_count} 个实例`);
    } else {
      setBool(el.coreState, status.core_running, '运行中', '已停止');
    }
    updateConfigurationStatus(status.config_state, status.command_args_state);
    setBool(el.bootState, status.start_on_boot, '已启用', '已关闭');
    setBool(el.ipRuleState, status.ip_rule_enabled, '已激活', '已禁用');
    renderVersionInfo(status);
    return status;
  }).finally(() => {
    statusRequest = null;
  });
  return statusRequest;
}

async function refreshCoreVersion() {
  const result = JSON.parse(await runControl('core-version'));
  displayedCoreVersion = result.core_version || '-';
  if (latestStatus) renderVersionInfo(latestStatus);
}

async function safeAction(label, fn, options = {}) {
  const busyButtons = options.busyButtons || [];
  busyButtons.forEach((button) => { button.disabled = true; });
  el.actionStatus.textContent = `${label}...`;
  el.actionStatus.classList.remove('status-error');
  try {
    const result = await fn();
    el.actionStatus.textContent = result || `${label}完成`;
    if (options.refreshStatus) {
      try {
        await refreshStatus();
      } catch (error) {
        el.actionStatus.textContent = `${result || `${label}完成`}；状态刷新失败：${error?.message || String(error)}`;
        el.actionStatus.classList.add('status-error');
      }
    }
    return result;
  } catch (error) {
    const message = error?.message || String(error);
    el.actionStatus.textContent = `${label}失败：${message}`;
    el.actionStatus.classList.add('status-error');
    if (options.refreshStatus) {
      try {
        await refreshStatus();
      } catch (refreshError) {
        el.actionStatus.textContent += `；状态同步失败：${refreshError?.message || String(refreshError)}`;
      }
    }
    return null;
  } finally {
    busyButtons.forEach((button) => { button.disabled = false; });
  }
}

function renderConfigurationFeedback(message, isError = false) {
  el.configFeedback.textContent = message;
  el.configFeedback.classList.toggle('status-error', isError);
  el.configFeedback.classList.toggle('status-on', !isError);
}

function bindAction(button, label, action, options = {}) {
  button.addEventListener('click', () => {
    safeAction(label, action, { ...options, busyButtons: options.busyButtons || [button] });
  });
}

async function loadConfig() {
  try {
    const loadedConfig = await runControl('read-config');
    if (configurationDirty) {
      renderConfigurationFeedback('保留当前未保存的编辑内容；如需覆盖，请先复制或保存草稿');
      return;
    }
    el.configEditor.value = loadedConfig;
    el.configEditor.placeholder = loadedConfig.trim() ? '' : '配置不存在或为空，请填写并保存配置';
    renderConfigurationFeedback(loadedConfig.trim() ? '配置已读取' : '配置文件为空，可直接点击编辑框输入');
  } catch (error) {
    renderConfigurationFeedback(`读取配置失败：${error?.message || String(error)}`, true);
    throw error;
  }
}

async function saveConfig() {
  const configSnapshot = el.configEditor.value;
  const result = JSON.parse(await runControl('write-config', configSnapshot));
  configurationDirty = el.configEditor.value !== configSnapshot;
  renderConfigurationFeedback(configurationDirty ? '已保存点击时的内容；当前编辑框还有未保存修改' : result.message);
  if (latestStatus) {
    latestStatus.config_state = configSnapshot.trim() ? 'present' : 'empty';
    updateConfigurationStatus(latestStatus.config_state, latestStatus.command_args_state);
  }
  return result.message;
}

async function loadArgs() {
  const loadedArguments = await runControl('read-command-args');
  if (commandArgumentsDirty) return;
  el.argsEditor.value = loadedArguments;
}

async function saveArgs() {
  const argumentsSnapshot = el.argsEditor.value;
  const result = JSON.parse(await runControl('write-command-args', argumentsSnapshot));
  commandArgumentsDirty = el.argsEditor.value !== argumentsSnapshot;
  if (latestStatus) {
    latestStatus.command_args_state = argumentsSnapshot.trim() ? 'present' : 'empty';
    updateConfigurationStatus(latestStatus.config_state, latestStatus.command_args_state);
  }
  return result.message;
}

async function removeArgs() {
  const result = JSON.parse(await runControl('remove-command-args'));
  el.argsEditor.value = '';
  commandArgumentsDirty = false;
  if (latestStatus) {
    latestStatus.command_args_state = 'missing';
    updateConfigurationStatus(latestStatus.config_state, latestStatus.command_args_state);
  }
  return result.message;
}

async function loadLog() {
  el.logBox.textContent = await runControl('logs');
}

async function checkLatest() {
  const info = JSON.parse(await runControl('latest'));
  el.updateInfo.textContent = JSON.stringify(info, null, 2);
}

async function updateBinary() {
  const tag = (el.tagInput.value || 'latest').trim();
  const output = await runControl(`update-binary ${shellQuote(tag)}`, undefined, { timeoutMs: 300000 });
  const result = JSON.parse(output);
  await refreshCoreVersion();
  return result.message;
}

const lifecycleButtons = Array.from(document.querySelectorAll('[data-cmd]'));
el.configEditor.addEventListener('input', () => {
  configurationDirty = true;
  renderConfigurationFeedback('有未保存的配置修改');
});
el.argsEditor.addEventListener('input', () => { commandArgumentsDirty = true; });
el.configEditor.addEventListener('focus', () => { el.configEditor.setAttribute('aria-label', '正在编辑 EasyTier 配置'); });
el.editConfigBtn.addEventListener('click', () => {
  el.configEditor.focus();
});

bindAction(el.refreshBtn, '刷新状态', refreshStatus, { refreshStatus: false });
lifecycleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    safeAction(button.textContent, async () => {
      const output = await runControl(button.dataset.cmd);
      return JSON.parse(output).message;
    }, { busyButtons: lifecycleButtons, refreshStatus: true });
  });
});
bindAction(el.loadConfigBtn, '读取配置', loadConfig);
bindAction(el.saveConfigBtn, '保存配置', saveConfig);
bindAction(el.loadArgsBtn, '读取启动参数', loadArgs);
bindAction(el.saveArgsBtn, '保存启动参数', saveArgs);
bindAction(el.removeArgsBtn, '删除启动参数', removeArgs);
bindAction(el.coreLogBtn, '读取 Core 日志', loadLog);
bindAction(el.checkUpdateBtn, '检查最新版本', checkLatest);
bindAction(el.updateBinaryBtn, '更新二进制', updateBinary, { refreshStatus: true });

(async function initialize() {
  const results = await Promise.allSettled([
    refreshStatus(),
    refreshCoreVersion(),
    loadConfig(),
    loadArgs(),
    loadLog(),
  ]);
  const failedResults = results.filter((result) => result.status === 'rejected');
  if (failedResults.length) {
    el.actionStatus.textContent = failedResults.map((result) => result.reason?.message || String(result.reason)).join('；');
    el.actionStatus.classList.add('status-error');
  }
})();
