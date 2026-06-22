// preload.js — safe bridge between the renderer and main. Exposes a typed-ish
// `window.accela` API; no Node access leaks into the page.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("accela", {
  platform: process.platform, // "darwin" | "win32" | "linux"

  // setup / health
  checkClaude: () => ipcRenderer.invoke("claude:check"),
  listCommands: () => ipcRenderer.invoke("commands:list"),

  // settings
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),

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
