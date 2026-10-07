import { exec, enableEdgeToEdge } from './kernelsu.js';

const MODDIR = '/data/adb/modules/easytier_magisk';
const CONTROL = `${MODDIR}/control.sh`;
const $ = (id) => document.getElementById(id);

const el = {
  refreshBtn: $('refreshBtn'),
  moduleEnabled: $('moduleEnabled'),
  coreTitle: $('coreTitle'),
  coreDetails: $('coreDetails'),
  coreActionBtn: $('coreActionBtn'),
  restartCoreBtn: $('restartCoreBtn'),
  bootSwitch: $('bootSwitch'),
  configFeedback: $('configFeedback'),
  ipRuleState: $('ipRuleState'),
  configSummary: $('configSummary'),
  configFileState: $('configFileState'),
  argsFileState: $('argsFileState'),
  configTab: $('configTab'),
  argsTab: $('argsTab'),
  configPanel: $('configPanel'),
  argsPanel: $('argsPanel'),
  modeHint: $('modeHint'),
  configFilename: $('configFilename'),
  argsFilename: $('argsFilename'),
  configEditor: $('configEditor'),
  argsEditor: $('argsEditor'),
  loadConfigBtn: $('loadConfigBtn'),
  saveConfigBtn: $('saveConfigBtn'),
  editConfigBtn: $('editConfigBtn'),
  argsFeedback: $('argsFeedback'),
  loadArgsBtn: $('loadArgsBtn'),
  saveArgsBtn: $('saveArgsBtn'),
  removeArgsBtn: $('removeArgsBtn'),
  logState: $('logState'),
  tagInput: $('tagInput'),
  checkUpdateBtn: $('checkUpdateBtn'),
  updateBinaryBtn: $('updateBinaryBtn'),
  updateInfo: $('updateInfo'),
  actionStatus: $('actionStatus'),
  coreLogBtn: $('coreLogBtn'),
  logBox: $('logBox'),
  coreVersion: $('coreVersion'),
  moduleVersion: $('moduleVersion'),
  configPath: $('configPath'),
  argsPath: $('argsPath'),
  themeSelect: $('themeSelect'),
  confirmation: $('confirmation'),
  dialogTitle: $('dialogTitle'),
  dialogMessage: $('dialogMessage'),
  cancelDialog: $('cancelDialog'),
  confirmDialog: $('confirmDialog'),
  confirmFallback: $('confirmFallback'),
  confirmFallbackTitle: $('confirmTitle'),
  confirmFallbackMessage: $('confirmMessage'),
  cancelAction: $('cancelAction'),
  confirmAction: $('confirmAction'),
  snackbar: $('snackbar'),
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

const THEME_STORAGE_KEY = 'easytier-theme';
const editorState = {
  config: { draft: null, saved: null, revision: 0, loadRequest: 0, fileState: 'unknown' },
  args: { draft: null, saved: null, revision: 0, loadRequest: 0, fileState: 'unknown' },
};
let currentEditor = 'config';
let statusRequest = null;
let latestStatus = null;
let displayedCoreVersion = '版本不可用';
let configurationMutationVersion = 0;
const configurationOverrides = { config: null, args: null };
let controlOperationInProgress = false;
let confirmationAction = null;
let confirmationReturnFocus = null;
let snackbarTimeout = null;
let themePreference = readThemePreference();
let themeMediaQuery = null;

function readThemePreference() {
  try {
    const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
    return ['system', 'light', 'dark'].includes(storedPreference) ? storedPreference : 'system';
  } catch (_) {
    return 'system';
  }
}

function applyTheme(preference, persistPreference = true) {
  themePreference = preference;
  if (preference === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.dataset.theme = preference;
  }
  el.themeSelect.value = preference;
  updateThemeColor();
  if (persistPreference) {
    try {
      if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch (_) {
      showActionStatus('主题已切换；此环境不支持保存主题偏好。');
    }
  }
}

function updateThemeColor() {
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta && typeof window.getComputedStyle === 'function') {
    themeColorMeta.content = window.getComputedStyle(document.documentElement).getPropertyValue('--page').trim();
  }
}

function showActionStatus(message, isError = false) {
  el.actionStatus.textContent = message;
  el.actionStatus.classList.toggle('status-error', isError);
}

function showSnackbar(message) {
  el.snackbar.textContent = message;
  el.snackbar.hidden = false;
  if (snackbarTimeout) window.clearTimeout(snackbarTimeout);
  snackbarTimeout = window.setTimeout(() => {
    el.snackbar.hidden = true;
  }, 3600);
}

function showPage(pageName) {
  document.querySelectorAll('[data-page]').forEach((page) => {
    page.hidden = page.dataset.page !== pageName;
  });
  document.querySelectorAll('[data-nav]').forEach((navigationButton) => {
    if (navigationButton.dataset.nav === pageName) navigationButton.setAttribute('aria-current', 'page');
    else navigationButton.removeAttribute('aria-current');
  });
  if (pageName === 'config') renderEditor(currentEditor);
}

function openConfirmation(title, message, action) {
  if (confirmationAction || controlOperationInProgress) return false;
  confirmationAction = action;
  confirmationReturnFocus = document.activeElement;
  const supportsNativeDialog = typeof el.confirmation.showModal === 'function';
  const titleElement = supportsNativeDialog ? el.dialogTitle : el.confirmFallbackTitle;
  const messageElement = supportsNativeDialog ? el.dialogMessage : el.confirmFallbackMessage;
  titleElement.textContent = title;
  messageElement.textContent = message;
  if (supportsNativeDialog) {
    el.confirmation.showModal();
    el.confirmDialog.focus();
  } else {
    el.confirmFallback.hidden = false;
    el.cancelAction.focus();
  }
  return true;
}

function closeConfirmation(shouldRunAction) {
  const action = confirmationAction;
  confirmationAction = null;
  if (el.confirmation.open) el.confirmation.close();
  el.confirmFallback.hidden = true;
  if (confirmationReturnFocus?.isConnected) confirmationReturnFocus.focus();
  confirmationReturnFocus = null;
  if (shouldRunAction && action) action();
}

function handleConfirmationKeydown(event) {
  if (event.key === 'Escape') {
    if (!confirmationAction && el.confirmFallback.hidden && !el.confirmation.open) return;
    event.preventDefault();
    closeConfirmation(false);
    return;
  }
  if (event.key !== 'Tab' || el.confirmFallback.hidden) return;
  const focusableButtons = [el.cancelAction, el.confirmAction];
  const focusedIndex = focusableButtons.indexOf(document.activeElement);
  if (event.shiftKey && focusedIndex === 0) {
    event.preventDefault();
    el.confirmAction.focus();
  } else if (!event.shiftKey && focusedIndex === focusableButtons.length - 1) {
    event.preventDefault();
    el.cancelAction.focus();
  }
}

function hasUnsavedChanges(editorName) {
  const state = editorState[editorName];
  return state.draft !== null && state.saved !== null && state.draft !== state.saved;
}

function getEditorValue(editorName) {
  return editorName === 'config' ? el.configEditor.value : el.argsEditor.value;
}

function setEditorValue(editorName, value) {
  const editor = editorName === 'config' ? el.configEditor : el.argsEditor;
  editor.value = value;
}

function getEditorFeedbackElement(editorName) {
  return editorName === 'config' ? el.configFeedback : el.argsFeedback;
}

function getEditorStateElement(editorName) {
  return editorName === 'config' ? el.configFileState : el.argsFileState;
}

function getStatusFileState(editorName) {
  const localFileState = editorState[editorName].fileState;
  if (localFileState === 'loading' || localFileState === 'error') return localFileState;
  if (!latestStatus) return editorState[editorName].fileState;
  return editorName === 'config' ? latestStatus.config_state : latestStatus.command_args_state;
}

function describeFileState(fileState) {
  const descriptions = {
    missing: '文件不存在',
    empty: '文件为空',
    present: '文件已就绪',
    loading: '正在读取',
    error: '读取失败',
    unknown: '状态未知',
  };
  return descriptions[fileState] || descriptions.unknown;
}

function renderEditor(editorName = currentEditor) {
  currentEditor = editorName;
  const isConfigEditor = editorName === 'config';
  el.configPanel.hidden = !isConfigEditor;
  el.argsPanel.hidden = isConfigEditor;
  el.configTab.setAttribute('aria-selected', String(isConfigEditor));
  el.argsTab.setAttribute('aria-selected', String(!isConfigEditor));
  el.configTab.tabIndex = isConfigEditor ? 0 : -1;
  el.argsTab.tabIndex = isConfigEditor ? -1 : 0;
  el.modeHint.textContent = isConfigEditor
    ? '保存配置不会自动重启 Core。'
    : '启动参数文件存在时优先使用，并忽略 config.toml。空参数无法启动。';

  for (const name of ['config', 'args']) {
    const state = editorState[name];
    if (state.draft !== null) setEditorValue(name, state.draft);
    renderEditorFeedback(name);
  }
}

function renderEditorFeedback(editorName, message = '', isError = false) {
  const state = editorState[editorName];
  const feedback = getEditorFeedbackElement(editorName);
  const stateLabel = getEditorStateElement(editorName);
  const fileState = getStatusFileState(editorName);
  const unsaved = hasUnsavedChanges(editorName);

  stateLabel.textContent = unsaved ? '有未保存修改' : describeFileState(fileState);
  stateLabel.classList.toggle('status-error', isError || fileState === 'empty' || fileState === 'missing');
  feedback.classList.toggle('status-error', isError);
  if (message) feedback.textContent = message;
  else if (unsaved) feedback.textContent = '有未保存的修改；切换页面或配置类型不会清除草稿。';
  else if (fileState === 'missing') feedback.textContent = editorName === 'config'
    ? '配置文件不存在，可以直接输入并保存。'
    : '启动参数文件不存在；当前将使用 config.toml。';
  else if (fileState === 'empty') feedback.textContent = editorName === 'config'
    ? '配置文件为空，可以直接输入；空配置无法启动。'
    : '启动参数文件为空；空参数无法启动。';
  else if (fileState === 'loading') feedback.textContent = '正在读取...';
  else if (fileState === 'error') feedback.textContent = '读取失败；现有编辑内容已保留。';
  else if (state.saved !== null) feedback.textContent = '内容已读取，可以直接编辑。';
  else feedback.textContent = '状态未知；可以先尝试读取。';

  if (editorName === 'config') el.configSummary.textContent = getConfigurationSummary();
}

function getConfigurationSummary() {
  if (!latestStatus) return '正在读取配置状态';
  if (latestStatus.command_args_state === 'present') return '启动参数已就绪 · 优先使用';
  if (latestStatus.command_args_state === 'empty') return '启动参数为空 · 无法启动';
  if (latestStatus.command_args_state !== 'missing') return '启动参数状态未知 · 点击查看';
  if (latestStatus.config_state === 'present') return '配置已就绪 · 点击编辑';
  if (latestStatus.config_state === 'empty') return '配置文件为空 · 点击填写';
  if (latestStatus.config_state === 'missing') return '配置文件不存在 · 点击填写';
  return '配置状态未知 · 点击查看';
}

function updateConfigurationStatus(configState, commandArgsState) {
  if (commandArgsState === 'present') return { label: '启动参数已就绪', usable: true };
  if (commandArgsState === 'empty') return { label: '启动参数为空，无法启动', usable: false };
  if (commandArgsState !== 'missing') return { label: '启动参数状态未知', usable: false };
  if (configState === 'present') return { label: '配置已就绪', usable: true };
  if (configState === 'empty') return { label: '配置文件为空，无法启动', usable: false };
  if (configState === 'missing') return { label: '配置文件不存在，无法启动', usable: false };
  return { label: '配置状态未知', usable: false };
}

function updateCoreControls(status) {
  const discoveryFailed = status.core_discovery_error === true;
  const coreCount = Number(status.core_count) || 0;
  const coreIsRunning = status.core_running === true;
  const hasCoreToClean = discoveryFailed || coreCount > 0 || coreIsRunning;

  if (discoveryFailed) {
    el.coreTitle.textContent = '进程状态不可确认';
    el.coreDetails.textContent = '拒绝启动新实例；可尝试停止清理后刷新状态。';
    el.coreActionBtn.querySelector('span').textContent = '停止 / 清理';
  } else if (coreCount > 1) {
    el.coreTitle.textContent = `检测到 ${coreCount} 个 Core 实例`;
    el.coreDetails.textContent = '存在重复进程；停止或重启可清理已确认的模块实例。';
    el.coreActionBtn.querySelector('span').textContent = '清理重复实例';
  } else if (coreIsRunning) {
    el.coreTitle.textContent = '正在运行';
    el.coreDetails.textContent = status.command_args_state === 'present'
      ? '启动参数模式 · Core 进程已确认'
      : '配置文件模式 · Core 进程已确认';
    el.coreActionBtn.querySelector('span').textContent = '停止 Core';
  } else {
    el.coreTitle.textContent = 'Core 已停止';
    el.coreDetails.textContent = '准备好后，可以启动 Core。';
    el.coreActionBtn.querySelector('span').textContent = '启动 Core';
  }

  el.moduleEnabled.textContent = status.module_enabled ? '模块已启用' : '模块已禁用';
  const launchInput = updateConfigurationStatus(status.config_state, status.command_args_state);
  el.coreDetails.dataset.launchInputUsable = String(launchInput.usable);
  el.coreActionBtn.disabled = controlOperationInProgress || (!hasCoreToClean && !launchInput.usable);
  el.restartCoreBtn.disabled = controlOperationInProgress || !hasCoreToClean;
  el.bootSwitch.disabled = controlOperationInProgress;
  el.bootSwitch.setAttribute('aria-checked', String(status.start_on_boot === true));
  el.ipRuleState.textContent = status.ip_rule_enabled ? '已激活' : '已禁用';
}

function renderManagementInfo(status) {
  el.moduleVersion.textContent = status.module_version || '未知';
  el.coreVersion.textContent = displayedCoreVersion;
  el.configPath.textContent = status.config_path || '不可用';
  el.argsPath.textContent = status.command_args_path || '不可用';
}

function refreshStatus() {
  if (statusRequest) return statusRequest;
  const requestMutationVersion = configurationMutationVersion;
  statusRequest = runControl('status').then((output) => {
    const status = JSON.parse(output);
    if (requestMutationVersion !== configurationMutationVersion) {
      status.config_state = configurationOverrides.config ?? latestStatus?.config_state ?? status.config_state;
      status.command_args_state = configurationOverrides.args ?? latestStatus?.command_args_state ?? status.command_args_state;
    }
    latestStatus = status;
    updateCoreControls(status);
    renderManagementInfo(status);
    renderEditorFeedback('config');
    renderEditorFeedback('args');
    return status;
  }).catch((error) => {
    if (!latestStatus) {
      latestStatus = {
        module_enabled: true,
        core_running: false,
        core_count: 0,
        core_discovery_error: true,
        start_on_boot: false,
        ip_rule_enabled: false,
        config_state: 'unknown',
        command_args_state: 'unknown',
      };
      updateCoreControls(latestStatus);
    }
    throw error;
  }).finally(() => {
    statusRequest = null;
  });
  return statusRequest;
}

async function refreshCoreVersion() {
  const result = JSON.parse(await runControl('core-version'));
  displayedCoreVersion = result.core_version || '版本不可用';
  el.coreVersion.textContent = displayedCoreVersion;
}

function setControlBusy(isBusy) {
  controlOperationInProgress = isBusy;
  el.updateBinaryBtn.disabled = isBusy;
  el.checkUpdateBtn.disabled = isBusy;
  if (latestStatus) updateCoreControls(latestStatus);
}

async function safeAction(label, action, options = {}) {
  if (options.exclusiveControl && controlOperationInProgress) {
    showSnackbar('另一项 Core 管理操作正在执行，请稍候。');
    return null;
  }
  if (options.exclusiveControl) setControlBusy(true);
  const busyButtons = options.busyButtons || [];
  busyButtons.forEach((button) => { button.disabled = true; });
  showActionStatus(`${label}...`);
  try {
    const result = await action();
    const resultMessage = typeof result === 'string' && result ? result : `${label}已完成`;
    showActionStatus(resultMessage);
    if (options.refreshStatus) {
      try {
        await refreshStatus();
      } catch (error) {
        showActionStatus(`${resultMessage}；状态刷新失败：${error?.message || String(error)}`, true);
      }
    }
    return result;
  } catch (error) {
    showActionStatus(`${label}失败：${error?.message || String(error)}`, true);
    if (options.refreshStatus) {
      try {
        await refreshStatus();
      } catch (refreshError) {
        showActionStatus(`${el.actionStatus.textContent}；状态同步失败：${refreshError?.message || String(refreshError)}`, true);
      }
    }
    return null;
  } finally {
    busyButtons.forEach((button) => { button.disabled = false; });
    if (options.exclusiveControl) setControlBusy(false);
  }
}

function readControlMessage(output) {
  const result = JSON.parse(output);
  if (result.ok === false) throw new Error(result.message || '控制操作失败');
  return result.message || '操作已完成';
}

function applyLocalConfigurationState(editorName, fileState) {
  configurationMutationVersion += 1;
  configurationOverrides[editorName] = fileState;
  if (latestStatus) {
    if (editorName === 'config') latestStatus.config_state = fileState;
    else latestStatus.command_args_state = fileState;
    updateCoreControls(latestStatus);
  }
  renderEditorFeedback(editorName);
  renderEditorFeedback('config');
}

function initializeEditorInput(editorName) {
  const state = editorState[editorName];
  const textArea = editorName === 'config' ? el.configEditor : el.argsEditor;
  state.draft = textArea.value;
  state.revision += 1;
  renderEditorFeedback(editorName);
}

async function loadEditor(editorName) {
  const state = editorState[editorName];
  const requestNumber = ++state.loadRequest;
  const revisionAtRequest = state.revision;
  state.fileState = 'loading';
  renderEditorFeedback(editorName, '正在读取...');
  try {
    const commandName = editorName === 'config' ? 'read-config' : 'read-command-args';
    const loadedContent = await runControl(commandName);
    if (requestNumber !== state.loadRequest) return null;
    state.saved = loadedContent;
    if (revisionAtRequest === state.revision) {
      state.draft = loadedContent;
      setEditorValue(editorName, loadedContent);
    }
    state.fileState = editorName === 'config'
      ? (latestStatus?.config_state || (loadedContent.trim() ? 'present' : 'empty'))
      : (latestStatus?.command_args_state || (loadedContent.trim() ? 'present' : 'missing'));
    renderEditorFeedback(editorName, revisionAtRequest === state.revision
      ? ''
      : '读取期间有新的输入；保留了当前草稿。');
    return loadedContent;
  } catch (error) {
    if (requestNumber === state.loadRequest) {
      state.fileState = 'error';
      renderEditorFeedback(editorName, `读取失败；已保留现有内容：${error?.message || String(error)}`, true);
    }
    throw error;
  }
}

function requestEditorReload(editorName) {
  const editorLabel = editorName === 'config' ? '配置' : '启动参数';
  const performReload = () => safeAction('重新读取', async () => {
    await loadEditor(editorName);
    return `${editorLabel}已重新读取`;
  });
  if (hasUnsavedChanges(editorName)) {
    openConfirmation('放弃未保存的修改？', '重新读取会用上次保存的内容替换当前草稿。', performReload);
  } else {
    performReload();
  }
}

async function saveEditor(editorName) {
  const state = editorState[editorName];
  const snapshot = getEditorValue(editorName);
  const revisionAtSave = state.revision;
  const commandName = editorName === 'config' ? 'write-config' : 'write-command-args';
  const result = readControlMessage(await runControl(commandName, snapshot));
  state.saved = snapshot;
  state.fileState = snapshot.trim() ? 'present' : 'empty';
  if (state.revision === revisionAtSave) state.draft = snapshot;
  applyLocalConfigurationState(editorName, state.fileState);
  renderEditorFeedback(editorName, state.revision === revisionAtSave
    ? `${result}；不会自动重启 Core。`
    : '已保存点击时的内容；保存期间的新草稿仍未保存。');
  return result;
}

async function removeCommandArguments() {
  const state = editorState.args;
  const revisionAtRequest = state.revision;
  const result = readControlMessage(await runControl('remove-command-args'));
  state.saved = '';
  state.fileState = 'missing';
  if (state.revision === revisionAtRequest) {
    state.draft = '';
    setEditorValue('args', '');
  }
  applyLocalConfigurationState('args', 'missing');
  renderEditorFeedback('args', state.revision === revisionAtRequest
    ? result
    : '启动参数文件已删除；删除期间的新草稿仍保留，尚未保存。');
  return result;
}

function renderLogState(message, isError = false) {
  el.logState.textContent = message;
  el.logState.classList.toggle('status-error', isError);
}

async function loadLog() {
  renderLogState('正在读取日志...');
  try {
    const logContent = await runControl('logs');
    el.logBox.textContent = logContent || '暂无 Core 运行日志。';
    renderLogState(logContent ? '最近 200 行' : '暂无日志');
    return logContent ? '日志已读取' : '当前没有日志内容';
  } catch (error) {
    renderLogState(`日志读取失败：${error?.message || String(error)}`, true);
    throw error;
  }
}

async function checkLatest() {
  el.updateInfo.classList.remove('status-error');
  el.updateInfo.textContent = '正在检查 GitHub Release...';
  try {
    const releaseInfo = JSON.parse(await runControl('latest'));
    el.updateInfo.textContent = releaseInfo.tag ? `最新版本：${releaseInfo.tag}` : JSON.stringify(releaseInfo, null, 2);
    return releaseInfo.tag ? `已检查到 ${releaseInfo.tag}` : 'Release 信息已读取';
  } catch (error) {
    el.updateInfo.textContent = `检查失败：${error?.message || String(error)}`;
    el.updateInfo.classList.add('status-error');
    throw error;
  }
}

function getCoreStopCommand() {
  return runControl('stop-core').then(readControlMessage);
}

async function performCoreAction() {
  if (controlOperationInProgress) return;
  if (!latestStatus) {
    try { await refreshStatus(); } catch (_) {}
  }
  const shouldStopCore = !latestStatus || latestStatus.core_discovery_error === true
    || latestStatus.core_running === true || Number(latestStatus.core_count) > 0;
  if (shouldStopCore) {
    openConfirmation('停止或清理 Core？', latestStatus?.core_discovery_error
      ? '当前无法确认进程状态。控制命令会再次核验并停止本模块已确认的 Core 实例。'
      : '这会停止本模块已确认的 Core 进程。',
    () => safeAction('停止 Core', getCoreStopCommand, { exclusiveControl: true, refreshStatus: true }));
    return;
  }
  if (el.coreDetails.dataset.launchInputUsable !== 'true') {
    showSnackbar('配置不存在或为空，请先填写并保存。');
    showPage('config');
    return;
  }
  await safeAction('启动 Core', () => runControl('start-core').then(readControlMessage), {
    exclusiveControl: true,
    refreshStatus: true,
  });
}

function requestCoreRestart() {
  if (controlOperationInProgress) return;
  const hasCoreToClean = latestStatus?.core_discovery_error === true
    || Number(latestStatus?.core_count) > 0
    || latestStatus?.core_running === true;
  if (el.coreDetails.dataset.launchInputUsable !== 'true' && !hasCoreToClean) {
    showSnackbar('配置不存在或为空，无法重启 Core。');
    showPage('config');
    return;
  }
  openConfirmation('重启 Core？', 'Core 将按最近保存的配置重启；未保存的草稿不会生效。', () => {
    safeAction('重启 Core', () => runControl('restart-core').then(readControlMessage), {
      exclusiveControl: true,
      refreshStatus: true,
    });
  });
}

function requestBootPreferenceChange() {
  if (!latestStatus || controlOperationInProgress) return;
  if (latestStatus.start_on_boot !== true) {
    safeAction('启用开机启动', () => runControl('enable-boot').then(readControlMessage), {
      exclusiveControl: true,
      refreshStatus: true,
    });
    return;
  }
  openConfirmation('关闭开机启动？', '按照当前模块行为，关闭开机启动也会停止 Core。', () => {
    safeAction('关闭开机启动', () => runControl('disable-boot').then(readControlMessage), {
      exclusiveControl: true,
      refreshStatus: true,
    });
  });
}

async function updateBinary() {
  const tag = (el.tagInput.value || 'latest').trim();
  const result = readControlMessage(await runControl(`update-binary ${shellQuote(tag)}`, undefined, { timeoutMs: 300000 }));
  try {
    await refreshCoreVersion();
  } catch (error) {
    el.coreVersion.textContent = `版本刷新失败：${error?.message || String(error)}`;
  }
  return result;
}

function bindConfirmationButtons() {
  el.cancelDialog.addEventListener('click', () => closeConfirmation(false));
  el.confirmDialog.addEventListener('click', () => closeConfirmation(true));
  el.cancelAction.addEventListener('click', () => closeConfirmation(false));
  el.confirmAction.addEventListener('click', () => closeConfirmation(true));
  el.confirmation.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeConfirmation(false);
  });
  el.confirmation.addEventListener('click', (event) => {
    if (event.target === el.confirmation) closeConfirmation(false);
  });
  document.addEventListener('keydown', handleConfirmationKeydown);
}

