import type { BoardTask } from "./types";

/**
 * The Command Center's own ranking, ported from the board's build.py.
 *
 * This is a deliberate duplication. The focus rail and the board sit side by
 * side in one window, so if they ordered work differently the rep would see two
 * different answers to "what's next" and trust neither. Any change to sortT or
 * todaysSix in build.py has to land here too.
 */
const PORD: Record<string, number> = { p1: 0, p2: 1, p3: 2, p4: 3 };

/** Whole days from today until `due`. Negative means overdue. */
function toDue(due?: string | null): number | null {
  if (!due) return null;
  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - t0.getTime()) / 86400000);
}

/** Whole days since `received` — the age the stale panel is built on. */
export function age(received?: string | null): number {
  if (!received) return 0;
  const d = new Date(received);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/** Effective priority: a due date can promote a task, never demote one. */
export function pri(t: BoardTask): string {
  const d = toDue(t.due);
  if (t.priority === "p1") return "p1";
  if (d !== null && d <= 1) return "p1";
  if (d !== null && d <= 6 && t.priority === "p3") return "p2";
  return t.priority || "p4";
}

export function sortT(a: BoardTask, b: BoardTask): number {
  const p = PORD[pri(a)] - PORD[pri(b)];
  if (p) return p;
  // then the priority actually authored, so a routine chore that merely has a
  // near due date never outranks something judged genuinely urgent
  const q = PORD[a.priority || "p4"] - PORD[b.priority || "p4"];
  if (q) return q;
  const da = toDue(a.due);
  const db = toDue(b.due);
  if (da !== null && db !== null && da !== db) return da - db;
  if (da !== null && db === null) return -1;
  if (db !== null && da === null) return 1;
  return age(b.received) - age(a.received);
}

/**
 * Today's six — all p1, then the single stalest item, then quick wins to fill.
 * Never more than six: a longer list is a wall, and the rep disengages.
 */
export function todaysSix(tasks: BoardTask[]): BoardTask[] {
  const owed = tasks.filter((t) => t.lane === "owed").slice().sort(sortT);
  const pick: BoardTask[] = [];
  const seen = new Set<string>();
  const add = (t?: BoardTask) => {
    if (t && !seen.has(t.id) && pick.length < 6) {
      seen.add(t.id);
      pick.push(t);
    }
  };
  owed.filter((t) => pri(t) === "p1").forEach(add);
  add(owed.filter((t) => !seen.has(t.id)).sort((a, b) => age(b.received) - age(a.received))[0]);
  owed.filter((t) => (t.effortMin ?? 999) <= 10).forEach(add);
  owed.forEach(add);
  return pick;
}

export function dueLabel(due?: string | null): string | null {
  const d = toDue(due);
  if (d === null) return null;
  if (d < 0) return `${-d}d overdue`;
  if (d === 0) return "due today";
  if (d === 1) return "due tomorrow";
  return `due in ${d}d`;
}

/**
 * The prompt that starts work on a task.
 *
 * An authored `claudePrompt` always wins — it was written knowing the deal. The
 * fallback stays factual and hands over the first action, because that is the
 * field that beats task-initiation paralysis; it must survive into the chat.
 */
export function taskPrompt(t: BoardTask): string {
  const lines: string[] = [];
  if (t.claudePrompt) {
    lines.push(t.claudePrompt);
  } else {
    lines.push(`Help me work this task from my Command Center: ${t.title}`);
  }
  lines.push("");
  lines.push("Task context:");
  if (t.account) lines.push(`- Account: ${t.account}`);
  lines.push(`- Task: ${t.title}`);
  if (t.why) lines.push(`- Why it matters: ${t.why}`);
  if (t.firstAction) lines.push(`- My first action: ${t.firstAction}`);
  const d = dueLabel(t.due);
  if (d) lines.push(`- Timing: ${d}`);
  if (t.skills?.length) lines.push(`- Use these skills: ${t.skills.join(", ")}`);
  return lines.join("\n");
}
