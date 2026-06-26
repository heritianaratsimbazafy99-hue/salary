// Node's native WebStorage emits a warning when auth-js probes localStorage
// without a --localstorage-file. Tests do not rely on persisted browser storage.
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: undefined,
});
