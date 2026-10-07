import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.window = {};
let callbackName;
let nextResponse = [0, 'ok', ''];
let shouldThrow = false;
globalThis.ksu = {
  exec(command, options, callback) {
    callbackName = callback;
    if (shouldThrow) throw new Error('bridge failed');
    if (nextResponse) window[callback](...nextResponse);
  },
};

const frontendPath = new URL('../module/webroot/kernelsu.js', import.meta.url);
const frontendSource = await readFile(frontendPath, 'utf8');
const frontendModule = await import(`data:text/javascript;base64,${Buffer.from(frontendSource).toString('base64')}`);

assert.deepEqual(await frontendModule.exec('success'), { errno: 0, stdout: 'ok', stderr: '' });
assert.equal(window[callbackName], undefined);

nextResponse = ['0', 'string exit status', ''];
assert.equal((await frontendModule.exec('string-status')).errno, '0');

shouldThrow = true;
await assert.rejects(frontendModule.exec('throws'), /bridge failed/);
assert.equal(window[callbackName], undefined);
shouldThrow = false;

nextResponse = null;
const timedCommand = frontendModule.exec('times-out', { timeoutMs: 10 });
await assert.rejects(timedCommand, /执行超时/);
assert.equal(typeof window[callbackName], 'function');
window[callbackName](0, 'late result', '');
assert.equal(window[callbackName], undefined);

console.log('frontend bridge regression tests: OK');

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

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
  constructor(identifier, textContent = '') {
    this.id = identifier;
    this.textContent = textContent;
    this.value = '';
    this.placeholder = '';
    this.disabled = false;
    this.dataset = {};
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.focusCount = 0;
  }

  addEventListener(eventName, listener) {
    const listeners = this.listeners.get(eventName) || [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
  }

  dispatch(eventName) {
    for (const listener of this.listeners.get(eventName) || []) listener({ target: this });
  }

  click() { this.dispatch('click'); }
  focus() { this.focusCount += 1; }
  setAttribute() {}
}

const elementIdentifiers = [
  'refreshBtn', 'moduleEnabled', 'coreState', 'configState', 'configFeedback',
  'bootState', 'ipRuleState', 'versionInfo', 'configEditor', 'argsEditor',
  'loadConfigBtn', 'saveConfigBtn', 'loadArgsBtn', 'saveArgsBtn', 'removeArgsBtn',
  'tagInput', 'checkUpdateBtn', 'updateBinaryBtn', 'updateInfo', 'actionStatus',
  'coreLogBtn', 'logBox', 'editConfigBtn',
];
const fakeElements = new Map(elementIdentifiers.map((identifier) => [identifier, new FakeElement(identifier)]));
const commandNames = ['start-core', 'stop-core', 'restart-core', 'enable-boot', 'disable-boot'];
const commandButtons = commandNames.map((commandName) => {
  const button = new FakeElement(commandName, commandName);
  button.dataset.cmd = commandName;
  return button;
});
globalThis.document = {
  getElementById(identifier) {
    return fakeElements.get(identifier) || null;
  },
  querySelectorAll(selector) {
    return selector === '[data-cmd]' ? commandButtons : [];
  },
};
globalThis.window = { ksu: {} };

