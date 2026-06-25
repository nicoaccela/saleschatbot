import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, FileText } from "lucide-react";
import type { Message } from "../lib/types";

// Hoisted to avoid a fresh array allocation on every render. (The real re-parse
// avoidance comes from React.memo skipping idle bubbles below — react-markdown's
// default component re-parses on every render it actually runs, regardless of
// plugin-array identity.)
const REMARK_PLUGINS = [remarkGfm];

function MessageBubble({
  message,
  streaming = false,
}: {
  message: Message;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(message.content || "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <div className="row">
      <div className={"avatar " + (isUser ? "user" : "assistant")}>
        {isUser ? "You" : "A"}
      </div>
      <div className="bubble">
        {!streaming && message.content && (
          <button className="copy-btn" onClick={copy} title="Copy">
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        <div className="who">{isUser ? "You" : "Accela Assistant"}</div>
        {isUser ? (
          <>
            <div className="md" style={{ whiteSpace: "pre-wrap" }}>
              {message.content}
            </div>
            {message.attachments && message.attachments.length > 0 && (
              <div className="attach-row" style={{ margin: "8px 0 0" }}>
                {message.attachments.map((p) => (
                  <span className="attach-chip" key={p} title={p}>
                    <FileText size={13} />
                    {p.split(/[\\/]/).pop()}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : streaming ? (
          // Live preview: render as PLAIN text (O(1) per frame) rather than
          // re-parsing the whole growing reply's markdown every animation frame
          // (which is O(n²) over the stream and the main jank source on weak
          // hardware). The fully-formatted markdown appears the instant the turn
          // completes and the persisted message renders through the branch below.
          <div className="md" style={{ whiteSpace: "pre-wrap" }}>
            {message.content}
            <span className="cursor" />
          </div>
        ) : (
          <div className="md">
            <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
              {message.content || ""}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

// Memoized: during streaming only the live bubble's props change each token, so
// every already-rendered message skips re-rendering — and, crucially, skips
// re-parsing its markdown — instead of the whole transcript re-parsing per token.
// Safe because messages are immutable once created: every change replaces the
// message object (fresh getConversation load or a spread), never mutates it in
// place. An in-place edit feature would have to replace the object too, or memo
// would show stale content.
export default memo(MessageBubble);
