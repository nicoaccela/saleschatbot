// Dev orchestrator: start Vite, wait for it to serve, then launch Electron
// pointed at the dev server. Killing this process tears both down.
import { spawn } from "node:child_process";

const VITE_URL = "http://localhost:5173";

function log(tag, msg) {
  process.stdout.write(`\x1b[36m[${tag}]\x1b[0m ${msg}\n`);
}

// 1. Start Vite (via bunx so it resolves the local install).
const vite = spawn("bunx", ["vite"], { stdio: "inherit", env: process.env });

// 2. Poll the dev server until it responds.
async function waitForVite(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(VITE_URL);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

let electron;
const ok = await waitForVite();
if (!ok) {
  log("dev", "Vite did not come up in time — aborting.");
  vite.kill();
  process.exit(1);
}

log("dev", `Vite is up at ${VITE_URL} — launching Electron…`);

// 3. Launch Electron with the dev URL in the environment.
electron = spawn("bunx", ["electron", "."], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_DEV: "1", VITE_DEV_SERVER_URL: VITE_URL },
});

const shutdown = () => {
  try { vite.kill(); } catch {}
  try { electron && electron.kill(); } catch {}
  process.exit(0);
};

electron.on("exit", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