function bindPageNavigation() {
  document.querySelectorAll('[data-nav]').forEach((navigationButton) => {
    navigationButton.addEventListener('click', () => showPage(navigationButton.dataset.nav));
  });
}

function bindEditorControls() {
  el.configTab.addEventListener('click', () => renderEditor('config'));
  el.argsTab.addEventListener('click', () => renderEditor('args'));
  [el.configTab, el.argsTab].forEach((tab) => {
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const nextEditor = currentEditor === 'config' ? 'args' : 'config';
      renderEditor(nextEditor);
      (nextEditor === 'config' ? el.configTab : el.argsTab).focus();
    });
  });
  el.configEditor.addEventListener('input', () => initializeEditorInput('config'));
  el.argsEditor.addEventListener('input', () => initializeEditorInput('args'));
  el.editConfigBtn.addEventListener('click', () => el.configEditor.focus());
  el.loadConfigBtn.addEventListener('click', () => requestEditorReload('config'));
  el.loadArgsBtn.addEventListener('click', () => requestEditorReload('args'));
  el.saveConfigBtn.addEventListener('click', () => safeAction('保存配置', () => saveEditor('config')));
  el.saveArgsBtn.addEventListener('click', () => safeAction('保存启动参数', () => saveEditor('args')));
el.removeArgsBtn.addEventListener('click', () => openConfirmation(
    '删除启动参数文件？',
    '删除后下次启动将使用 config.toml。',
    () => safeAction('删除启动参数', removeCommandArguments, { exclusiveControl: true }),
  ));
}

