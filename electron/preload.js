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

  // bundled Accela skill pack
  skillPackStatus: () => ipcRenderer.invoke("skills:status"),
  installSkillPack: () => ipcRenderer.invoke("skills:install"),

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

  // conversations
  listConversations: () => ipcRenderer.invoke("conv:list"),
  getConversation: (id) => ipcRenderer.invoke("conv:get", id),
  createConversation: (model) => ipcRenderer.invoke("conv:create", model),
  deleteConversation: (id) => ipcRenderer.invoke("conv:delete", id),
  renameConversation: (id, title) =>
    ipcRenderer.invoke("conv:rename", { id, title }),
  setConversationSkills: (id, skills) =>
    ipcRenderer.invoke("conv:setSkills", { id, skills }),

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
