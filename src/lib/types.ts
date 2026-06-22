export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
  ts: string;
  model?: string;
  attachments?: string[];
}

export interface ConversationMeta {
  id: string;
  title: string;
  model: string;
  updatedAt: string;
  createdAt: string;
  messageCount: number;
}

export interface Conversation extends ConversationMeta {
  titled: boolean;
  claudeSessionId: string | null;
  selectedSkills?: string[];
  messages: Message[];
}

export type ToolMode = "chat" | "readonly" | "agent";

export interface SlashCommand {
  name: string;
  description: string;
  kind: "skill" | "command";
  source: string;
}

export interface Settings {
  model: string;
  fontFamily: "Plus Jakarta Sans" | "Inter" | "System";
  fontScale: number;
  toolMode: ToolMode;
  systemPrompt: string;
}

export interface ChatEvent {
  type: "start" | "init" | "delta" | "done" | "error";
  requestId: string;
  conversationId: string;
  text?: string;
  message?: string;
  sessionId?: string | null;
}

export interface SendResult {
  requestId?: string;
  conversationId?: string;
  text?: string;
  sessionId?: string | null;
  error?: string | null;
  title?: string;
}

declare global {
  interface Window {
    accela: {
      platform: string;
      checkClaude: () => Promise<{ ok: boolean; version: string | null; path: string }>;
      listCommands: () => Promise<SlashCommand[]>;
      getSettings: () => Promise<Settings>;
      setSettings: (patch: Partial<Settings>) => Promise<Settings>;
      listConversations: () => Promise<ConversationMeta[]>;
      getConversation: (id: string) => Promise<Conversation | null>;
      createConversation: (model?: string) => Promise<Conversation>;
      deleteConversation: (id: string) => Promise<boolean>;
      renameConversation: (id: string, title: string) => Promise<Conversation | null>;
      setConversationSkills: (id: string, skills: string[]) => Promise<Conversation | null>;
      pickPaths: (opts?: { directory?: boolean }) => Promise<string[]>;
      sendMessage: (payload: {
        conversationId: string;
        text: string;
        model?: string;
        attachments?: string[];
      }) => Promise<SendResult>;
      stop: (requestId: string) => Promise<boolean>;
      onChatEvent: (cb: (e: ChatEvent) => void) => () => void;
    };
  }
}