let statusRequestCount = 0;
let holdStatusResponse = false;
let resolveHeldStatus;
let holdConfigSave = false;
let resolveHeldConfigSave;
let failConfigRead = false;
let holdStartCommand = false;
let resolveHeldStartCommand;
let fakeCoreRunning = false;
const appCommands = [];
const moduleStatus = () => JSON.stringify({
  module_enabled: true,
  core_running: fakeCoreRunning,
  core_count: fakeCoreRunning ? 1 : 0,
  core_discovery_error: false,
  core_enabled: true,
  start_on_boot: false,
  ip_rule_enabled: false,
  config_state: 'empty',
  command_args_state: 'missing',
  config_path: '/module/config/config.toml',
  command_args_path: '/module/config/command_args',
  module_version: 'test',
});
globalThis.mockExec = async (command) => {
  appCommands.push(command);
  if (command.endsWith('status')) {
    statusRequestCount += 1;
    if (holdStatusResponse) {
      return new Promise((resolve) => { resolveHeldStatus = () => resolve({ errno: 0, stdout: moduleStatus() }); });
    }
    return { errno: 0, stdout: moduleStatus() };
  }
  if (command.endsWith('core-version')) {
    return { errno: 0, stdout: JSON.stringify({ core_version: 'fake-core' }) };
  }
  if (command.endsWith('read-config')) {
    return failConfigRead
      ? { errno: 1, stdout: '', stderr: 'read failed' }
      : { errno: 0, stdout: '' };
  }
  if (command.endsWith('read-command-args')) return { errno: 0, stdout: '' };
  if (command.endsWith('logs')) return { errno: 0, stdout: '' };
  if (command.includes('write-config')) {
    if (holdConfigSave) {
      return new Promise((resolve) => { resolveHeldConfigSave = () => resolve({ errno: 0, stdout: '{"ok":true,"message":"配置已保存"}' }); });
    }
    return { errno: 0, stdout: '{"ok":true,"message":"配置已保存"}' };
  }
  if (command.includes('start-core') && holdStartCommand) {
    return new Promise((resolve) => {
      resolveHeldStartCommand = () => {
        fakeCoreRunning = true;
        resolve({ errno: 0, stdout: '{"ok":true,"message":"core started"}' });
      };
    });
  }
  if (command.includes('start-core')) fakeCoreRunning = true;
  if (command.includes('stop-core') || command.includes('restart-core')) fakeCoreRunning = false;
  if (command.includes('write-command-args') || command.includes('remove-command-args') || command.includes('enable-boot') || command.includes('disable-boot')) {
    return { errno: 0, stdout: '{"ok":true,"message":"command completed"}' };
  }
  return { errno: 0, stdout: '{"ok":true,"message":"command completed"}' };
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
assert.equal(configEditor.value, '');
assert.match(configEditor.placeholder, /配置不存在或为空/);
fakeElements.get('editConfigBtn').click();
assert.equal(configEditor.focusCount, 1, 'the direct edit action should focus synchronously');

configEditor.value = 'first unsaved version';
configEditor.dispatch('input');
holdConfigSave = true;
fakeElements.get('saveConfigBtn').click();
await waitForFrontend();
assert.equal(fakeElements.get('saveConfigBtn').disabled, true);
configEditor.disabled = false;
configEditor.value = 'newer draft while save is pending';
configEditor.dispatch('input');
resolveHeldConfigSave();
holdConfigSave = false;
await waitForFrontend();
await waitForFrontend();
assert.equal(configEditor.value, 'newer draft while save is pending');
assert.match(fakeElements.get('configFeedback').textContent, /当前编辑框还有未保存修改/);
assert.equal(statusRequestCount, 1, 'saving a config must not trigger a process status scan');
assert.equal(appCommands.filter((command) => command.endsWith('core-version')).length, 1);

failConfigRead = true;
fakeElements.get('loadConfigBtn').click();
await waitForFrontend();
await waitForFrontend();
assert.equal(configEditor.value, 'newer draft while save is pending');
assert.match(fakeElements.get('configFeedback').textContent, /读取配置失败/);
failConfigRead = false;

holdStartCommand = true;
commandButtons[0].click();
await waitForFrontend();
assert.ok(commandButtons.every((button) => button.disabled), 'conflicting lifecycle controls should be disabled');
assert.equal(configEditor.disabled, false, 'the editor must remain usable during core operations');
resolveHeldStartCommand();
holdStartCommand = false;
await waitForFrontend();
await waitForFrontend();
assert.ok(commandButtons.every((button) => !button.disabled));

holdStatusResponse = true;
const previousStatusRequestCount = statusRequestCount;
fakeElements.get('refreshBtn').click();
fakeElements.get('refreshBtn').click();
await waitForFrontend();
assert.equal(statusRequestCount, previousStatusRequestCount + 1, 'overlapping refreshes should share one bridge request');
resolveHeldStatus();
holdStatusResponse = false;
await waitForFrontend();

console.log('module frontend interaction tests: OK');
