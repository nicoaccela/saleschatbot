import { Plus, MessageSquare, Settings as SettingsIcon, Trash2, HelpCircle, Plug } from "lucide-react";
import logoWhite from "../assets/accela-logo-white.svg";
import type { ConversationMeta } from "../lib/types";

function groupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "Previous 7 days";
  if (days <= 30) return "Previous 30 days";
  return "Older";
}

export default function Sidebar({
  conversations,
  activeIds,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings,
  onOpenHelp,
  onOpenMcp,
}: {
  conversations: ConversationMeta[];
  activeIds: string[];
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onOpenMcp: () => void;
}) {
  // Group conversations by recency for a Claude-app-like list.
  const groups: Record<string, ConversationMeta[]> = {};
  const order: string[] = [];
  for (const c of conversations) {
    const g = groupLabel(c.updatedAt);
    if (!groups[g]) {
      groups[g] = [];
      order.push(g);
    }
    groups[g].push(c);
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand">
          <img className="brand-logo" src={logoWhite} alt="Accela" />
          <span className="brand-sub">Chat</span>
        </div>
        <button className="new-chat" onClick={onNew}>
          <Plus size={17} /> New chat
        </button>
      </div>

      <div className="conv-list">
        {conversations.length === 0 && (
          <div className="conv-section-label">No conversations yet</div>
        )}
        {order.map((g) => (
          <div key={g}>
            <div className="conv-section-label">{g}</div>
            {groups[g].map((c) => (
              <div
                key={c.id}
                className={"conv-item" + (activeIds.includes(c.id) ? " active" : "")}
                onClick={() => onSelect(c.id)}
              >
                <MessageSquare size={15} />
                <span className="title">{c.title}</span>
                <button
                  className="del"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(c.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar-bottom">
        <button className="side-btn" onClick={onOpenMcp}>
          <Plug size={17} /> Connections
        </button>
        <button className="side-btn" onClick={onOpenHelp}>
          <HelpCircle size={17} /> Help &amp; setup
        </button>
        <button className="side-btn" onClick={onOpenSettings}>
          <SettingsIcon size={17} /> Settings
        </button>
      </div>
    </aside>
  );
}
