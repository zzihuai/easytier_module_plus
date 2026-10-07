let callbackCounter = 0;
function getUniqueCallbackName(prefix) {
  return `${prefix}_callback_${Date.now()}_${callbackCounter++}`;
}

export function exec(command, options) {
  const { timeoutMs = 30000, ...execOptions } = options || {};

  return new Promise((resolve, reject) => {
    const callbackFuncName = getUniqueCallbackName("exec");
    let settled = false;
    let cleanupTimeout;
    const timeout = setTimeout(() => {
      settled = true;
      cleanupTimeout = setTimeout(() => cleanup(callbackFuncName), 60000);
      reject(new Error("执行超时；后台命令可能仍在运行，请刷新状态后再操作"));
    }, timeoutMs);

    window[callbackFuncName] = (errno, stdout, stderr) => {
      if (settled) {
        clearTimeout(cleanupTimeout);
        cleanup(callbackFuncName);
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ errno, stdout, stderr });
      cleanup(callbackFuncName);
    };

    function cleanup(successName) {
      delete window[successName];
    }

    try {
      ksu.exec(command, JSON.stringify(execOptions), callbackFuncName);
    } catch (error) {
      settled = true;
      clearTimeout(timeout);
      reject(error);
      cleanup(callbackFuncName);
    }
  });
}

function Stdio() {
    this.listeners = {};
  }
  
  Stdio.prototype.on = function (event, listener) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  };
  
  Stdio.prototype.emit = function (event, ...args) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((listener) => listener(...args));
    }
  };
  
  function ChildProcess() {
    this.listeners = {};
    this.stdin = new Stdio();
    this.stdout = new Stdio();
    this.stderr = new Stdio();
  }
  
  ChildProcess.prototype.on = function (event, listener) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  };
  
  ChildProcess.prototype.emit = function (event, ...args) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((listener) => listener(...args));
    }
  };
  
  export function spawn(command, args, options) {
    if (typeof args === "undefined") {
      args = [];
    } else if (!(args instanceof Array)) {
        // allow for (command, options) signature
        options = args;
    }
    
    if (typeof options === "undefined") {
      options = {};
    }
  
    const child = new ChildProcess();
    const childCallbackName = getUniqueCallbackName("spawn");
    window[childCallbackName] = child;
  
    function cleanup(name) {
      delete window[name];
    }

    child.on("exit", code => {
        cleanup(childCallbackName);
    });

    try {
      ksu.spawn(
        command,
        JSON.stringify(args),
        JSON.stringify(options),
        childCallbackName
      );
    } catch (error) {
      child.emit("error", error);
      cleanup(childCallbackName);
    }
    return child;
  }

export function fullScreen(isFullScreen) {
  ksu.fullScreen(isFullScreen);
}

export function enableEdgeToEdge(enable) {
  ksu.enableEdgeToEdge(enable);
}

export function toast(message) {
  ksu.toast(message);
}

export function moduleInfo() {
  return ksu.moduleInfo();
}

export function listPackages(type) {
  try {
    return JSON.parse(ksu.listPackages(type));
  } catch (error) {
    return [];
  }
}

export function getPackagesInfo(packages) {
  try {
    if (typeof packages !== "string") {
      packages = JSON.stringify(packages);
    }
    return JSON.parse(ksu.getPackagesInfo(packages));
  } catch (error) {
    return [];
  }
}

export function exit() {
  ksu.exit();
}
