// Curated grouping + display order for the skill side-menu. Descriptions come
// from the live scan (commands:list); this just organizes them for sellers.

export interface PresetGroup {
  group: string;
  skills: string[];
}

export const PRESET_GROUPS: PresetGroup[] = [
  { group: "Deal Execution", skills: ["meddpicc", "deal-strategy", "discovery-prep", "objection-handling"] },
  { group: "Commercial", skills: ["pricing-model", "budget-finder", "business-case-roi"] },
  { group: "Product Knowledge", skills: ["product-knowledge"] },
  { group: "Brand & Create", skills: ["accela-brand-2026", "accela-deck"] },
  { group: "Account & Research", skills: ["account-brief", "sales-workspace", "pursuit-qualify", "salesforce-mcp"] },
  { group: "System", skills: ["sales-command-center", "handoff"] },
];

// Pretty labels for skill names (fallback: title-case the slug).
export const SKILL_LABELS: Record<string, string> = {
  "meddpicc": "MEDDPICC Qualification",
  "deal-strategy": "Deal Strategy",
  "discovery-prep": "Discovery Prep",
  "objection-handling": "Objection Handling",
  "pricing-model": "Pricing & Deal Modeling",
  "budget-finder": "Budget Finder",
  "business-case-roi": "Business Case / ROI",
  "product-knowledge": "Product Knowledge",
  "accela-brand-2026": "Accela Brand (2026)",
  "accela-deck": "Deck Builder",
  "account-brief": "Account Brief",
  "sales-workspace": "Sales Workspace",
  "pursuit-qualify": "Pursuit Qualify",
  "salesforce-mcp": "Salesforce",
  "sales-command-center": "Command Center Build",
  "handoff": "Session Handoff",
};

export const RECOMMENDED_MAX = 3;

export function skillLabel(name: string): string {
  return (
    SKILL_LABELS[name] ||
    name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
