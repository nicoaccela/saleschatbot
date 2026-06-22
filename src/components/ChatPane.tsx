import { useCallback, useEffect, useRef, useState } from "react";
import { SplitSquareHorizontal, X as XIcon, Sparkles } from "lucide-react";
import MessageBubble from "./MessageBubble";
import Composer from "./Composer";
import ModelPicker from "./ModelPicker";
import SkillsPanel from "./SkillsPanel";
import logoDark from "../assets/accela-logo-dark.svg";
import type { ChatEvent, Conversation, Settings, SlashCommand } from "../lib/types";
import { skillLabel } from "../lib/presets";

let paneSeq = 0;

export default function ChatPane({
  conversationId,
  settings,
  commands,
  isFocused,
  canClose,
  canSplit,
  onFocus,
  onClose,
  onSplit,
  onAssign,
  onChanged,
}: {
  conversationId: string | null;
  settings: Settings;
  commands: SlashCommand[];
  isFocused: boolean;
  canClose: boolean;
  canSplit: boolean;
  onFocus: () => void;
  onClose: () => void;
  onSplit: () => void;
  onAssign: (id: string) => void;
  onChanged: () => void;
}) {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [model, setModel] = useState(settings.model);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [showSkills, setShowSkills] = useState(false);

  const convIdRef = useRef<string | null>(conversationId);
  const requestIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);
  const localId = (p: string) => `${p}-${++paneSeq}-${++seqRef.current}`;

  convIdRef.current = conv?.id ?? null;

  // Load when the externally-selected conversation changes.
  useEffect(() => {
    if (conversationId === (conv?.id ?? null)) return;
    if (!conversationId) {
      setConv(null);
      setStreamText("");
      return;
    }
    window.accela.getConversation(conversationId).then((c) => {
      setConv(c);
      setStreamText("");
      setModel(c?.model || settings.model);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Stream subscription — filter to THIS pane's conversation.
  useEffect(() => {
    const off = window.accela.onChatEvent((e: ChatEvent) => {
      if (e.conversationId !== convIdRef.current) return;
      if (e.type === "start") {
        requestIdRef.current = e.requestId;
        setStreamText("");
      } else if (e.type === "delta") {
        setStreamText((t) => t + (e.text || ""));
      }
    });
    return off;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv?.messages.length, streamText]);

  const ensureConv = useCallback(async (): Promise<Conversation> => {
    if (conv) return conv;
    const c = await window.accela.createConversation(model);
    setConv(c);
    onAssign(c.id);
    onChanged();
    return c;
  }, [conv, model, onAssign, onChanged]);

  async function handleSend() {
    if (busy) return;
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    const current = await ensureConv();
    const sentAttachments = attachments;

    const optimistic: Conversation = {
      ...current,
      messages: [
        ...current.messages,
        {
          id: localId("tmp"),
          role: "user",
          content: text,
          ts: new Date().toISOString(),
          attachments: sentAttachments,
        },
      ],
    };
    setConv(optimistic);
    setInput("");
    setAttachments([]);
    setBusy(true);
    setStreamText("");

    const appendError = (msg: string) =>
      setConv((c) =>
        c ? { ...c, messages: [...c.messages, { id: localId("err"), role: "assistant", content: `⚠️ ${msg}`, ts: new Date().toISOString() }] } : c,
      );

    try {
      const res = await window.accela.sendMessage({
        conversationId: current.id,
        text,
        model,
        attachments: sentAttachments,
      });
      const fresh = await window.accela.getConversation(current.id);
      if (fresh) setConv(fresh);
      if (res?.error) appendError(res.error);
    } catch (err) {
      appendError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setStreamText("");
      requestIdRef.current = null;
      onChanged();
    }
  }

  async function handleStop() {
    const id = requestIdRef.current;
    setBusy(false);
    setStreamText("");
    requestIdRef.current = null;
    if (id) await window.accela.stop(id);
  }

  async function onAttach(directory: boolean) {
    const paths = await window.accela.pickPaths({ directory });
    if (paths.length) addPaths(paths);
  }
  function addPaths(paths: string[]) {
    setAttachments((a) => Array.from(new Set([...a, ...paths])));
  }
  function removeAttach(p: string) {
    setAttachments((a) => a.filter((x) => x !== p));
  }

  async function openSkills() {
    await ensureConv();
    setShowSkills(true);
  }
  async function toggleSkill(name: string) {
    const c = conv ?? (await ensureConv());
    const cur = c.selectedSkills ?? [];
    const next = cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name];
    const updated = await window.accela.setConversationSkills(c.id, next);
    if (updated) setConv(updated);
  }
  async function clearSkills() {
    if (!conv) return;
    const updated = await window.accela.setConversationSkills(conv.id, []);
    if (updated) setConv(updated);
  }

  const messages = conv?.messages ?? [];
  const showStreaming = busy && streamText.length > 0;
  const activeSkills = conv?.selectedSkills ?? [];

  return (
    <section className={"pane" + (isFocused ? " focused" : "")} onMouseDown={onFocus}>
      <div className="topbar">
        <div className="conv-title">{conv?.title ?? "New chat"}</div>
        <div className="topbar-actions">
          <button
            className={"skills-btn" + (activeSkills.length ? " on" : "")}
            onClick={openSkills}
            title="Activate skills"
          >
            <Sparkles size={15} />
            {activeSkills.length > 0 ? `${activeSkills.length} skills` : "Skills"}
          </button>
          <ModelPicker value={model} onChange={setModel} />
          {canSplit && (
            <button className="icon-btn" title="Split right" onClick={onSplit}>
              <SplitSquareHorizontal size={17} />
            </button>
          )}
          {canClose && (
            <button className="icon-btn" title="Close pane" onClick={onClose}>
              <XIcon size={17} />
            </button>
          )}
        </div>
      </div>

      {activeSkills.length > 0 && (
        <div className="active-skills">
          {activeSkills.map((n) => (
            <span className="skill-pill" key={n}>{skillLabel(n)}</span>
          ))}
        </div>
      )}

      <div className="scroll" ref={scrollRef}>
        {messages.length === 0 && !showStreaming ? (
          <div className="welcome">
            <img className="welcome-logo" src={logoDark} alt="Accela" />
            <h1>How can I help with your deal today?</h1>
            <p>
              Ask about an account, attach a file or folder, activate skills, or
              split the view to work two deals at once — powered by Claude Code.
            </p>
          </div>
        ) : (
          <div className="thread">
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              if (showStreaming && isLast && m.role === "user") {
                return (
                  <div key={m.id + "-streamwrap"}>
                    <MessageBubble message={m} />
                    <MessageBubble
                      message={{ id: "stream", role: "assistant", content: streamText, ts: new Date().toISOString() }}
                      streaming
                    />
                  </div>
                );
              }
              return <MessageBubble key={m.id} message={m} />;
            })}
            {busy && !showStreaming && (
              <MessageBubble
                message={{ id: "thinking", role: "assistant", content: "", ts: new Date().toISOString() }}
                streaming
              />
            )}
          </div>
        )}
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSend={handleSend}
        onStop={handleStop}
        busy={busy}
        commands={commands}
        attachments={attachments}
        onAttach={onAttach}
        onAddPaths={addPaths}
        onRemoveAttach={removeAttach}
      />

      {showSkills && conv && (
        <SkillsPanel
          commands={commands}
          selected={activeSkills}
          onToggle={toggleSkill}
          onClear={clearSkills}
          onClose={() => setShowSkills(false)}
          convTitle={conv.title}
        />
      )}
    </section>
  );
}
