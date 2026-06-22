import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, FileText } from "lucide-react";
import type { Message } from "../lib/types";

export default function MessageBubble({
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
        ) : (
          <div className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content || ""}
            </ReactMarkdown>
            {streaming && <span className="cursor" />}
          </div>
        )}
      </div>
    </div>
  );
}
