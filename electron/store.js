// store.js — local persistence for conversations + settings.
// Plain JSON files under Electron's userData dir. No native deps (keeps Electron
// rebuilds painless). Each conversation is one file: conversations/<id>.json.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

let baseDir = null;
let convDir = null;
let settingsPath = null;

function init(userDataDir) {
  baseDir = userDataDir;
  convDir = path.join(baseDir, "conversations");
  settingsPath = path.join(baseDir, "settings.json");
  fs.mkdirSync(convDir, { recursive: true });
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
  toolMode: "agent",             // chat | readonly | agent (cockpit: skills+fleet)
  systemPrompt:
    "You are Accela Assistant, a helpful AI for an Accela sales engineer. " +
    "Be concise, clear, and friendly. Favor plain language a non-technical " +
    "government buyer would understand; format with short headings and bullets. " +
    "You have access to the user's Claude Code skills (e.g. /account-brief, " +
    "/sales-workspace, /accela-deck, /pursuit-qualify, /salesforce-mcp) and a " +
    "fleet of subagents (account-researcher, pursuit-prospector, rfp-analyst, " +
    "competitive-intel, deck-smith). When a request matches one, use it. If the " +
    "user types a /command, run it.",
};

function getSettings() {
  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2));
  return next;
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

// Derive a short title from the first user message.
function titleFrom(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? clean.slice(0, 48) + "…" : clean || "New chat";
}

module.exports = {
  init,
  uid,
  getSettings,
  setSettings,
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
};
