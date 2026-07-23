// engine.js — the shared turn-execution seam. Interactive chat (main.js) and,
// later, the workflow engine + scheduled sweeps all run a turn through here so
// the system-prompt assembly and the expired-session self-heal live in ONE
// place and can't drift from each other.
//
// Electron-free on purpose: a headless launchd/Task-Scheduler runner can require
// this with just claude.js + store.js (no BrowserWindow, no app).

const { runTurn } = require("./claude");

// Assemble the per-turn system prompt: rep-profile preamble (already rendered to
// a string) + the base system prompt, then activated-skill priming. Mirrors the
// original inline logic in chat:send verbatim so behavior is unchanged.
// The "Divide & Conquer" operating-mode directive. When the rep turns the mode
// on for a conversation, this is appended to the system prompt for every turn so
// the assistant decomposes big tasks and fans them out to parallel subagents
// instead of grinding sequentially. Kept here so chat + workflows + sweeps could
// all opt in through the one assembly path.
const DIVIDE_AND_CONQUER = [
  "OPERATING MODE — DIVIDE & CONQUER IS ON for this conversation.",
  "Attack substantial work by decomposing it and running the parts in parallel, not one at a time.",
  "When a request is broad or has independent parts — deep account research across many sources, parsing a long",
  "budget or document for several signals, mining a list of pursuits/leads for opportunities, multi-account or",
  "multi-section analysis — split it into independent sub-tasks and dispatch parallel subagents to cover them",
  "concurrently (your Task/subagent tools and the agent fleet: account-researcher, pursuit-prospector, rfp-analyst,",
  "competitive-intel, deck-smith). Then synthesize ONE clean, deduplicated, cross-checked answer — never dump raw",
  "agent output. Be exhaustive and verify the important claims.",
  "Use it responsibly: for a small or simple request, just answer directly — do not over-orchestrate or spin up",
  "agents for a one-line question. The goal is thoroughness on big jobs, not ceremony on small ones.",
].join(" ");

function assembleSystemPrompt({ baseSystem = "", preamble = "", activeSkills = [], registry = [], divideAndConquer = false } = {}) {
  let system = baseSystem || "";
  if (preamble) system = `${preamble}\n\n${system}`;
  if (Array.isArray(activeSkills) && activeSkills.length) {
    const byName = new Map((registry || []).map((c) => [c.name, c]));
    const lines = activeSkills
      .map((n) => { const c = byName.get(n); return c ? `- /${c.name}: ${c.description}` : `- /${n}`; })
      .join("\n");
    system +=
      `\n\nThe rep has activated these skills for this conversation — prioritize them and invoke directly when relevant:\n${lines}`;
  }
  if (divideAndConquer) system += `\n\n${DIVIDE_AND_CONQUER}`;
  return system;
}

// Run ONE turn with a transparent self-heal of a pruned/expired Claude session:
// on sessionNotFound, drop the dead id (via onSessionExpired) and retry once
// fresh (no --resume) so the caller gets an answer, not a hard error.
// isCancelled() lets the caller skip the retry when the user Stopped between the
// two spawns. Every other option is forwarded to runTurn unchanged, so a fresh
// temp mcp-config/system-prompt file is written + cleaned up per spawn.
async function runStep(opts) {
  const { onSessionExpired, isCancelled, ...runOpts } = opts || {};
  const stopped = () => (typeof isCancelled === "function" ? !!isCancelled() : false);
  let result = await runTurn(runOpts);
  if (result.sessionNotFound && runOpts.resumeId && !stopped()) {
    if (typeof onSessionExpired === "function") {
      try { onSessionExpired(); } catch { /* best-effort */ }
    }
    result = await runTurn({ ...runOpts, resumeId: null });
  }
  return result;
}

module.exports = { assembleSystemPrompt, runStep };
