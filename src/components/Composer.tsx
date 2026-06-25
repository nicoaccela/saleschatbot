import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Square, Slash, Paperclip, FolderOpen, X, FileText } from "lucide-react";
// File drag & drop is handled at the ChatPane level (covers the whole pane),
// so the composer only renders the input + attach buttons.
import type { SlashCommand } from "../lib/types";

function baseName(p: string) {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

export default function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  commands,
  attachments,
  onAttach,
  onRemoveAttach,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  commands: SlashCommand[];
  attachments: string[];
  onAttach: (directory: boolean) => void;
  onRemoveAttach: (path: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [highlight, setHighlight] = useState(0);

  const slashQuery = useMemo(() => {
    const m = value.match(/^\/(\S*)$/);
    return m ? m[1].toLowerCase() : null;
  }, [value]);

  const matches = useMemo(() => {
    if (slashQuery === null) return [];
    return commands.filter((c) => c.name.toLowerCase().includes(slashQuery)).slice(0, 8);
  }, [slashQuery, commands]);

  const pickerOpen = slashQuery !== null && matches.length > 0;

  useEffect(() => setHighlight(0), [slashQuery]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  function pick(cmd: SlashCommand) {
    onChange(`/${cmd.name} `);
    ref.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (pickerOpen) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); pick(matches[highlight]); return; }
      if (e.key === "Escape") { e.preventDefault(); onChange(value + " "); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!busy && (value.trim() || attachments.length)) onSend();
    }
  }

  return (
    <div className="composer-wrap">
      {pickerOpen && (
        <div className="slash-menu">
          <div className="slash-head"><Slash size={12} /> Commands &amp; skills</div>
          {matches.map((c, i) => (
            <div
              key={c.name}
              className={"slash-opt" + (i === highlight ? " hl" : "")}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }}
            >
              <span className="slash-name">/{c.name}</span>
              <span className="slash-desc">{c.description}</span>
            </div>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="attach-row">
          {attachments.map((p) => (
            <span className="attach-chip" key={p} title={p}>
              <FileText size={13} />
              {baseName(p)}
              <button onClick={() => onRemoveAttach(p)} title="Remove"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="composer">
        <button className="attach-btn" title="Attach files" onClick={() => onAttach(false)}>
          <Paperclip size={18} />
        </button>
        <button className="attach-btn" title="Attach a folder" onClick={() => onAttach(true)}>
          <FolderOpen size={18} />
        </button>
        <textarea
          ref={ref}
          rows={1}
          value={value}
          placeholder="Message Accela Assistant…  (type / for commands)"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
        />
        {busy ? (
          <button className="send-btn" onClick={onStop} title="Stop">
            <Square size={16} fill="#fff" />
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={onSend}
            disabled={!value.trim() && attachments.length === 0}
            title="Send"
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>
      <div className="composer-hint">
        Powered by Claude Code · Enter to send, Shift+Enter for a new line
      </div>
    </div>
  );
}
