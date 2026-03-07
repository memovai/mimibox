import { initPyodidePool } from "./pyodide-pool.js";

let initialized = false;

export async function initSandboxes() {
  if (initialized) return;
  initialized = true;

  // Initialize Pyodide pool in background (it's slow, don't block startup)
  initPyodidePool().catch((err) => {
    console.error("Failed to initialize Pyodide pool:", err);
  });

  // QuickJS is initialized lazily on first use (it's fast)
  console.log("Sandbox manager initialized");
}
