import { exec, toast as ksuToast, enableEdgeToEdge } from './kernelsu.js';

const MODDIR = '/data/adb/modules/easytier_magisk';
const CONTROL = `${MODDIR}/control.sh`;
const $ = (id) => document.getElementById(id);

const el = {
  refreshBtn: $('refreshBtn'),
  moduleEnabled: $('moduleEnabled'),
  coreState: $('coreState'),
  webState: $('webState'),
  bootState: $('bootState'),
  ipRuleState: $('ipRuleState'),
  versionInfo: $('versionInfo'),
  dashboardLink: $('dashboardLink'),
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
  coreLogBtn: $('coreLogBtn'),
  webLogBtn: $('webLogBtn'),
  logBox: $('logBox'),
  toast: $('toast'),
};

try { enableEdgeToEdge?.(true); } catch (_) {}

function showToast(message) {
  try { ksuToast?.(message); } catch (_) {}
  el.toast.textContent = message;
  el.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.remove('show'), 2600);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function run(command, options = {}) {
  if (!window.ksu) {
    throw new Error('当前 WebView 未提供 KernelSU/APatch WebUI API，无法执行 root 命令。请在支持 WebUI 的管理器中打开。');
  }
  const res = await exec(command, options);
  if (res.errno !== 0) {
    throw new Error(res.stderr || res.stdout || `命令失败：${command}`);
  }
  return res.stdout || '';
}

async function runControl(args, input) {
  if (typeof input === 'string') {
    return run(`printf %s ${shellQuote(input)} | ${shellQuote(CONTROL)} ${args}`);
  }
  return run(`${shellQuote(CONTROL)} ${args}`);
}

function setBool(node, enabled, onText = '开启', offText = '关闭') {
  node.textContent = enabled ? onText : offText;
  node.classList.toggle('status-on', !!enabled);
  node.classList.toggle('status-off', !enabled);
}

async function refreshStatus() {
  const out = await runControl('status');
  const s = JSON.parse(out);
  setBool(el.moduleEnabled, s.module_enabled, '启用', '管理器禁用');
  setBool(el.coreState, s.core_running, '运行中', '已停止');
  setBool(el.webState, s.web_running, '运行中', '已停止');
  setBool(el.bootState, s.start_on_boot, '已启用', '已关闭');
  setBool(el.ipRuleState, s.ip_rule_enabled, '已激活', '已禁用');
  el.versionInfo.textContent = [
    `模块版本: ${s.module_version || '-'}`,
    `Core: ${s.core_version || '-'}`,
    `Web: ${s.web_version || '-'}`,
    `配置: ${s.config_path}`,
    `启动参数: ${s.command_args_path}`,
  ].join('\n');
  el.dashboardLink.href = s.web_url || '#';
  el.dashboardLink.textContent = `打开 EasyTier 官方 Dashboard (${s.web_url || '未启动'})`;
}

async function safeAction(label, fn) {
  const buttons = Array.from(document.querySelectorAll('button'));
  buttons.forEach((b) => (b.disabled = true));
  try {
    showToast(`${label}...`);
    const result = await fn();
    if (result) showToast(result);
    await refreshStatus();
  } catch (err) {
    const msg = err?.message || String(err);
    showToast(msg);
    el.updateInfo.textContent = msg;
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function loadConfig() {
  el.configEditor.value = await runControl('read-config');
}

async function saveConfig() {
  const out = await runControl('write-config', el.configEditor.value);
  return JSON.parse(out).message;
}

async function loadArgs() {
  el.argsEditor.value = await runControl('read-command-args');
}

async function saveArgs() {
  const out = await runControl('write-command-args', el.argsEditor.value);
  return JSON.parse(out).message;
}

async function removeArgs() {
  const out = await runControl('remove-command-args');
  el.argsEditor.value = '';
  return JSON.parse(out).message;
}

async function loadLog(kind) {
  el.logBox.textContent = await runControl(`logs ${kind}`);
}

async function checkLatest() {
  const out = await runControl('latest');
  const info = JSON.parse(out);
  el.updateInfo.textContent = JSON.stringify(info, null, 2);
}

async function updateBinary() {
  const tag = (el.tagInput.value || 'latest').trim();
  const out = await runControl(`update-binary ${shellQuote(tag)}`);
  el.updateInfo.textContent = out;
  return JSON.parse(out).message;
}

el.refreshBtn.addEventListener('click', () => safeAction('刷新状态', refreshStatus));
document.querySelectorAll('[data-cmd]').forEach((btn) => {
  btn.addEventListener('click', () => safeAction(btn.textContent, async () => {
    const out = await runControl(btn.dataset.cmd);
    return JSON.parse(out).message;
  }));
});
el.loadConfigBtn.addEventListener('click', () => safeAction('读取配置', loadConfig));
el.saveConfigBtn.addEventListener('click', () => safeAction('保存配置', saveConfig));
el.loadArgsBtn.addEventListener('click', () => safeAction('读取启动参数', loadArgs));
el.saveArgsBtn.addEventListener('click', () => safeAction('保存启动参数', saveArgs));
el.removeArgsBtn.addEventListener('click', () => safeAction('删除启动参数', removeArgs));
el.coreLogBtn.addEventListener('click', () => safeAction('读取 core 日志', () => loadLog('core')));
el.webLogBtn.addEventListener('click', () => safeAction('读取 web 日志', () => loadLog('web')));
el.checkUpdateBtn.addEventListener('click', () => safeAction('检查更新', checkLatest));
el.updateBinaryBtn.addEventListener('click', () => safeAction('更新二进制', updateBinary));

(async function init() {
  try {
    await refreshStatus();
    await Promise.allSettled([loadConfig(), loadArgs(), loadLog('core')]);
  } catch (err) {
    showToast(err?.message || String(err));
  }
})();
