// preload.js — safe bridge between the renderer and main. Exposes a typed-ish
// `window.accela` API; no Node access leaks into the page.

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("accela", {
  platform: process.platform, // "darwin" | "win32" | "linux"

  // Resolve a dropped File to its absolute path. Electron 32+ removed the old
  // File.path property, so webUtils.getPathForFile is now the only way.
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file) || ""; } catch { return ""; }
  },

  // setup / health
  checkClaude: () => ipcRenderer.invoke("claude:check"),
  listCommands: () => ipcRenderer.invoke("commands:list"),

  // settings
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),

  // MCP servers (app-managed registry)
  listMcpServers: () => ipcRenderer.invoke("mcp:list"),
  saveMcpServers: (servers) => ipcRenderer.invoke("mcp:save", servers),
  testMcpServer: (server) => ipcRenderer.invoke("mcp:test", server),
  importMcpServers: () => ipcRenderer.invoke("mcp:import"),
  mcpSupport: () => ipcRenderer.invoke("mcp:support"),

  // skill files (view / edit)
  readSkill: (name) => ipcRenderer.invoke("skill:read", name),
  writeSkill: (name, content) => ipcRenderer.invoke("skill:write", { name, content }),

  // workflows
  listWorkflows: () => ipcRenderer.invoke("workflow:list"),
  getWorkflow: (id) => ipcRenderer.invoke("workflow:get", id),
  createWorkflow: (name, description, steps) => ipcRenderer.invoke("workflow:create", { name, description, steps }),
  saveWorkflow: (id, patch) => ipcRenderer.invoke("workflow:save", { id, patch }),
  deleteWorkflow: (id) => ipcRenderer.invoke("workflow:delete", id),
  draftWorkflow: (description) => ipcRenderer.invoke("workflow:draft", description),
  startWorkflow: (id) => ipcRenderer.invoke("workflow:start", id),
  resumeWorkflow: (id) => ipcRenderer.invoke("workflow:resume", id),
  cancelWorkflow: (id) => ipcRenderer.invoke("workflow:cancel", id),
  onWorkflowEvent: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("workflow:event", handler);
    return () => ipcRenderer.removeListener("workflow:event", handler);
  },

  // schedules
  listSchedules: () => ipcRenderer.invoke("schedule:list"),
  createSchedule: (data) => ipcRenderer.invoke("schedule:create", data),
  saveSchedule: (id, patch) => ipcRenderer.invoke("schedule:save", { id, patch }),
  deleteSchedule: (id) => ipcRenderer.invoke("schedule:delete", id),
  runSchedule: (id) => ipcRenderer.invoke("schedule:run", id),
  onScheduleEvent: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("schedule:event", handler);
    return () => ipcRenderer.removeListener("schedule:event", handler);
  },

  // fleet (parallel agents)
  startFleet: (fleetId, task, items) => ipcRenderer.invoke("fleet:start", { fleetId, task, items }),
  cancelFleet: (fleetId) => ipcRenderer.invoke("fleet:cancel", fleetId),
  onFleetEvent: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("fleet:event", handler);
    return () => ipcRenderer.removeListener("fleet:event", handler);
  },

  // conversations
  listConversations: () => ipcRenderer.invoke("conv:list"),
  getConversation: (id) => ipcRenderer.invoke("conv:get", id),
  createConversation: (model) => ipcRenderer.invoke("conv:create", model),
  deleteConversation: (id) => ipcRenderer.invoke("conv:delete", id),
  renameConversation: (id, title) =>
    ipcRenderer.invoke("conv:rename", { id, title }),
  setConversationSkills: (id, skills) =>
    ipcRenderer.invoke("conv:setSkills", { id, skills }),
  setConversationDnc: (id, on) =>
    ipcRenderer.invoke("conv:setDnc", { id, on }),

  // file / folder picker
  pickPaths: (opts) => ipcRenderer.invoke("paths:pick", opts || {}),

  // open a url in the system browser
  openExternal: (url) => ipcRenderer.invoke("open:external", url),

  // chat
  sendMessage: (payload) => ipcRenderer.invoke("chat:send", payload),
  stop: (requestId) => ipcRenderer.invoke("chat:stop", requestId),

  // streaming events: cb({type, requestId, conversationId, text?, ...})
  onChatEvent: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("chat:event", handler);
    return () => ipcRenderer.removeListener("chat:event", handler);
  },
});
