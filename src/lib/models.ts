export interface ModelOption {
  id: string;     // alias passed to the claude CLI --model
  label: string;
  sub: string;
}

// Aliases resolve to the latest model in each family on the local CLI —
// "opus" now maps to Opus 5. Opus 5 is the default (see store.js DEFAULT_SETTINGS).
export const MODELS: ModelOption[] = [
  { id: "opus", label: "Claude Opus 5", sub: "Most capable — agentic + deep reasoning" },
  { id: "sonnet", label: "Claude Sonnet 5", sub: "Balanced — fast and smart" },
  { id: "haiku", label: "Claude Haiku 4.5", sub: "Fastest — quick answers" },
];

export function modelLabel(id: string): string {
  return MODELS.find((m) => m.id === id)?.label ?? id;
}
