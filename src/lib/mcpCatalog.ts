// Curated catalog of MCP servers a sales rep is likely to connect. These are
// generic third-party products (not Accela IP) shown as one-click "Connect"
// cards; clicking prefills the add-form so the rep just completes auth. Servers
// that don't exist yet (e.g. Gong's MCP) ship as disabled "coming soon" stubs.
//
// Where a public launch command is well-known it's prefilled; otherwise the
// entry is a template the rep finishes. Secrets go in env (stored in userData).

import type { McpTransport } from "./types";

export interface CatalogEnvKey {
  key: string;
  label: string;
  placeholder?: string;
}

export interface CatalogEntry {
  id: string;
  name: string;            // default server name (tools appear as mcp__<name>__tool)
  label: string;
  blurb: string;
  access: "read" | "write" | "read/write";
  available: boolean;      // false = coming soon (Connect disabled)
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  envKeys?: CatalogEnvKey[];
  note?: string;
  docsUrl?: string;
}

export const MCP_CATALOG: CatalogEntry[] = [
  {
    id: "gong",
    name: "gong",
    label: "Gong",
    blurb: "Call recordings, transcripts & deal intelligence.",
    access: "read",
    available: false,
    transport: "http",
    note: "Connect once your Gong workspace enables its MCP endpoint. This is a placeholder until then.",
    docsUrl: "https://www.gong.io",
  },
  {
    id: "salesforce",
    name: "salesforce",
    label: "Salesforce",
    blurb: "Accounts, opportunities & MEDDPICC fields (read-only today).",
    access: "read",
    available: true,
    transport: "stdio",
    command: "",
    note: "Read-only for now. If you already use a Salesforce MCP in Claude Code, use “Import from Claude Code” instead of filling this in.",
  },
  {
    id: "google-calendar",
    name: "google-calendar",
    label: "Google Calendar",
    blurb: "Your meetings — the trigger for prep & sweeps.",
    access: "read",
    available: true,
    transport: "stdio",
    command: "",
    note: "Point this at your Google Calendar MCP server command, then Connect.",
  },
  {
    id: "gmail",
    name: "gmail",
    label: "Gmail",
    blurb: "Read threads & draft follow-ups.",
    access: "read/write",
    available: true,
    transport: "stdio",
    command: "",
    note: "Set the command for your Gmail MCP server.",
  },
  {
    id: "outlook",
    name: "outlook",
    label: "Outlook / Microsoft 365",
    blurb: "Calendar + mail for M365 shops.",
    access: "read",
    available: true,
    transport: "stdio",
    command: "",
    note: "Set the command for your Microsoft Graph / Outlook MCP server.",
  },
  {
    id: "slack",
    name: "slack",
    label: "Slack",
    blurb: "Post updates & pull channel context.",
    access: "read/write",
    available: true,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    envKeys: [
      { key: "SLACK_BOT_TOKEN", label: "Bot token", placeholder: "xoxb-…" },
      { key: "SLACK_TEAM_ID", label: "Team ID", placeholder: "T…" },
    ],
    note: "Verify the package name for your environment before connecting.",
  },
  {
    id: "zoom",
    name: "zoom",
    label: "Zoom",
    blurb: "Meeting recordings & transcripts (a Teams alternative).",
    access: "read",
    available: true,
    transport: "stdio",
    command: "",
    note: "A transcript source for calls that aren't on Gong.",
  },
  {
    id: "exa",
    name: "exa",
    label: "Exa web search",
    blurb: "Fresh web research for account & signal work.",
    access: "read",
    available: true,
    transport: "stdio",
    command: "npx",
    args: ["-y", "exa-mcp-server"],
    envKeys: [{ key: "EXA_API_KEY", label: "API key", placeholder: "exa_…" }],
  },
];
