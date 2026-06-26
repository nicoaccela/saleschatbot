import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SplitSquareHorizontal, X as XIcon, Sparkles, Upload } from "lucide-react";
import MessageBubble from "./MessageBubble";
import Composer from "./Composer";
import ModelPicker from "./ModelPicker";
import SkillsPanel from "./SkillsPanel";
import logoDark from "../assets/accela-logo-dark.svg";
import type { ChatEvent, Conversation, Settings, SlashCommand } from "../lib/types";
import { skillLabel } from "../lib/presets";

let paneSeq = 0;

// Ephemeral preview bubbles (live stream / "thinking") never display a
// timestamp and are replaced by the persisted message on completion — so use a
// constant instead of allocating a new Date on every streamed frame.
const PREVIEW_TS = "";

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
  seed,
  onSeedConsumed,
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
  seed?: string | null;
  onSeedConsumed?: () => void;
}) {
  const [conv, setConv] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [model, setModel] = useState(settings.model);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [showSkills, setShowSkills] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // dragenter/leave fire for every child element, so count depth to know when
  // the cursor has truly left the pane.
  const dragDepth = useRef(0);

  const convIdRef = useRef<string | null>(conversationId);
  const requestIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);
  const localId = (p: string) => `${p}-${++paneSeq}-${++seqRef.current}`;

  // Buffer for coalescing stream deltas (see the stream subscription below).
  const pendingRef = useRef("");
  const rafRef = useRef<number | null>(null);
  // True only between this pane firing a send and adopting that turn's "start"
  // event. IPC broadcasts every event to every pane, so when the same
  // conversation is open in two panes this flag ensures only the initiating
  // pane consumes the turn's deltas (no duplicate render / double parse).
  const expectingRef = useRef(false);

  convIdRef.current = conv?.id ?? null;

  // Cancel any queued flush, drop buffered text, forget the active request, and
  // clear the live stream. Called at every turn boundary (send / finish / stop /
  // conversation switch) so a queued frame or a trailing delta from a finished
  // or stopped turn can't append stale text — to this conversation or the next.
  const clearStream = useCallback(() => {
    pendingRef.current = "";
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    requestIdRef.current = null;
    expectingRef.current = false;
    setStreamText("");
  }, []);

  // Load when the externally-selected conversation changes.
  useEffect(() => {
    if (conversationId === (conv?.id ?? null)) return;
    // Reset synchronously, BEFORE the async load, so any frame or delta still in
    // flight for the previous conversation can't bleed into the one we switch to.
    clearStream();
    if (!conversationId) {
      setConv(null);
      return;
    }
    window.accela.getConversation(conversationId).then((c) => {
      setConv(c);
      setModel(c?.model || settings.model);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Stream subscription — filter to THIS pane's conversation. Deltas arrive
  // very frequently (partial messages, unthrottled over IPC), and each one
  // would otherwise trigger a render that re-parses the whole growing reply's
  // markdown — O(n²) and the main source of jank on low-end hardware. So we
  // buffer incoming text and flush at most once per animation frame.
  useEffect(() => {
    const flush = () => {
      rafRef.current = null;
      const chunk = pendingRef.current;
      if (!chunk) return;
      pendingRef.current = "";
      setStreamText((t) => t + chunk);
    };
    const off = window.accela.onChatEvent((e: ChatEvent) => {
      if (e.conversationId !== convIdRef.current) return;
      if (e.type === "start") {
        // Only the pane that fired this send adopts the turn (see expectingRef).
        if (!expectingRef.current) return;
        expectingRef.current = false;
        requestIdRef.current = e.requestId;
        pendingRef.current = "";
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        setStreamText("");
      } else if (e.type === "delta") {
        // Drop trailing deltas from a finished/stopped turn (requestIdRef is
        // nulled by clearStream) or from a turn this pane didn't initiate.
        if (e.requestId !== requestIdRef.current) return;
        pendingRef.current += e.text || "";
        if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush);
      }
    });
    return () => {
      off();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Jump to the newest message on load and whenever a message is added.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv?.messages.length]);

  // While streaming, only auto-follow if the user is already near the bottom —
  // so they can scroll up to read without being yanked back down each frame
  // (this fires ~once per animation frame thanks to the delta coalescing).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !streamText) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [streamText]);

  // Seed the composer from a Help action (the rep reviews, then hits send).
  useEffect(() => {
    if (seed) {
      setInput(seed);
      onSeedConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

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
    clearStream();

    const appendError = (msg: string) =>
      setConv((c) =>
        c ? { ...c, messages: [...c.messages, { id: localId("err"), role: "assistant", content: `⚠️ ${msg}`, ts: new Date().toISOString() }] } : c,
      );

    try {
      // Claim the turn so this pane (not another showing the same conv) adopts
      // its "start" event. Set synchronously before the IPC round-trip.
      expectingRef.current = true;
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
      clearStream();
      onChanged();
    }
  }

  async function handleStop() {
    const id = requestIdRef.current;
    setBusy(false);
    clearStream();
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

  // ---- Drag & drop onto the whole pane ----
  function hasFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer.types || []).includes("Files");
  }
  function onDragEnter(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  }
  function onDragOver(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  }
  function onDrop(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const paths: string[] = [];
    for (const f of Array.from(e.dataTransfer.files)) {
      const p = window.accela.pathForFile(f) || (f as File & { path?: string }).path || "";
      if (p) paths.push(p);
    }
    if (paths.length) addPaths(paths);
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
    <section
      className={"pane" + (isFocused ? " focused" : "")}
      onMouseDown={onFocus}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
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
                      message={{ id: "stream", role: "assistant", content: streamText, ts: PREVIEW_TS }}
                      streaming
                    />
                  </div>
                );
              }
              return <MessageBubble key={m.id} message={m} />;
            })}
            {busy && !showStreaming && (
              <MessageBubble
                message={{ id: "thinking", role: "assistant", content: "", ts: PREVIEW_TS }}
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
        onRemoveAttach={removeAttach}
      />

      {dragOver && (
        <div className="drop-overlay">
          <div className="drop-card">
            <Upload size={26} />
            <strong>Drop to attach</strong>
            <span>Files &amp; folders will be added to this chat</span>
          </div>
        </div>
      )}

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
