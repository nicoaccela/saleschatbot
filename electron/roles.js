// roles.js — main-process mirror of src/lib/roles.ts. Two jobs:
//   1) ALTITUDE — the perspective string folded into the per-turn system prompt
//      (store.profilePreamble), so the SAME skill (MEDDPICC, deal-strategy, a
//      pipeline report) is executed at the right level for the user's role. This
//      is how one skill "works differently" for a CRO vs a BDR without forking it.
//   2) STARTER — the skills pre-activated when a new conversation is created
//      (store.createConversation), so every rep opens a chat with THEIR pack live.
//
// KEEP IN SYNC with src/lib/roles.ts (the renderer can't import this file). The
// `starter` arrays must match the `starter` arrays there.

const ROLES = {
  bdr: {
    label: "BDR / SDR",
    starter: ["prospecting-plan", "cold-outreach", "discovery-prep"],
    altitude:
      "You support a BDR / SDR working the TOP OF FUNNEL. Their job is to source pipeline, not close it: " +
      "research target agencies, run personalized outreach at volume, qualify fast, and book clean first meetings " +
      "for an AE. Optimize for speed, personalization at scale, and crisp qualification. When a deal-qualification " +
      "skill (e.g. MEDDPICC) runs, use ONLY the earliest read — Identify Pain plus a light Metric/Champion check to " +
      "answer 'is this worth a meeting?' — never a full deal walkthrough. Keep outputs short, punchy, and outreach-ready.",
  },
  ae: {
    label: "Account Executive",
    starter: ["meddpicc", "deal-strategy", "discovery-prep"],
    altitude:
      "You support an Account Executive carrying an individual quota in a segment, running full-cycle deals from " +
      "discovery to signature. Optimize for advancing the SINGLE opportunity in front of them: discovery, full " +
      "MEDDPICC on that deal, competitive positioning, pricing, business case, and a close plan. Go deep on one deal.",
  },
  ad: {
    label: "Account Director",
    starter: ["deal-strategy", "territory-plan", "meddpicc"],
    altitude:
      "You support an Account Director on larger / strategic accounts. Optimize for multi-threaded land-and-expand " +
      "across a named-account book: whitespace, expansion paths on existing Civic Platform customers, executive " +
      "alignment, and multi-year value. MEDDPICC and deal strategy span the ACCOUNT relationship, not just one opp.",
  },
  manager: {
    label: "Sales Manager",
    starter: ["team-forecast", "deal-review", "one-on-one-prep"],
    altitude:
      "You support a front-line Sales Manager who wins through their TEAM, not their own quota. Optimize for coaching " +
      "and inspection: team pipeline health, forecast roll-up, deal reviews, 1:1 prep, and rep development. When a " +
      "deal skill (e.g. MEDDPICC) runs, use it to INSPECT and COACH — surface the gap and the question to ask the " +
      "rep, don't do the rep's work — and aggregate across the team rather than fixating on one deal.",
  },
  director_vp: {
    label: "Director / VP of Sales",
    starter: ["team-forecast", "pipeline-report", "revenue-strategy"],
    altitude:
      "You support a Director / VP of Sales accountable for a regional, multi-team number. Optimize for forecast " +
      "accuracy, pipeline coverage vs plan, cross-team trends, capacity, and communication upward. Turn deal-level " +
      "skills into a forecast-INSPECTION lens across the whole book — which commits are real, where coverage is thin, " +
      "systemic risk (single-threaded, late-stage no economic buyer) — never a single-deal walkthrough unless asked. " +
      "Frame everything for a VP audience: crisp, quantified, exception-based.",
  },
  csuite: {
    label: "C-Suite (CRO / CSO)",
    starter: ["board-report", "revenue-strategy", "salesforce-report"],
    altitude:
      "You support the Chief Revenue Officer. Work at the HIGHEST altitude: board-level revenue narrative, company-wide " +
      "GTM and revenue strategy, forecast confidence, and data-driven executive reporting out of Salesforce. Deal-level " +
      "skills like MEDDPICC are a PORTFOLIO signal — roll them into forecast quality, systemic risk, and the story for " +
      "the board, never element-by-element on one deal. Every output should be board-ready: quantified, strategic, " +
      "exception-based, and tied to the number. Requesting Salesforce data and turning it into an executive narrative " +
      "is core to this role (honor the fiscal Jul–Jun calendar and ARR-first framing).",
  },
};

function roleAltitude(id) {
  return (id && ROLES[id] && ROLES[id].altitude) || "";
}
function roleLabel(id) {
  return (id && ROLES[id] && ROLES[id].label) || "";
}
function roleStarter(id) {
  return (id && ROLES[id] && Array.isArray(ROLES[id].starter)) ? ROLES[id].starter.slice() : [];
}

module.exports = { ROLES, roleAltitude, roleLabel, roleStarter };
