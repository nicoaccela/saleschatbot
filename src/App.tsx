import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import SettingsPanel from "./components/SettingsPanel";
import ChatPane from "./components/ChatPane";
import SetupScreen from "./components/SetupScreen";
import type { ConversationMeta, Settings, SlashCommand } from "./lib/types";

const FONT_STACKS: Record<Settings["fontFamily"], string> = {
  "Plus Jakarta Sans": "'Plus Jakarta Sans', -apple-system, 'Segoe UI', sans-serif",
  Inter: "'Inter', -apple-system, 'Segoe UI', sans-serif",
  System: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

function applyAppearance(s: Settings) {
  const root = document.documentElement;
  root.style.setProperty("--app-font", FONT_STACKS[s.fontFamily] ?? FONT_STACKS["Plus Jakarta Sans"]);
  root.style.setProperty("--font-scale", String(s.fontScale ?? 1));
}

interface Pane {
  id: string;
  conversationId: string | null;
}

const MAX_PANES = 3;

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [claudeStatus, setClaudeStatus] = useState<{ ok: boolean; version: string | null; path: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [panes, setPanes] = useState<Pane[]>([{ id: "p0", conversationId: null }]);
  const [focusedPane, setFocusedPane] = useState("p0");

  const paneSeq = useRef(0);

  useEffect(() => {
    (async () => {
      const s = await window.accela.getSettings();
      setSettings(s);
      applyAppearance(s);
      setConversations(await window.accela.listConversations());
      window.accela.checkClaude().then((r) => setClaudeStatus({ ok: r.ok, version: r.version, path: r.path }));
      window.accela.listCommands().then(setCommands);
    })();
  }, []);

  const recheckClaude = useCallback(async () => {
    const r = await window.accela.checkClaude();
    setClaudeStatus({ ok: r.ok, version: r.version, path: r.path });
  }, []);

  const refreshList = useCallback(async () => {
    setConversations(await window.accela.listConversations());
  }, []);

  const setPaneConversation = useCallback((paneId: string, conversationId: string | null) => {
    setPanes((ps) => ps.map((p) => (p.id === paneId ? { ...p, conversationId } : p)));
  }, []);

  const openConversation = useCallback(
    (id: string) => {
      setPaneConversation(focusedPane, id);
    },
    [focusedPane, setPaneConversation],
  );

  const newChat = useCallback(async () => {
    const c = await window.accela.createConversation(settings?.model);
    await refreshList();
    setPaneConversation(focusedPane, c.id);
  }, [settings?.model, refreshList, focusedPane, setPaneConversation]);

  const deleteConversation = useCallback(
    async (id: string) => {
      await window.accela.deleteConversation(id);
      await refreshList();
      // Clear any pane showing the deleted conversation.
      setPanes((ps) => ps.map((p) => (p.conversationId === id ? { ...p, conversationId: null } : p)));
    },
    [refreshList],
  );

  const splitPane = useCallback(() => {
    setPanes((ps) => {
      if (ps.length >= MAX_PANES) return ps;
      const id = `p${++paneSeq.current}-${ps.length}`;
      setFocusedPane(id);
      return [...ps, { id, conversationId: null }];
    });
  }, []);

  const closePane = useCallback(
    (paneId: string) => {
      setPanes((ps) => {
        if (ps.length <= 1) return ps;
        const next = ps.filter((p) => p.id !== paneId);
        setFocusedPane((f) => (f === paneId ? next[0].id : f));
        return next;
      });
    },
    [],
  );

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = await window.accela.setSettings(patch);
    setSettings(next);
    applyAppearance(next);
  }, []);

  if (!settings) return null;

  // Gate: Claude Code must be installed + logged in (this app is its front-end).
  if (claudeStatus && !claudeStatus.ok) {
    return <SetupScreen detectedPath={claudeStatus.path} onRecheck={recheckClaude} />;
  }

  // Active conversation ids across all panes (for sidebar highlight).
  const activeIds = panes.map((p) => p.conversationId).filter(Boolean) as string[];

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeIds={activeIds}
        onSelect={openConversation}
        onNew={newChat}
        onDelete={deleteConversation}
        onOpenSettings={() => setShowSettings(true)}
      />

      <div className="panes">
        {panes.map((pane) => (
          <ChatPane
            key={pane.id}
            conversationId={pane.conversationId}
            settings={settings}
            commands={commands}
            isFocused={panes.length > 1 && pane.id === focusedPane}
            canClose={panes.length > 1}
            canSplit={panes.length < MAX_PANES}
            onFocus={() => setFocusedPane(pane.id)}
            onClose={() => closePane(pane.id)}
            onSplit={splitPane}
            onAssign={(id) => setPaneConversation(pane.id, id)}
            onChanged={refreshList}
          />
        ))}
      </div>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
          claudeStatus={claudeStatus}
        />
      )}
    </div>
  );
}
