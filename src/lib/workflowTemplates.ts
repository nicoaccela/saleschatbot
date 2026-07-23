import type { WorkflowStep } from "./types";

// Prebuilt starting points. The flagship is the rep's real pre/post-call loop —
// reps clone it and tweak rather than starting from a blank canvas. Gates keep
// the risky steps (CRM write, outbound email) behind a human approval.

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  steps: Omit<WorkflowStep, "id">[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "meddpicc-loop",
    name: "Pre/Post-Call MEDDPICC Loop",
    description:
      "Calendar → prep → wait for the call → pull MEDDPICC from the transcript → review → update the CRM → follow-up email → new contacts → outreach plan.",
    steps: [
      { title: "Pull today's calendar", gate: "none", skillNames: [], mcpNames: ["google-calendar", "apple-calendar", "outlook"],
        instructions: "Look up today's meetings from my connected calendar. List each customer call with its time, attendees, and account. If no calendar is connected, say so and tell me to connect one." },
      { title: "Prep the call brief", gate: "none", skillNames: ["discovery-prep", "account-brief"], mcpNames: ["salesforce"],
        instructions: "For the next customer call, build a tight pre-call brief: who's on it, account status, open opportunities, likely goals, and 3 sharp discovery questions. Use my account context and any connected CRM/research tools." },
      { title: "Wait for the call to finish", gate: "wait", skillNames: [], mcpNames: [],
        instructions: "The call is happening now. When I resume you, continue — the transcript should be available by then." },
      { title: "Pull MEDDPICC from the transcript", gate: "none", skillNames: ["meddpicc"], mcpNames: ["gong", "zoom"],
        instructions: "Read the transcript/notes from the call I just had (from the connected call tool) and extract MEDDPICC: Metrics, Economic buyer, Decision criteria, Decision process, Paper process, Identified pain, Champion, Competition. Flag any gaps." },
      { title: "Review MEDDPICC before the CRM update", gate: "approve", skillNames: [], mcpNames: [],
        instructions: "Show me the extracted MEDDPICC fields and the exact CRM updates you propose, so I can approve or edit before anything is written." },
      { title: "Update the CRM", gate: "none", skillNames: [], mcpNames: ["salesforce"],
        instructions: "Apply the approved MEDDPICC updates to the opportunity in the CRM. If the CRM connection is read-only, instead produce a clean, copy-paste-ready field-by-field update list and say it's ready to paste." },
      { title: "Draft the follow-up email", gate: "approve", skillNames: ["nico-writing-style"], mcpNames: ["gmail", "outlook"],
        instructions: "Write a follow-up email to the customer in my voice: recap, agreed next steps, and a clear ask. Short and human. Show it to me for review — do not send it." },
      { title: "Suggest new people to meet", gate: "none", skillNames: ["deal-strategy"], mcpNames: ["salesforce"],
        instructions: "Based on the account and the call, suggest 3-5 other stakeholders worth meeting (role + why each matters to the deal)." },
      { title: "Propose an outreach plan", gate: "none", skillNames: ["deal-strategy"], mcpNames: [],
        instructions: "Lay out a concrete 2-week plan to reach those people and advance the deal: who, channel, message angle, and timing." },
    ],
  },
  {
    id: "weekly-territory-sweep",
    name: "Monday Territory Sweep",
    description: "Pull the week's meetings and prep a one-screen brief for each customer call.",
    steps: [
      { title: "Pull this week's meetings", gate: "none", skillNames: [], mcpNames: ["google-calendar", "apple-calendar", "outlook"],
        instructions: "List every customer-facing meeting on my calendar this week, grouped by day, with account and attendees." },
      { title: "Prep a brief per call", gate: "none", skillNames: ["account-brief", "discovery-prep"], mcpNames: ["salesforce"],
        instructions: "For each customer meeting this week, produce a short brief: account status, open opps, one goal, and one thing to watch. Keep each to a few lines." },
    ],
  },
];
