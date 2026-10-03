/**
 * RTL Atelier - Professional Centralized Error and Event Management System.
 * Fully compatible with browser, extension pages, service workers, and content scripts.
 * Pure ES module without Node built-in dependencies.
 */

export const ERROR_LEVELS = {
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  CRITICAL: "critical",
};

export const SUBSYSTEMS = {
  ENGINE: "engine",
  CONTENT: "content",
  WORKER: "service-worker",
  POPUP: "popup",
  FONT: "font",
  STORAGE: "storage",
  ADAPTER: "adapter",
};

function safeString(value, maxLen = 300) {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}

export class ErrorManager {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 50;
    this.entries = [];
    this.listeners = new Set();
  }

  record({
    subsystem = SUBSYSTEMS.ENGINE,
    level = ERROR_LEVELS.ERROR,
    title = "System Event",
    message = "",
    details = null,
    host = "",
  }) {
    const entry = {
      id: "err_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      timestamp: Date.now(),
      subsystem,
      level,
      title: safeString(title, 100),
      message: safeString(message, 300),
      details: details ? safeString(details, 500) : null,
      host: safeString(host, 100),
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {}
    }

    return entry;
  }

  info(title, message, options = {}) {
    return this.record({ ...options, title, message, level: ERROR_LEVELS.INFO });
  }

  warn(title, message, options = {}) {
    return this.record({ ...options, title, message, level: ERROR_LEVELS.WARNING });
  }

  error(title, message, options = {}) {
    return this.record({ ...options, title, message, level: ERROR_LEVELS.ERROR });
  }

  critical(title, message, options = {}) {
    return this.record({ ...options, title, message, level: ERROR_LEVELS.CRITICAL });
  }

  captureException(error, { subsystem = SUBSYSTEMS.ENGINE, title = "Runtime Exception", host = "" } = {}) {
    const msg = error?.message || String(error || "Unknown error");
    const stack = error?.stack ? String(error.stack).slice(0, 500) : null;
    return this.record({
      subsystem,
      level: ERROR_LEVELS.ERROR,
      title,
      message: msg,
      details: stack,
      host,
    });
  }

  getEntries() {
    return [...this.entries];
  }

  clear() {
    this.entries = [];
  }

  subscribe(listener) {
    if (typeof listener === "function") {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    return () => {};
  }

  summary() {
    const counts = { info: 0, warning: 0, error: 0, critical: 0 };
    for (const e of this.entries) {
      counts[e.level] = (counts[e.level] || 0) + 1;
    }
    return {
      total: this.entries.length,
      counts,
      hasIssues: counts.error > 0 || counts.critical > 0,
      lastEvent: this.entries.length > 0 ? this.entries[this.entries.length - 1] : null,
    };
  }
}

export const globalErrors = new ErrorManager();