function bindCoreControls() {
  el.coreActionBtn.addEventListener('click', performCoreAction);
  el.restartCoreBtn.addEventListener('click', requestCoreRestart);
  el.bootSwitch.addEventListener('click', requestBootPreferenceChange);
  el.refreshBtn.addEventListener('click', () => safeAction('刷新运行状态', refreshStatus));
}

function bindThemeControl() {
  applyTheme(themePreference, false);
  el.themeSelect.addEventListener('change', () => applyTheme(el.themeSelect.value));
  if (typeof window.matchMedia !== 'function') return;
  themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const updateSystemThemePreference = () => {
    if (themePreference === 'system') {
      document.documentElement.removeAttribute('data-theme');
      updateThemeColor();
    }
  };
  if (typeof themeMediaQuery.addEventListener === 'function') themeMediaQuery.addEventListener('change', updateSystemThemePreference);
  else if (typeof themeMediaQuery.addListener === 'function') themeMediaQuery.addListener(updateSystemThemePreference);
}

function bindSecondaryActions() {
  el.coreLogBtn.addEventListener('click', () => safeAction('读取运行日志', loadLog));
  el.checkUpdateBtn.addEventListener('click', () => safeAction('检查版本', checkLatest));
  el.updateBinaryBtn.addEventListener('click', () => openConfirmation(
    '更新 Core 与 CLI？',
    `将从 GitHub Release 获取 ${el.tagInput.value.trim() || 'latest'}。更新期间 Core 会停止或重启。`,
    () => safeAction('更新二进制', updateBinary, { exclusiveControl: true, refreshStatus: true }),
  ));
}

async function initialize() {
  bindPageNavigation();
  bindConfirmationButtons();
  bindEditorControls();
  bindCoreControls();
  bindThemeControl();
  bindSecondaryActions();
  renderEditor('config');

  const results = await Promise.allSettled([
    refreshStatus(),
    refreshCoreVersion(),
    loadEditor('config'),
    loadEditor('args'),
  ]);
  const errors = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason?.message || String(result.reason));
  if (errors.length) showActionStatus(`部分内容未能读取：${errors.join('；')}`, true);
  else showActionStatus('模块已连接');
}

initialize();
