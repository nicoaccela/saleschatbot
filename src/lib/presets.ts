// Curated grouping + display order for the skill side-menu. Descriptions come
// from the live scan (commands:list); this just organizes them for sellers.

export interface PresetGroup {
  group: string;
  skills: string[];
}

// Groups list ONLY skills that actually ship in the pack (skills/_pack.json), so
// the menu never shows a phantom row or dumps real skills into an "Other" bucket.
export const PRESET_GROUPS: PresetGroup[] = [
  { group: "Deal Execution", skills: ["meddpicc", "deal-strategy", "discovery-prep", "objection-handling"] },
  { group: "Commercial", skills: ["pricing-model", "budget-finder", "business-case-roi"] },
  { group: "Product Knowledge", skills: ["product-knowledge"] },
  { group: "Brand & Create", skills: ["accela-brand-2026", "accela-deck", "accela-content", "accela-voice"] },
  { group: "Account & Research", skills: ["account-brief", "pursuit-qualify", "conference-mode"] },
  { group: "Setup & Workspace", skills: ["brand-setup", "workspace-setup", "workspace-learn", "workspace-organize"] },
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
  "accela-content": "On-Brand Content",
  "accela-voice": "Brand Voice",
  "account-brief": "Account Brief",
  "pursuit-qualify": "Pursuit Qualify",
  "conference-mode": "Conference Mode",
  "brand-setup": "Install Brand Kit",
  "workspace-setup": "Set Up Workspace",
  "workspace-learn": "Learn My Files",
  "workspace-organize": "Organize My Files",
};

export const RECOMMENDED_MAX = 3;

export function skillLabel(name: string): string {
  return (
    SKILL_LABELS[name] ||
    name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
