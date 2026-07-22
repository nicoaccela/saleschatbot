// Curated catalog of tools a sales rep connects. ZERO manual config: clicking
// "Connect" opens a chat seeded with `setupPrompt`, and Claude Code does all the
// wiring (checks existing config, runs `claude mcp add`, walks any sign-in) — the
// rep never gathers a token, command, or ID. Servers that don't exist yet (Gong)
// ship as disabled "coming soon" stubs. A hidden "Advanced" path still allows a
// manual server for power users.

export interface CatalogEntry {
  id: string;
  name: string;            // default server name (tools appear as mcp__<name>__tool)
  label: string;
  blurb: string;
  access: "read" | "write" | "read/write";
  available: boolean;      // false = coming soon (Connect disabled)
  setupPrompt: string;     // seeded into a chat; Claude does the wiring end-to-end
  note?: string;
}

// A shared preamble so every setup turn behaves the same way: idempotent, no
// homework for the rep, confirm at the end.
const RULES =
  " First check my existing Claude Code MCP configuration; if this connection is already set up, just confirm it and tell me what it can do. " +
  "If it is not set up, add it for me and walk me through any sign-in in the browser. " +
  "Do not ask me to find tokens, IDs, commands, or file paths myself — figure those out or guide me click-by-click. " +
  "When it's connected, run a quick check and confirm what you can now see.";

export const MCP_CATALOG: CatalogEntry[] = [
  {
    id: "apple-mail",
    name: "apple-mail",
    label: "Apple Mail",
    blurb: "Read & search the mail already on this Mac.",
    access: "read",
    available: true,
    setupPrompt:
      "Connect my Apple Mail so you can read and search my messages, using the Mail app on this Mac (a local read-only bridge is fine — no server or password needed)." +
      RULES,
  },
  {
    id: "apple-calendar",
    name: "apple-calendar",
    label: "Apple Calendar",
    blurb: "Your meetings — the trigger for prep & sweeps.",
    access: "read",
    available: true,
    setupPrompt:
      "Connect my Apple Calendar so you can read my meetings, using the Calendar app on this Mac (a local read-only bridge via EventKit/AppleScript is fine — no account login needed)." +
      RULES,
  },
  {
    id: "google-calendar",
    name: "google-calendar",
    label: "Google Calendar",
    blurb: "Google Workspace meetings for prep & sweeps.",
    access: "read",
    available: true,
    setupPrompt:
      "Connect my Google Calendar so you can read my meetings. Set up the right MCP server and take me through the Google sign-in in the browser." +
      RULES,
  },
  {
    id: "gmail",
    name: "gmail",
    label: "Gmail",
    blurb: "Read threads & draft follow-ups.",
    access: "read/write",
    available: true,
    setupPrompt:
      "Connect my Gmail so you can read threads and draft follow-ups. Set up the right MCP server and take me through the Google sign-in." +
      RULES,
  },
  {
    id: "outlook",
    name: "outlook",
    label: "Outlook / Microsoft 365",
    blurb: "Calendar + mail for Microsoft shops.",
    access: "read",
    available: true,
    setupPrompt:
      "Connect my Outlook / Microsoft 365 calendar and mail. Set up the right Microsoft Graph MCP server and take me through the Microsoft sign-in." +
      RULES,
  },
  {
    id: "salesforce",
    name: "salesforce",
    label: "Salesforce",
    blurb: "Accounts, opps & MEDDPICC (read-only today).",
    access: "read",
    available: true,
    setupPrompt:
      "Connect my Salesforce (read-only is fine) so you can look up accounts, opportunities and MEDDPICC fields. If I already have a Salesforce MCP configured in Claude Code, just use that." +
      RULES,
  },
  {
    id: "pursuit",
    name: "pursuit",
    label: "Pursuit",
    blurb: "Municipal lead & signal intelligence.",
    access: "read",
    available: true,
    setupPrompt:
      "Connect my Pursuit account so you can search municipal entities, contacts and signals. If I already have a Pursuit MCP configured in Claude Code, just use that." +
      RULES,
  },
  {
    id: "slack",
    name: "slack",
    label: "Slack",
    blurb: "Post updates & pull channel context.",
    access: "read/write",
    available: true,
    setupPrompt:
      "Connect my Slack so you can read channel context and post updates. Set up the right MCP server and take me through the Slack sign-in / app authorization." +
      RULES,
  },
  {
    id: "zoom",
    name: "zoom",
    label: "Zoom",
    blurb: "Meeting recordings & transcripts (Teams alt).",
    access: "read",
    available: true,
    setupPrompt:
      "Connect my Zoom so you can read meeting recordings and transcripts. Set up the right MCP server and take me through the Zoom sign-in." +
      RULES,
  },
  {
    id: "exa",
    name: "exa",
    label: "Web search (Exa)",
    blurb: "Fresh web research for accounts & signals.",
    access: "read",
    available: true,
    setupPrompt:
      "Connect Exa web search so you can run fresh web research. Set up the MCP server; if it needs an API key, tell me exactly where to get one and set it up with me." +
      RULES,
  },
  {
    id: "gong",
    name: "gong",
    label: "Gong",
    blurb: "Call recordings, transcripts & deal intel.",
    access: "read",
    available: false,
    setupPrompt:
      "Connect my Gong so you can read call recordings, transcripts and deal intelligence, and take me through the Gong sign-in." + RULES,
    note: "Available once your Gong workspace enables its MCP endpoint.",
  },
];
