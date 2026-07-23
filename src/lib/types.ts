export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
  ts: string;
  model?: string;
  attachments?: string[];
  isError?: boolean;   // render as a calm error card with a "Try again"
  detail?: string;     // raw stderr, shown under a "Show details" disclosure
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

export interface RepProfile {
  name: string;
  preferredName: string;
  title: string;
  email: string;
  phone: string;
  regions: string[];
  segment: string;
  products: string[];
  tone: string;
  responseLength: string;
  workTypes: string[];
  customPrefs: string;
  signature: string;
  timezone: string;
  usePersonalization: boolean;
}

export interface SetupState {
  completedAt: string | null;
}

export type McpTransport = "stdio" | "sse" | "http";

export interface McpServerConfig {
  id: string;
  name: string;                       // the server name; tools appear as mcp__<name>__<tool>
  transport: McpTransport;
  command?: string;                   // stdio
  args?: string[];                    // stdio
  env?: Record<string, string>;       // stdio (tokens/keys live here — userData only)
  url?: string;                       // http | sse
  headers?: Record<string, string>;   // http | sse
  enabled: boolean;
  status?: "connected" | "not-connected" | "error";
  access?: "read" | "write" | "read/write";
  note?: string;
  catalogId?: string;                 // provenance if added from the catalog
  tools?: string[];                   // tool names discovered by the last Test probe
  disabledTools?: string[];           // tools the rep switched OFF (fed to --disallowed-tools)
}

export interface McpSupport {
  mcpConfig: boolean;
  strict: boolean;
}

export interface McpTestResult {
  ok: boolean;
  tools: string[];
  error: string | null;
}

// ---- Workflows -----------------------------------------------------------
export type WorkflowGate = "none" | "wait" | "approve";
export type WorkflowStatus = "draft" | "running" | "paused" | "done" | "error";

export interface WorkflowStep {
  id: string;
  title: string;
  instructions: string;      // what the assistant should DO in this step
  skillNames: string[];      // skills primed for this step
  mcpNames: string[];        // connections this step leans on (advisory in v1)
  gate: WorkflowGate;        // pause BEFORE this step ("wait" = real-world event; "approve" = review)
}

export interface WorkflowRunLogEntry {
  stepId: string;
  title: string;
  status: "running" | "done" | "error";
  output?: string;
  error?: string;
  at: string;
}

export interface WorkflowRun {
  cursor: number;                 // index of the NEXT step to run
  claudeSessionId: string | null; // threaded across steps for memory
  status: WorkflowStatus;
  startedAt: string;
  pausedReason?: string;
  log: WorkflowRunLogEntry[];
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  run: WorkflowRun | null;
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowMeta {
  id: string;
  name: string;
  description?: string;
  stepCount: number;
  status: WorkflowStatus;
  updatedAt: string;
}

export interface WorkflowEvent {
  type: "run-start" | "step-start" | "step-delta" | "step-done" | "paused" | "done" | "error";
  workflowId: string;
  stepIndex?: number;
  stepId?: string;
  title?: string;
  text?: string;
  output?: string;
  reason?: string;
  gate?: WorkflowGate;
  message?: string;
  resumed?: boolean;
}

// ---- Schedules -----------------------------------------------------------
export type ScheduleCadence = "daily" | "weekdays" | "weekly";
export type ScheduleTargetType = "daily-prep" | "weekly-meetings" | "workflow";
export interface ScheduleTarget { type: ScheduleTargetType; workflowId?: string }

export interface Schedule {
  id: string;
  name: string;
  cadence: ScheduleCadence;
  time: string;               // "HH:MM" local
  weekday: number;            // 0-6 (weekly cadence)
  target: ScheduleTarget;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: "ok" | "error" | null;
  lastResult: string;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ScheduleEvent { type: "schedule-start" | "schedule-done"; scheduleId: string }

// ---- Fleet ---------------------------------------------------------------
export interface FleetEvent {
  type: "fleet-start" | "worker" | "fleet-done";
  fleetId: string;
  idx?: number;
  item?: string;
  status?: "running" | "done" | "error";
  text?: string;
  output?: string;
  error?: string;
  count?: number;
}

export interface Settings {
  model: string;
  fontFamily: "Plus Jakarta Sans" | "Inter" | "System";
  fontScale: number;
  toolMode: ToolMode;
  systemPrompt: string;
  profile: RepProfile;
  setup: SetupState;
  mcpServers?: McpServerConfig[];
  mcpStrict?: boolean;
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
  rawError?: string | null;
  errorKind?: string | null;
  cancelled?: boolean;
  title?: string;
}

declare global {
  interface Window {
    accela: {
      platform: string;
      pathForFile: (file: File) => string;
      checkClaude: () => Promise<{ ok: boolean; version: string | null; path: string }>;
      listCommands: () => Promise<SlashCommand[]>;
      getSettings: () => Promise<Settings>;
      setSettings: (patch: Partial<Settings>) => Promise<Settings>;
      listMcpServers: () => Promise<McpServerConfig[]>;
      saveMcpServers: (servers: McpServerConfig[]) => Promise<McpServerConfig[]>;
      testMcpServer: (server: Partial<McpServerConfig>) => Promise<McpTestResult>;
      importMcpServers: () => Promise<Partial<McpServerConfig>[]>;
      mcpSupport: () => Promise<McpSupport>;
      readSkill: (name: string) => Promise<{ ok: boolean; content: string; path: string; error?: string }>;
      writeSkill: (name: string, content: string) => Promise<{ ok: boolean; error?: string }>;
      listWorkflows: () => Promise<WorkflowMeta[]>;
      getWorkflow: (id: string) => Promise<Workflow | null>;
      createWorkflow: (name?: string, description?: string, steps?: WorkflowStep[]) => Promise<Workflow>;
      saveWorkflow: (id: string, patch: { name?: string; description?: string; steps?: WorkflowStep[]; model?: string }) => Promise<Workflow | null>;
      deleteWorkflow: (id: string) => Promise<boolean>;
      draftWorkflow: (description: string) => Promise<{ ok: boolean; workflow?: Workflow; error?: string }>;
      startWorkflow: (id: string) => Promise<{ ok: boolean; error?: string }>;
      resumeWorkflow: (id: string) => Promise<{ ok: boolean; error?: string }>;
      cancelWorkflow: (id: string) => Promise<{ ok: boolean; error?: string }>;
      onWorkflowEvent: (cb: (e: WorkflowEvent) => void) => () => void;
      listSchedules: () => Promise<Schedule[]>;
      createSchedule: (data: Partial<Schedule>) => Promise<Schedule>;
      saveSchedule: (id: string, patch: Partial<Schedule>) => Promise<Schedule | null>;
      deleteSchedule: (id: string) => Promise<boolean>;
      runSchedule: (id: string) => Promise<{ ok: boolean; error?: string }>;
      onScheduleEvent: (cb: (e: ScheduleEvent) => void) => () => void;
      startFleet: (fleetId: string, task: string, items: string[]) => Promise<{ ok: boolean; error?: string; count?: number }>;
      cancelFleet: (fleetId: string) => Promise<{ ok: boolean }>;
      onFleetEvent: (cb: (e: FleetEvent) => void) => () => void;
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
      openExternal: (url: string) => Promise<void>;
      onChatEvent: (cb: (e: ChatEvent) => void) => () => void;
    };
  }
}
