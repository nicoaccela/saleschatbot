// store.js — local persistence for conversations + settings.
// Plain JSON files under Electron's userData dir. No native deps (keeps Electron
// rebuilds painless). Each conversation is one file: conversations/<id>.json.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

let baseDir = null;
let convDir = null;
let workflowsDir = null;
let schedulesDir = null;
let settingsPath = null;

function init(userDataDir) {
  baseDir = userDataDir;
  convDir = path.join(baseDir, "conversations");
  workflowsDir = path.join(baseDir, "workflows");
  schedulesDir = path.join(baseDir, "schedules");
  settingsPath = path.join(baseDir, "settings.json");
  fs.mkdirSync(convDir, { recursive: true });
  fs.mkdirSync(workflowsDir, { recursive: true });
  fs.mkdirSync(schedulesDir, { recursive: true });
}

// Atomic JSON write (temp + rename) — used by the autonomous workflow writers so
// a crash mid-write can't corrupt a file.
function writeJsonAtomic(p, obj) {
  const tmp = `${p}.tmp-${crypto.randomUUID().slice(0, 8)}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

function uid() {
  return crypto.randomUUID();
}

function nowISO() {
  return new Date().toISOString();
}

// ---- Settings -------------------------------------------------------------

const DEFAULT_SETTINGS = {
  model: "opus",                 // opus | sonnet | haiku
  fontFamily: "Plus Jakarta Sans", // Plus Jakarta Sans | Inter | System
  fontScale: 1.0,                // 0.9–1.3 reading-size multiplier
  toolMode: "agent",             // chat | readonly | agent — default to cockpit so reps aren't blocked by approval prompts; "Safe" is an option
  systemPrompt:
    "You are Accela Assistant, a helpful AI for an Accela sales engineer. " +
    "Be concise, clear, and friendly. Favor plain language a non-technical " +
    "government buyer would understand; format with short headings and bullets. " +
    "You have access to the user's Claude Code skills (e.g. /account-brief, " +
    "/sales-workspace, /accela-deck, /pursuit-qualify, /salesforce-mcp) and a " +
    "fleet of subagents (account-researcher, pursuit-prospector, rfp-analyst, " +
    "competitive-intel, deck-smith). When a request matches one, use it. If the " +
    "user types a /command, run it.",

  // App-managed MCP servers (Gong, Salesforce, Calendar, Slack…). Array of
  // McpServerConfig; enabled ones are injected into each turn's --mcp-config.
  // Lives here in userData only — never bundled, never written to ~/.claude.json.
  mcpServers: [],
  mcpStrict: false,              // lock turns to ONLY app-managed servers (--strict-mcp-config)
  gettingStartedSeen: false,     // dismissed the first-launch getting-started explainer

  // Rep profile + preferences captured in the run-once onboarding; personalizes every turn.
  profile: {
    name: "", preferredName: "", title: "", email: "", phone: "",
    regions: [],                 // states (multi)
    segment: "",                 // "0-100K" (Account Executive) | "100K+" (Account Director)
    products: ["Accela"],
    tone: "",                    // preferred tone
    responseLength: "",          // length-scale label (Extremely short … Extremely long)
    workTypes: [],               // kinds of work they do with AI
    customPrefs: "",             // free-text preferences
    signature: "", timezone: "",
    usePersonalization: true,
  },
  // Run-once setup latch — completedAt (ISO) is the ONLY signal onboarding ran.
  setup: { completedAt: null },
};

// Merge a saved settings blob over defaults, deep-merging the nested profile/
// setup objects so an older or partial file never drops defaulted sub-fields.
function withDefaults(raw) {
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    profile: { ...DEFAULT_SETTINGS.profile, ...(raw && raw.profile) },
    setup: { ...DEFAULT_SETTINGS.setup, ...(raw && raw.setup) },
  };
}

function getSettings() {
  try {
    return withDefaults(JSON.parse(fs.readFileSync(settingsPath, "utf8")));
  } catch {
    return withDefaults({});
  }
}

function setSettings(patch) {
  const cur = getSettings();
  const next = { ...cur, ...patch };
  // Patch profile/setup field-by-field so updating one field (or just the
  // completedAt latch) never clobbers the rest of the object.
  if (patch && patch.profile) next.profile = { ...cur.profile, ...patch.profile };
  if (patch && patch.setup) next.setup = { ...cur.setup, ...patch.setup };
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2));
  return next;
}

// ---- MCP servers ----------------------------------------------------------
// Stored inside settings.json under `mcpServers`. A dedicated setter re-reads
// the whole settings blob then writes the full array back, so it never races
// with (or gets clobbered by) a concurrent profile/setup patch from setSettings.

function getMcpServers() {
  const s = getSettings();
  return Array.isArray(s.mcpServers) ? s.mcpServers : [];
}

function setMcpServers(servers) {
  const cur = getSettings();
  cur.mcpServers = Array.isArray(servers) ? servers : [];
  fs.writeFileSync(settingsPath, JSON.stringify(cur, null, 2));
  return cur.mcpServers;
}

// ---- Conversations --------------------------------------------------------

function convPath(id) {
  return path.join(convDir, `${id}.json`);
}

function createConversation(model) {
  const conv = {
    id: uid(),
    title: "New chat",
    titled: false,            // becomes true once we auto-title from first msg
    model: model || getSettings().model,
    claudeSessionId: null,    // set after first turn; used for --resume
    selectedSkills: [],       // skill names primed for this conversation
    createdAt: nowISO(),
    updatedAt: nowISO(),
    messages: [],             // {id, role:"user"|"assistant", content, ts, model?}
  };
  saveConversation(conv);
  return conv;
}

function saveConversation(conv) {
  conv.updatedAt = nowISO();
  fs.writeFileSync(convPath(conv.id), JSON.stringify(conv, null, 2));
  return conv;
}

function getConversation(id) {
  try {
    return JSON.parse(fs.readFileSync(convPath(id), "utf8"));
  } catch {
    return null;
  }
}

function listConversations() {
  let files = [];
  try {
    files = fs.readdirSync(convDir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const metas = [];
  for (const f of files) {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(convDir, f), "utf8"));
      metas.push({
        id: c.id,
        title: c.title,
        model: c.model,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
        messageCount: (c.messages || []).length,
      });
    } catch { /* skip corrupt file */ }
  }
  metas.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return metas;
}

function deleteConversation(id) {
  try { fs.unlinkSync(convPath(id)); return true; } catch { return false; }
}

function renameConversation(id, title) {
  const c = getConversation(id);
  if (!c) return null;
  c.title = title;
  c.titled = true;
  return saveConversation(c);
}

function setConversationSkills(id, skills) {
  const c = getConversation(id);
  if (!c) return null;
  c.selectedSkills = Array.isArray(skills) ? skills : [];
  return saveConversation(c);
}

function appendMessage(id, message) {
  const c = getConversation(id);
  if (!c) return null;
  const msg = { id: uid(), ts: nowISO(), ...message };
  c.messages.push(msg);
  saveConversation(c);
  return { conversation: c, message: msg };
}

// ---- Workflows ------------------------------------------------------------
// One JSON file per workflow. Definition (name/steps) and run-state are updated
// by SEPARATE setters that each read-modify-write the whole file, so the engine
// flushing run-state and the rep editing steps can't silently clobber each other.

function normalizeStep(s) {
  return {
    id: (s && s.id) || uid(),
    title: (s && s.title) || "Step",
    instructions: (s && s.instructions) || "",
    skillNames: Array.isArray(s && s.skillNames) ? s.skillNames : [],
    mcpNames: Array.isArray(s && s.mcpNames) ? s.mcpNames : [],
    gate: s && ["none", "wait", "approve"].includes(s.gate) ? s.gate : "none",
  };
}

function wfPath(id) {
  return path.join(workflowsDir, `${id}.json`);
}

function createWorkflow(name, description, steps) {
  const wf = {
    id: uid(),
    name: name || "New workflow",
    description: description || "",
    steps: (Array.isArray(steps) ? steps : []).map(normalizeStep),
    run: null,
    model: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  writeJsonAtomic(wfPath(wf.id), wf);
  return wf;
}

function getWorkflow(id) {
  try { return JSON.parse(fs.readFileSync(wfPath(id), "utf8")); } catch { return null; }
}

function listWorkflows() {
  let files = [];
  try { files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith(".json")); } catch { return []; }
  const metas = [];
  for (const f of files) {
    try {
      const w = JSON.parse(fs.readFileSync(path.join(workflowsDir, f), "utf8"));
      metas.push({
        id: w.id, name: w.name, description: w.description,
        stepCount: (w.steps || []).length,
        status: (w.run && w.run.status) || "draft",
        updatedAt: w.updatedAt,
      });
    } catch { /* skip corrupt file */ }
  }
  metas.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return metas;
}

// Update the DEFINITION only (never touches run-state).
function saveWorkflowDef(id, patch) {
  const w = getWorkflow(id);
  if (!w) return null;
  if (typeof patch.name === "string") w.name = patch.name;
  if (typeof patch.description === "string") w.description = patch.description;
  if (Array.isArray(patch.steps)) w.steps = patch.steps.map(normalizeStep);
  if (patch.model !== undefined) w.model = patch.model;
  w.updatedAt = nowISO();
  writeJsonAtomic(wfPath(id), w);
  return w;
}

// Update the RUN-STATE only (never touches the definition).
function setWorkflowRun(id, run) {
  const w = getWorkflow(id);
  if (!w) return null;
  w.run = run;
  w.updatedAt = nowISO();
  writeJsonAtomic(wfPath(id), w);
  return w;
}

function deleteWorkflow(id) {
  try { fs.unlinkSync(wfPath(id)); return true; } catch { return false; }
}

// ---- Schedules ------------------------------------------------------------
// One JSON file per schedule (small; stored whole). Run-state (lastRunAt etc.)
// is merged in by saveSchedule so a tick and a UI edit don't lose each other's
// fields.

function schedPath(id) { return path.join(schedulesDir, `${id}.json`); }

function createSchedule(data) {
  const d = data || {};
  const s = {
    id: uid(),
    name: d.name || "New schedule",
    cadence: ["daily", "weekdays", "weekly"].includes(d.cadence) ? d.cadence : "daily",
    time: /^\d{2}:\d{2}$/.test(d.time) ? d.time : "08:00",
    weekday: typeof d.weekday === "number" ? d.weekday : 1,
    target: d.target && typeof d.target === "object" ? d.target : { type: "daily-prep" },
    enabled: d.enabled !== false,
    lastRunAt: null,
    lastStatus: null,
    lastResult: "",
    nextRunAt: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  writeJsonAtomic(schedPath(s.id), s);
  return s;
}

function getSchedule(id) {
  try { return JSON.parse(fs.readFileSync(schedPath(id), "utf8")); } catch { return null; }
}

function listSchedules() {
  let files = [];
  try { files = fs.readdirSync(schedulesDir).filter((f) => f.endsWith(".json")); } catch { return []; }
  const out = [];
  for (const f of files) {
    try { out.push(JSON.parse(fs.readFileSync(path.join(schedulesDir, f), "utf8"))); } catch { /* skip */ }
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return out;
}

// Merge allowed config + run fields (whole-file read-modify-write).
function saveSchedule(id, patch) {
  const s = getSchedule(id);
  if (!s) return null;
  const p = patch || {};
  for (const k of ["name", "cadence", "time", "weekday", "target", "enabled", "lastRunAt", "lastStatus", "lastResult", "nextRunAt"]) {
    if (p[k] !== undefined) s[k] = p[k];
  }
  s.updatedAt = nowISO();
  writeJsonAtomic(schedPath(id), s);
  return s;
}

function deleteSchedule(id) {
  try { fs.unlinkSync(schedPath(id)); return true; } catch { return false; }
}

// Derive a short title from the first user message.
function titleFrom(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? clean.slice(0, 48) + "…" : clean || "New chat";
}

// Build a short personalization preamble from the rep profile, prepended to the
// system prompt each turn (gated on the personalization switch + an identity).
function profilePreamble(profile) {
  if (!profile || !profile.usePersonalization) return "";
  const who = profile.name || profile.email;
  if (!who) return "";
  const role = profile.segment === "100K+" ? "Account Director"
    : profile.segment === "0-100K" ? "Account Executive" : "";
  const L = [];
  L.push(`${who}${profile.title ? `, ${profile.title}` : role ? `, ${role}` : ""}${profile.email && profile.name ? ` (${profile.email})` : ""} — an Accela sales rep.`);
  if (Array.isArray(profile.regions) && profile.regions.length) L.push(`Territory: ${profile.regions.join(", ")}.`);
  if (profile.segment) L.push(`Segment: ${profile.segment === "100K+" ? "100K+ population (Account Director)" : "0–100K population (Account Executive)"}.`);
  if (Array.isArray(profile.products) && profile.products.length) L.push(`Sells: ${profile.products.join(", ")}.`);
  if (Array.isArray(profile.workTypes) && profile.workTypes.length) L.push(`Frequent work with you: ${profile.workTypes.join(", ")}.`);
  if (profile.tone) L.push(`Preferred tone: ${profile.tone}.`);
  if (profile.responseLength) L.push(`Preferred response length: ${profile.responseLength}.`);
  if (profile.customPrefs && profile.customPrefs.trim()) L.push(`Other preferences: ${profile.customPrefs.trim()}`);
  if (profile.signature) L.push(`When drafting emails, sign off as:\n${profile.signature}`);
  return "About the person you're assisting — honor these preferences (tone, length, kind of work) and personalize examples + territory framing:\n" +
    L.map((x) => `- ${x}`).join("\n");
}

module.exports = {
  init,
  uid,
  getSettings,
  setSettings,
  getMcpServers,
  setMcpServers,
  profilePreamble,
  DEFAULT_SETTINGS,
  createConversation,
  saveConversation,
  getConversation,
  listConversations,
  deleteConversation,
  renameConversation,
  setConversationSkills,
  appendMessage,
  titleFrom,
  createWorkflow,
  getWorkflow,
  listWorkflows,
  saveWorkflowDef,
  setWorkflowRun,
  deleteWorkflow,
  createSchedule,
  getSchedule,
  listSchedules,
  saveSchedule,
  deleteSchedule,
};
