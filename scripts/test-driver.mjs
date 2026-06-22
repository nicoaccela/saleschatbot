// Isolated test of the Claude Code driver — no Electron needed.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { runTurn, checkClaude } = require("../electron/claude.js");

console.log("checkClaude:", await checkClaude());

let deltas = 0;
let firstDeltaAt = null;
const start = Date.now();

const res = await runTurn({
  prompt: "Reply with exactly: PONG. Then nothing else.",
  model: "haiku",
  toolMode: "readonly",
  onEvent: (e) => {
    if (e.type === "init") console.log("[init] session:", e.sessionId);
    if (e.type === "delta") {
      deltas++;
      if (!firstDeltaAt) firstDeltaAt = Date.now() - start;
    }
    if (e.type === "error") console.log("[error]", e.message);
  },
});

console.log("---- RESULT ----");
console.log("text:", JSON.stringify(res.text));
console.log("sessionId:", res.sessionId);
console.log("deltas streamed:", deltas, "| first delta @", firstDeltaAt, "ms");
console.log("error:", res.error || "none");

// Second turn: resume the session to prove multi-turn memory works.
if (res.sessionId) {
  const res2 = await runTurn({
    prompt: "What did I just ask you to reply with? One word.",
    model: "haiku",
    resumeId: res.sessionId,
    toolMode: "readonly",
    onEvent: () => {},
  });
  console.log("---- RESUME TURN ----");
  console.log("text:", JSON.stringify(res2.text));
  console.log("resumed sessionId:", res2.sessionId);
}
