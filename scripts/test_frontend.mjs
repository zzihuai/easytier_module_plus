import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.window = {};
let bridgeCallbackName;
let bridgeResponse = [0, 'ok', ''];
let shouldThrowFromBridge = false;
globalThis.ksu = {
  exec(command, options, callbackName) {
    bridgeCallbackName = callbackName;
    if (shouldThrowFromBridge) throw new Error('bridge failed');
    if (bridgeResponse) window[callbackName](...bridgeResponse);
  },
};

const bridgePath = new URL('../module/webroot/kernelsu.js', import.meta.url);
const bridgeSource = await readFile(bridgePath, 'utf8');
const bridgeModule = await import(`data:text/javascript;base64,${Buffer.from(bridgeSource).toString('base64')}`);
assert.deepEqual(await bridgeModule.exec('success'), { errno: 0, stdout: 'ok', stderr: '' });
assert.equal(window[bridgeCallbackName], undefined);
bridgeResponse = ['0', 'string exit status', ''];
assert.equal((await bridgeModule.exec('string-status')).errno, '0');
shouldThrowFromBridge = true;
await assert.rejects(bridgeModule.exec('throws'), /bridge failed/);
assert.equal(window[bridgeCallbackName], undefined);
shouldThrowFromBridge = false;
bridgeResponse = null;
const timedCommand = bridgeModule.exec('times-out', { timeoutMs: 10 });
await assert.rejects(timedCommand, /执行超时/);
assert.equal(typeof window[bridgeCallbackName], 'function');
window[bridgeCallbackName](0, 'late result', '');
assert.equal(window[bridgeCallbackName], undefined);
console.log('frontend bridge regression tests: OK');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(className) { this.values.add(className); }
  remove(className) { this.values.delete(className); }
  toggle(className, force) {
    const shouldAdd = typeof force === 'boolean' ? force : !this.values.has(className);
    if (shouldAdd) this.values.add(className);
    else this.values.delete(className);
    return shouldAdd;
  }
}

class FakeElement {
  constructor(identifier, dataset = {}) {
    this.id = identifier;
    this.dataset = { ...dataset };
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.attributes = new Map();
    this.textContent = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.tabIndex = 0;
    this.open = false;
    this.isConnected = true;
    this.focusCount = 0;
    this.span = new FakeElementSpan();
  }

