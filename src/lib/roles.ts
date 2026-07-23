// roles.ts — the sales role ladder that personalizes Accela Chat per user.
// Chosen on the first onboarding screen; drives (1) which skill PACKAGE is
// recommended + pre-activated, and (2) the altitude the assistant works at
// (folded into the system prompt each turn by electron/store.js).
//
// KEEP IN SYNC with electron/roles.js — that CommonJS mirror carries the
// altitude strings (for the per-turn preamble) and the `starter` packages
// (for seeding a new conversation's active skills). The renderer can't import
// from electron/, so the starter arrays live in both places; if you change a
// package here, change it there too.

export type RoleId = "bdr" | "ae" | "ad" | "manager" | "director_vp" | "csuite";

export interface RoleDef {
  id: RoleId;
  label: string;      // full label in the selector
  short: string;      // chip / compact label
  blurb: string;      // one line under the label in the selector
  starter: string[];  // pre-activated in every new chat (<= RECOMMENDED_MAX)
  library: string[];  // full recommended set for this role, starter first
}

// Skills every role gets in its library (branding, voice, product truth).
const UNIVERSAL = ["product-knowledge", "accela-content", "accela-voice"];

export const ROLES: RoleDef[] = [
  {
    id: "bdr",
    label: "BDR / SDR",
    short: "BDR",
    blurb: "Top of funnel — prospect, sequence, and book qualified first meetings.",
    starter: ["prospecting-plan", "cold-outreach", "discovery-prep"],
    library: [
      "prospecting-plan", "cold-outreach", "discovery-prep",
      "pursuit-qualify", "account-brief", "event-report",
      "objection-handling", "meddpicc", ...UNIVERSAL,
    ],
  },
  {
    id: "ae",
    label: "Account Executive",
    short: "AE",
    blurb: "Full-cycle closer on a segment — discovery to signature, single deals.",
    starter: ["meddpicc", "deal-strategy", "discovery-prep"],
    library: [
      "meddpicc", "deal-strategy", "discovery-prep",
      "objection-handling", "pricing-model", "business-case-roi", "budget-finder",
      "pipeline-report", "account-brief", "accela-deck", ...UNIVERSAL,
    ],
  },
  {
    id: "ad",
    label: "Account Director",
    short: "AD",
    blurb: "Strategic / larger accounts — land-and-expand across a named-account book.",
    starter: ["deal-strategy", "territory-plan", "meddpicc"],
    library: [
      "deal-strategy", "territory-plan", "meddpicc",
      "business-case-roi", "pricing-model", "budget-finder", "account-brief",
      "pipeline-report", "objection-handling", "accela-deck", ...UNIVERSAL,
    ],
  },
  {
    id: "manager",
    label: "Sales Manager",
    short: "Manager",
    blurb: "Front-line leader — coach the team, inspect deals, roll up the forecast.",
    starter: ["team-forecast", "deal-review", "one-on-one-prep"],
    library: [
      "team-forecast", "deal-review", "one-on-one-prep",
      "pipeline-report", "meddpicc", "deal-strategy", "event-report",
      "objection-handling", ...UNIVERSAL,
    ],
  },
  {
    id: "director_vp",
    label: "Director / VP of Sales",
    short: "Director / VP",
    blurb: "Owns the regional number — forecast accuracy, coverage vs plan, trends.",
    starter: ["team-forecast", "pipeline-report", "revenue-strategy"],
    library: [
      "team-forecast", "pipeline-report", "revenue-strategy",
      "deal-review", "salesforce-report", "one-on-one-prep", "territory-plan",
      "meddpicc", "business-case-roi", "accela-deck", ...UNIVERSAL,
    ],
  },
  {
    id: "csuite",
    label: "C-Suite (CRO / CSO)",
    short: "C-Suite",
    blurb: "Board-level revenue — company GTM strategy, forecast confidence, SFDC reporting.",
    starter: ["board-report", "revenue-strategy", "salesforce-report"],
    library: [
      "board-report", "revenue-strategy", "salesforce-report",
      "team-forecast", "pipeline-report", "deal-review",
      "meddpicc", "business-case-roi", "accela-deck", ...UNIVERSAL,
    ],
  },
];

export const ROLE_BY_ID: Record<string, RoleDef> = Object.fromEntries(
  ROLES.map((r) => [r.id, r]),
);

export function roleLabel(id: string | undefined): string {
  return (id && ROLE_BY_ID[id]?.label) || "";
}

// The recommended library for a role (empty if none/unknown selected).
export function rolePackage(id: string | undefined): string[] {
  return (id && ROLE_BY_ID[id]?.library) || [];
}

// The starter set to pre-activate in a fresh chat.
export function roleStarter(id: string | undefined): string[] {
  return (id && ROLE_BY_ID[id]?.starter) || [];
}
