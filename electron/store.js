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
};