  addEventListener(eventName, listener) {
    const listeners = this.listeners.get(eventName) || [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
  }

  dispatch(eventName, event = {}) {
    for (const listener of this.listeners.get(eventName) || []) {
      listener({ target: this, preventDefault() {}, ...event });
    }
  }

  click() {
    if (!this.disabled) {
      this.focus();
      this.dispatch('click');
    }
  }

  focus() {
    this.focusCount += 1;
    globalThis.document.activeElement = this;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  querySelector(selector) { return selector === 'span' ? this.span : null; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

class FakeElementSpan {
  constructor() { this.textContent = ''; }
}

const indexPath = new URL('../module/webroot/index.html', import.meta.url);
const indexSource = await readFile(indexPath, 'utf8');
const elementIds = [
  'refreshBtn', 'moduleEnabled', 'coreTitle', 'coreDetails', 'coreActionBtn', 'restartCoreBtn', 'bootSwitch',
  'configFeedback', 'ipRuleState', 'configSummary', 'configFileState', 'argsFileState', 'configTab', 'argsTab',
  'configPanel', 'argsPanel', 'modeHint', 'configFilename', 'argsFilename', 'configEditor', 'argsEditor',
  'loadConfigBtn', 'saveConfigBtn', 'editConfigBtn', 'argsFeedback', 'loadArgsBtn', 'saveArgsBtn', 'removeArgsBtn',
  'logState', 'tagInput', 'checkUpdateBtn', 'updateBinaryBtn', 'updateInfo', 'actionStatus', 'coreLogBtn', 'logBox',
  'coreVersion', 'moduleVersion', 'configPath', 'argsPath', 'themeSelect', 'confirmation', 'dialogTitle',
  'dialogMessage', 'cancelDialog', 'confirmDialog', 'confirmFallback', 'confirmTitle', 'confirmMessage',
  'cancelAction', 'confirmAction', 'snackbar', 'overviewPage', 'configPage', 'logsPage', 'managementPage',
];
for (const identifier of elementIds) {
  assert.ok(indexSource.includes(`id="${identifier}"`), `module index should provide the ${identifier} control`);
}
for (const pageName of ['overview', 'config', 'logs', 'management']) {
  assert.ok(indexSource.includes(`data-page="${pageName}"`), `module index should expose the ${pageName} page`);
}
const fakeElements = new Map(elementIds.map((identifier) => [identifier, new FakeElement(identifier)]));
fakeElements.get('logState').textContent = '尚未读取';
fakeElements.get('configEditor').placeholder = '配置为空，可以直接输入';
fakeElements.get('confirmFallback').hidden = true;
const navigationButtons = ['overview', 'config', 'logs', 'management'].map((pageName) => new FakeElement(`nav-${pageName}`, { nav: pageName }));
const pageElements = ['overview', 'config', 'logs', 'management'].map((pageName) => new FakeElement(`page-${pageName}`, { page: pageName }));
const documentRoot = new FakeElement('document-root');
const systemThemeListeners = [];
const storedPreferences = new Map();
storedPreferences.set('easytier-theme', 'dark');
let rejectThemeStorageWrites = false;
const fakeMediaQuery = {
  matches: false,
  addEventListener(eventName, listener) {
    if (eventName === 'change') systemThemeListeners.push(listener);
  },
  dispatch(matches) {
    this.matches = matches;
    systemThemeListeners.forEach((listener) => listener({ matches }));
  },
};
globalThis.document = {
  activeElement: null,
  documentElement: {
    dataset: {},
    removeAttribute(attributeName) {
      if (attributeName === 'data-theme') delete this.dataset.theme;
    },
  },
  getElementById(identifier) { return fakeElements.get(identifier) || null; },
  querySelectorAll(selector) {
    if (selector === '[data-page]') return pageElements;
    if (selector === '[data-nav]') return navigationButtons;
    return [];
  },
  querySelector() { return null; },
  addEventListener(eventName, listener) {
    const eventListeners = this.listeners.get(eventName) || [];
    eventListeners.push(listener);
    this.listeners.set(eventName, eventListeners);
  },
  listeners: new Map(),
};
globalThis.window = {
  ksu: {},
  setTimeout,
  clearTimeout,
  matchMedia() { return fakeMediaQuery; },
  localStorage: {
    getItem(key) { return storedPreferences.get(key) ?? null; },
    setItem(key, value) {
      if (rejectThemeStorageWrites) throw new Error('storage blocked');
      storedPreferences.set(key, value);
    },
    removeItem(key) {
      if (rejectThemeStorageWrites) throw new Error('storage blocked');
      storedPreferences.delete(key);
    },
  },
};

let fakeCoreRunning = false;
let fakeBootEnabled = true;
let fakeConfigContent = 'instance_name = "android"\n';
let fakeArgumentsContent = null;
let fakeStatusOverrides = {};
let holdStatusResponse = false;
let heldStatusResolver = null;
let holdConfigRead = false;
let heldConfigReadResolver = null;
let holdConfigSave = false;
let heldConfigSaveResolver = null;
let holdStartCommand = false;
let heldStartCommandResolver = null;
let holdArgumentsRemoval = false;
let heldArgumentsRemovalResolver = null;
let failConfigRead = false;
let failLogRead = false;
let statusRequestCount = 0;
const frontendCommands = [];

function makeStatusResponse() {
  return JSON.stringify({
    module_enabled: true,
    core_running: fakeCoreRunning,
    core_count: fakeCoreRunning ? 1 : 0,
    core_discovery_error: false,
    core_enabled: true,
    start_on_boot: fakeBootEnabled,
    ip_rule_enabled: false,
    config_state: fakeConfigContent.trim() ? 'present' : 'empty',
    command_args_state: fakeArgumentsContent === null ? 'missing' : (fakeArgumentsContent.trim() ? 'present' : 'empty'),
    config_path: '/module/config/config.toml',
    command_args_path: '/module/config/command_args',
    module_version: 'v2.6.4-module-ui4',
    ...fakeStatusOverrides,
  });
}

globalThis.mockExec = async (command) => {
  frontendCommands.push(command);
  if (command.endsWith(' status')) {
    statusRequestCount += 1;
    const statusSnapshot = makeStatusResponse();
    if (holdStatusResponse) {
      return new Promise((resolve) => {
        heldStatusResolver = () => resolve({ errno: 0, stdout: statusSnapshot });
      });
    }
    return { errno: 0, stdout: statusSnapshot };
  }
  if (command.endsWith(' core-version')) return { errno: 0, stdout: JSON.stringify({ core_version: 'v2.6.4' }) };
  if (command.endsWith(' read-config')) {
    if (failConfigRead) return { errno: 1, stdout: '', stderr: 'read failed' };
    if (holdConfigRead) {
      return new Promise((resolve) => {
        heldConfigReadResolver = () => resolve({ errno: 0, stdout: fakeConfigContent });
      });
    }
    return { errno: 0, stdout: fakeConfigContent };
  }
  if (command.endsWith(' read-command-args')) return { errno: 0, stdout: fakeArgumentsContent || '' };
  if (command.endsWith(' logs')) {
    return failLogRead
      ? { errno: 1, stdout: '', stderr: 'logs unavailable' }
      : { errno: 0, stdout: '09:41:00 INFO core started\n09:41:02 INFO peer connected' };
  }
  if (command.includes('write-config')) {
    const contentAtSave = fakeElements.get('configEditor').value;
    if (holdConfigSave) {
      return new Promise((resolve) => {
        heldConfigSaveResolver = () => {
          fakeConfigContent = contentAtSave;
          resolve({ errno: 0, stdout: '{"ok":true,"message":"配置已保存"}' });
        };
      });
    }
    fakeConfigContent = contentAtSave;
    return { errno: 0, stdout: '{"ok":true,"message":"配置已保存"}' };
  }
  if (command.includes('write-command-args')) {
    fakeArgumentsContent = fakeElements.get('argsEditor').value;
    return { errno: 0, stdout: '{"ok":true,"message":"启动参数已保存"}' };
  }
  if (command.endsWith(' remove-command-args')) {
    if (holdArgumentsRemoval) {
      return new Promise((resolve) => {
        heldArgumentsRemovalResolver = () => {
          fakeArgumentsContent = null;
          resolve({ errno: 0, stdout: '{"ok":true,"message":"启动参数已删除"}' });
        };
      });
    }
    fakeArgumentsContent = null;
    return { errno: 0, stdout: '{"ok":true,"message":"启动参数已删除"}' };
  }
  if (command.endsWith(' start-core')) {
    if (holdStartCommand) {
      return new Promise((resolve) => {
        heldStartCommandResolver = () => {
          fakeCoreRunning = true;
          resolve({ errno: 0, stdout: '{"ok":true,"message":"Core 已启动"}' });
        };
      });
    }
    fakeCoreRunning = true;
    return { errno: 0, stdout: '{"ok":true,"message":"Core 已启动"}' };
  }
  if (command.endsWith(' stop-core')) {
    fakeCoreRunning = false;
    return { errno: 0, stdout: '{"ok":true,"message":"Core 已停止"}' };
  }
  if (command.endsWith(' restart-core')) {
    fakeCoreRunning = true;
    return { errno: 0, stdout: '{"ok":true,"message":"Core 已重启"}' };
  }
  if (command.endsWith(' enable-boot')) {
    fakeBootEnabled = true;
    return { errno: 0, stdout: '{"ok":true,"message":"开机启动已启用"}' };
  }
  if (command.endsWith(' disable-boot')) {
    fakeBootEnabled = false;
    fakeCoreRunning = false;
    return { errno: 0, stdout: '{"ok":true,"message":"开机启动已禁用，core 已停止"}' };
  }
  if (command.endsWith(' latest')) return { errno: 0, stdout: JSON.stringify({ tag: 'v2.6.5', asset: 'https://example.invalid/core.zip' }) };
  if (command.includes('update-binary')) return { errno: 0, stdout: '{"ok":true,"message":"二进制已更新"}' };
  return { errno: 1, stdout: '', stderr: `unexpected command: ${command}` };
};

const appPath = new URL('../module/webroot/app.js', import.meta.url);
const appSource = await readFile(appPath, 'utf8');
const appWithMockBridge = appSource.replace(
  "import { exec, enableEdgeToEdge } from './kernelsu.js';",
  'const exec = globalThis.mockExec; const enableEdgeToEdge = () => {};',
);
assert.notEqual(appWithMockBridge, appSource, 'app bridge import should be replaceable in the isolated test');
await import(`data:text/javascript;base64,${Buffer.from(appWithMockBridge).toString('base64')}`);
const waitForFrontend = () => new Promise((resolve) => setTimeout(resolve, 0));
await waitForFrontend();
await waitForFrontend();

const configEditor = fakeElements.get('configEditor');
const argsEditor = fakeElements.get('argsEditor');
assert.equal(configEditor.value, fakeConfigContent);
assert.equal(argsEditor.value, '');
assert.equal(fakeElements.get('coreVersion').textContent, 'v2.6.4');
assert.equal(fakeElements.get('logState').textContent, '尚未读取');
assert.equal(fakeElements.get('themeSelect').value, 'dark', 'a saved theme preference should be restored at startup');
assert.equal(document.documentElement.dataset.theme, 'dark');
assert.equal(frontendCommands.filter((command) => command.endsWith(' logs')).length, 0, 'initialization must not read logs');
let escapeWasCanceled = false;
document.listeners.get('keydown')[0]({ key: 'Escape', preventDefault() { escapeWasCanceled = true; } });
assert.equal(escapeWasCanceled, false, 'Escape outside a confirmation should retain its normal behavior');

const initialStatusRequestCount = statusRequestCount;
navigationButtons.find((button) => button.dataset.nav === 'config').click();
argsEditor.value = '--network-name draft-only';
argsEditor.dispatch('input');
navigationButtons.find((button) => button.dataset.nav === 'overview').click();
navigationButtons.find((button) => button.dataset.nav === 'config').click();
assert.equal(argsEditor.value, '--network-name draft-only', 'navigating must preserve the argument draft');
assert.equal(statusRequestCount, initialStatusRequestCount, 'page navigation must not issue status requests');

fakeElements.get('argsTab').click();
argsEditor.value = '--network-name saved-later';
argsEditor.dispatch('input');
fakeElements.get('configTab').click();
assert.equal(configEditor.value, fakeConfigContent, 'switching editor tabs must preserve the config text');
fakeElements.get('argsTab').click();
assert.equal(argsEditor.value, '--network-name saved-later', 'switching editor tabs must preserve args draft');

fakeElements.get('themeSelect').value = 'dark';
fakeElements.get('themeSelect').dispatch('change');
assert.equal(document.documentElement.dataset.theme, 'dark');
assert.equal(storedPreferences.get('easytier-theme'), 'dark');
fakeElements.get('themeSelect').value = 'light';
fakeElements.get('themeSelect').dispatch('change');
assert.equal(document.documentElement.dataset.theme, 'light');
fakeElements.get('themeSelect').value = 'system';
fakeElements.get('themeSelect').dispatch('change');
assert.equal(document.documentElement.dataset.theme, undefined);
assert.equal(storedPreferences.has('easytier-theme'), false, 'system appearance should remove the saved override');
fakeMediaQuery.dispatch(true);
assert.equal(document.documentElement.dataset.theme, undefined, 'system appearance should remain controlled by CSS media queries');
rejectThemeStorageWrites = true;
fakeElements.get('themeSelect').value = 'dark';
fakeElements.get('themeSelect').dispatch('change');
assert.equal(document.documentElement.dataset.theme, 'dark', 'theme changes must work when storage throws');
assert.match(fakeElements.get('actionStatus').textContent, /不支持保存主题偏好/);
rejectThemeStorageWrites = false;
fakeElements.get('themeSelect').value = 'system';
fakeElements.get('themeSelect').dispatch('change');

const configReadCount = frontendCommands.filter((command) => command.endsWith(' read-config')).length;
holdConfigRead = true;
fakeElements.get('loadConfigBtn').click();
await waitForFrontend();
configEditor.value = 'new draft typed while read is pending';
configEditor.dispatch('input');
heldConfigReadResolver();
holdConfigRead = false;
await waitForFrontend();
await waitForFrontend();
assert.equal(configEditor.value, 'new draft typed while read is pending', 'a late config read must not overwrite text entered while it was pending');
assert.ok(frontendCommands.filter((command) => command.endsWith(' read-config')).length > configReadCount);

holdConfigSave = true;
fakeElements.get('saveConfigBtn').click();
await waitForFrontend();
assert.equal(configEditor.disabled, false, 'saving must not disable the editor');
configEditor.value = 'draft typed while config save is pending';
configEditor.dispatch('input');
heldConfigSaveResolver();
holdConfigSave = false;
await waitForFrontend();
await waitForFrontend();
assert.equal(configEditor.value, 'draft typed while config save is pending');
assert.match(fakeElements.get('configFeedback').textContent, /保存期间的新草稿仍未保存/);

failConfigRead = true;
fakeElements.get('loadConfigBtn').click();
assert.equal(fakeElements.get('confirmation').open, true, 'reloading a dirty config must require confirmation');
fakeElements.get('confirmDialog').click();
await waitForFrontend();
await waitForFrontend();
assert.equal(configEditor.value, 'draft typed while config save is pending', 'read errors must preserve current config text');
assert.match(fakeElements.get('configFeedback').textContent, /读取失败/);
assert.equal(fakeElements.get('configFileState').textContent, '有未保存修改');
failConfigRead = false;

fakeElements.get('argsTab').click();
holdArgumentsRemoval = true;
fakeElements.get('removeArgsBtn').click();
assert.equal(fakeElements.get('confirmation').open, true);
fakeElements.get('confirmDialog').click();
await waitForFrontend();
argsEditor.value = '--network-name written-during-delete';
argsEditor.dispatch('input');
heldArgumentsRemovalResolver();
holdArgumentsRemoval = false;
await waitForFrontend();
await waitForFrontend();
assert.equal(argsEditor.value, '--network-name written-during-delete', 'deleting args must preserve text entered while the command is pending');
assert.match(fakeElements.get('argsFeedback').textContent, /新草稿仍保留/);

fakeArgumentsContent = '';
fakeConfigContent = 'instance_name = "still-valid-config"\n';
fakeElements.get('refreshBtn').click();
await waitForFrontend();
await waitForFrontend();
assert.equal(fakeElements.get('coreActionBtn').disabled, true, 'an empty command_args file must override a valid config and block start');
assert.match(fakeElements.get('configSummary').textContent, /启动参数为空/);
fakeArgumentsContent = null;
fakeElements.get('refreshBtn').click();
await waitForFrontend();
await waitForFrontend();

holdStatusResponse = true;
fakeElements.get('refreshBtn').click();
await waitForFrontend();
configEditor.value = '';
configEditor.dispatch('input');
fakeElements.get('saveConfigBtn').click();
await waitForFrontend();
await waitForFrontend();
heldStatusResolver();
holdStatusResponse = false;
await waitForFrontend();
await waitForFrontend();
assert.match(fakeElements.get('configSummary').textContent, /配置文件为空/,
  'an old status response must not overwrite the configuration state changed by a completed save');
assert.equal(fakeElements.get('coreActionBtn').disabled, true);
configEditor.value = 'instance_name = "restored"\n';
configEditor.dispatch('input');
fakeElements.get('saveConfigBtn').click();
await waitForFrontend();
await waitForFrontend();

const statusCountBeforeLogRead = statusRequestCount;
fakeElements.get('coreLogBtn').click();
await waitForFrontend();
await waitForFrontend();
assert.match(fakeElements.get('logBox').textContent, /peer connected/);
assert.equal(statusRequestCount, statusCountBeforeLogRead, 'reading logs must not refresh process status');
failLogRead = true;
fakeElements.get('coreLogBtn').click();
await waitForFrontend();
await waitForFrontend();
assert.match(fakeElements.get('logState').textContent, /读取失败/);
failLogRead = false;

fakeStatusOverrides = { core_running: true, core_count: 2 };
fakeCoreRunning = false;
fakeElements.get('refreshBtn').click();
await waitForFrontend();
await waitForFrontend();
assert.match(fakeElements.get('coreTitle').textContent, /2 个 Core 实例/);
assert.equal(fakeElements.get('coreActionBtn').span.textContent, '清理重复实例');
assert.equal(fakeElements.get('restartCoreBtn').disabled, false, 'duplicate instances retain the cleanup/restart entry');

fakeStatusOverrides = { core_running: false, core_count: 0, core_discovery_error: true };
fakeElements.get('refreshBtn').click();
await waitForFrontend();
await waitForFrontend();
assert.equal(fakeElements.get('coreTitle').textContent, '进程状态不可确认');
assert.equal(fakeElements.get('coreActionBtn').span.textContent, '停止 / 清理');
assert.notEqual(fakeElements.get('coreTitle').textContent, 'Core 已停止', 'unknown process state must not be presented as stopped');
fakeStatusOverrides = {};

fakeCoreRunning = true;
fakeArgumentsContent = null;
fakeElements.get('refreshBtn').click();
await waitForFrontend();
await waitForFrontend();
const stopCommandCount = frontendCommands.filter((command) => command.endsWith(' stop-core')).length;
fakeElements.get('coreActionBtn').click();
assert.equal(fakeElements.get('confirmation').open, true, 'stopping the core requires confirmation');
fakeElements.get('cancelDialog').click();
assert.equal(frontendCommands.filter((command) => command.endsWith(' stop-core')).length, stopCommandCount, 'cancel must not run a shell command');
assert.equal(document.activeElement, fakeElements.get('coreActionBtn'), 'cancel restores focus to the control that opened confirmation');

fakeElements.get('confirmation').showModal = undefined;
fakeElements.get('coreActionBtn').click();
assert.equal(fakeElements.get('confirmFallback').hidden, false, 'older WebViews should show the confirmation fallback');
document.listeners.get('keydown')[0]({ key: 'Escape', preventDefault() {} });
assert.equal(fakeElements.get('confirmFallback').hidden, true);
assert.equal(frontendCommands.filter((command) => command.endsWith(' stop-core')).length, stopCommandCount,
  'Escape in the fallback dialog must cancel without sending a command');
fakeElements.get('confirmation').showModal = () => { fakeElements.get('confirmation').open = true; };

fakeElements.get('coreActionBtn').click();
fakeElements.get('confirmDialog').click();
await waitForFrontend();
await waitForFrontend();
assert.equal(fakeCoreRunning, false);
assert.equal(frontendCommands.filter((command) => command.endsWith(' stop-core')).length, stopCommandCount + 1);

fakeCoreRunning = false;
holdStartCommand = true;
fakeElements.get('coreActionBtn').click();
await waitForFrontend();
assert.equal(typeof heldStartCommandResolver, 'function');
assert.ok(fakeElements.get('coreActionBtn').disabled, 'the conflicting Core control stays disabled while lifecycle work is pending');
assert.equal(configEditor.disabled, false, 'lifecycle work must leave both editors available');
assert.equal(fakeElements.get('themeSelect').disabled, false, 'lifecycle work must leave theme controls available');
const startCommandCount = frontendCommands.filter((command) => command.endsWith(' start-core')).length;
fakeElements.get('coreActionBtn').click();
assert.equal(frontendCommands.filter((command) => command.endsWith(' start-core')).length, startCommandCount, 'a duplicate lifecycle click must not dispatch a second start');
heldStartCommandResolver();
holdStartCommand = false;
await waitForFrontend();
await waitForFrontend();
assert.equal(fakeCoreRunning, true, 'the primary Core control starts a stopped service');
assert.equal(fakeElements.get('coreActionBtn').disabled, false);

const restartCommandCount = frontendCommands.filter((command) => command.endsWith(' restart-core')).length;
fakeElements.get('restartCoreBtn').click();
assert.equal(fakeElements.get('confirmation').open, true, 'restarting the core requires confirmation');
fakeElements.get('cancelDialog').click();
assert.equal(frontendCommands.filter((command) => command.endsWith(' restart-core')).length, restartCommandCount,
  'canceling restart must not issue the backend command');
fakeElements.get('restartCoreBtn').click();
fakeElements.get('confirmDialog').click();
await waitForFrontend();
await waitForFrontend();
assert.equal(frontendCommands.filter((command) => command.endsWith(' restart-core')).length, restartCommandCount + 1);

const disableBootCommandCount = frontendCommands.filter((command) => command.endsWith(' disable-boot')).length;
fakeElements.get('bootSwitch').click();
assert.equal(fakeElements.get('confirmation').open, true, 'disabling boot should explain that Core will also stop');
fakeElements.get('cancelDialog').click();
assert.equal(frontendCommands.filter((command) => command.endsWith(' disable-boot')).length, disableBootCommandCount,
  'canceling boot disable must not change the preference');
fakeElements.get('bootSwitch').click();
fakeElements.get('confirmDialog').click();
await waitForFrontend();
await waitForFrontend();
assert.equal(fakeBootEnabled, false);
assert.equal(fakeCoreRunning, false);
assert.equal(frontendCommands.filter((command) => command.endsWith(' disable-boot')).length, disableBootCommandCount + 1);

const binaryUpdateCommandCount = frontendCommands.filter((command) => command.includes('update-binary')).length;
fakeElements.get('updateBinaryBtn').click();
assert.equal(fakeElements.get('confirmation').open, true, 'binary update should require confirmation');
fakeElements.get('cancelDialog').click();
assert.equal(frontendCommands.filter((command) => command.includes('update-binary')).length, binaryUpdateCommandCount,
  'canceling a binary update must not start a download');
fakeElements.get('updateBinaryBtn').click();
fakeElements.get('confirmDialog').click();
await waitForFrontend();
await waitForFrontend();
await waitForFrontend();
assert.equal(frontendCommands.filter((command) => command.includes('update-binary')).length, binaryUpdateCommandCount + 1);

holdStatusResponse = true;
const beforeCoalescedRefresh = statusRequestCount;
fakeElements.get('refreshBtn').click();
fakeElements.get('refreshBtn').click();
await waitForFrontend();
assert.equal(statusRequestCount, beforeCoalescedRefresh + 1, 'concurrent manual refreshes should coalesce');
holdStatusResponse = false;
heldStatusResolver();
await waitForFrontend();
await waitForFrontend();

console.log('module frontend interaction tests: OK');
