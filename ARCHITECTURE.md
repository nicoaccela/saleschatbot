# Accela Chat: Architecture and Customization Guide

**Who this is for:** someone with limited coding experience who wants to take this app and
turn it into an assistant for a different team. Marketing events, procurement, finance, IT,
HR, legal, whatever. You do not need to understand React or Electron to do that. You need
to know which six files hold the personality, and which forty files hold the plumbing.

**The one-line version:** this app is a nice window around the `claude` command-line tool.
Everything that makes it "an Accela sales assistant" instead of "a generic chat window"
lives in plain text you can edit: skill files, a persona list, a system prompt, and a color
palette. The plumbing underneath does not care what business you are in.

**Proof it works:** this shell has already been forked once. `~/sechatbot` (the Accela SE
Assistant) is the same codebase with a different name in `package.json` and four added
files. Nothing was rewritten.

---

## 0. Sixty-second orientation

| Question | Answer |
|---|---|
| What is it? | A desktop chat app (Mac + Windows) built with Electron, React and TypeScript. |
| Where does the AI come from? | The user's already-installed **Claude Code CLI**. The app runs `claude` as a subprocess. No API key, no model bundled, no cloud service of yours to run. |
| Where does the expertise come from? | **Skill files.** Markdown documents in `~/.claude/skills/<name>/SKILL.md`. Plain English. This is where 90% of your customization happens. |
| Where is data stored? | Local JSON on the user's machine, in the app's user-data folder. Nothing leaves the laptop except what Claude Code itself sends. |
| Do I need to code to rebrand it? | No. Colors are seven lines of CSS, the name is three lines of `package.json`, the personas are one list. |
| Do I need to code to add capability? | No. Write a new markdown file. |
| When do I actually need a developer? | Adding a whole new panel or screen, changing how turns stream, touching the release pipeline. |

---

## 1. What the app actually is

Think of it as three things stacked on top of each other.

1. **A chat window.** Conversations in a sidebar, a message list, a text box. Standard.
2. **A prompt assembler.** Before every message goes to the AI, the app quietly builds a
   system prompt out of: a base instruction + who the user is + what their role is +
   which skills they switched on. This is the layer that makes the same question produce a
   different answer for a BDR than for a CRO.
3. **A launcher for the Claude Code CLI.** It spawns `claude`, streams the reply back token
   by token, and remembers the session ID so the next message continues the conversation.

The reason this matters for you: **the app has no intelligence of its own.** It is a very
well-organized way of talking to Claude Code. So "customizing it for procurement" mostly
means "changing the words it puts in front of every question."

---

## 2. The four layers

```
┌───────────────────────────────────────────────────────────────────────┐
│  LAYER 4  ·  CONTENT          ← you live here. No code required.      │
│  skills/*/SKILL.md            the expertise ("how to run a MEDDPICC")  │
│  src/lib/roles.ts             the personas ("BDR", "AE", "CRO")        │
│  electron/roles.js            the altitude text for each persona       │
│  src/lib/presets.ts           how the skill menu is grouped + labelled │
│  src/lib/workflowTemplates.ts prebuilt multi-step routines             │
│  src/lib/mcpCatalog.ts        the "connect a tool" catalog             │
├───────────────────────────────────────────────────────────────────────┤
│  LAYER 3  ·  IDENTITY         ← light editing. Text and colors.       │
│  electron/store.js            DEFAULT_SETTINGS.systemPrompt            │
│  src/styles.css               the :root color tokens                   │
│  src/assets/*.svg             the logo                                 │
│  package.json                 app name, appId, product name            │
│  OnboardingFlow / GettingStarted / HelpPanel   first-run copy          │
├───────────────────────────────────────────────────────────────────────┤
│  LAYER 2  ·  APP LOGIC        ← a developer's territory.              │
│  src/App.tsx                  panes, gates, which panel is open        │
│  src/components/*.tsx         every screen and panel                   │
│  electron/main.js             IPC handlers, chat:send, the window      │
│  electron/store.js            reading + writing the JSON files         │
│  electron/workflow.js  scheduler.js  fleet.js  taskboard.js  mcp.js    │
├───────────────────────────────────────────────────────────────────────┤
│  LAYER 1  ·  THE ENGINE       ← do not touch without good reason.     │
│  electron/claude.js           spawns the CLI, parses the event stream  │
│  electron/engine.js           assembles the system prompt, runs a turn │
│  electron/preload.js          the safe bridge between window and OS    │
└───────────────────────────────────────────────────────────────────────┘
```

**Rule of thumb:** if your change is "the assistant should know about X" or "the assistant
should sound like Y", you are in Layer 4 and you are editing English. If your change is
"there should be a new button that does Z", you are in Layer 2 and you want help.

---

## 3. What happens when someone presses Enter

Worth reading once. It explains why editing a markdown file changes the app's behavior.

```
  User types "qualify this RFP" and hits Enter
                │
                ▼
  ChatPane.tsx  ──► window.accela.sendMessage({...})        [renderer]
                │
                ▼
  preload.js    ──► ipcRenderer.invoke("chat:send")          [safe bridge]
                │
                ▼
  main.js  "chat:send" handler                               [main process]
     │
     ├─ 1. saves the user's message to disk (store.js)
     ├─ 2. auto-titles the conversation if it's the first message
     ├─ 3. prefixes any attached file paths into the prompt
     │
     ├─ 4. BUILDS THE SYSTEM PROMPT  ◄──── THIS IS THE CUSTOMIZATION SEAM
     │       engine.assembleSystemPrompt({
     │         baseSystem : settings.systemPrompt        ← store.js DEFAULT_SETTINGS
     │         preamble   : store.profilePreamble(...)   ← name, role, territory, tone
     │                        └─ includes roleAltitude() ← electron/roles.js
     │         activeSkills: conv.selectedSkills          ← what they toggled on
     │         divideAndConquer: conv.divideAndConquer
     │       })
     │
     ├─ 5. collects enabled MCP connections (mcp.js)
     │
     ▼
  engine.runStep()  ──►  claude.js  runTurn()
                              │
                              ▼
                   spawns:  claude -p
                              --output-format stream-json
                              --include-partial-messages
                              --verbose
                              --model <opus|sonnet|haiku>
                              --resume <session id>       (if continuing)
                              --append-system-prompt-file <temp file>
                                   (falls back to --append-system-prompt inline)
                              --mcp-config <temp file>    (agent mode only)
                              --permission-mode bypassPermissions  (agent mode)
                              │
                              ▼
                   Claude Code reads ~/.claude/skills/*/SKILL.md itself
                   and runs whichever skill fits the request
                              │
                   streams events back ──► batched every 24ms ──► the UI
                              │
                              ▼
  main.js saves the reply + the new session ID for next time
```

Two things to take from that diagram:

- **Step 4 is your lever.** Everything you can change without touching code funnels through
  `assembleSystemPrompt`.
- **The app never reads your skill files' contents.** It only scans them for a name and a
  description (to build the `/` menu). Claude Code loads the actual instructions. So a skill
  can be as long and as detailed as you like without touching the app.

---

## 4. The file map

### `electron/` (the main process: the part with access to the machine)

| File | What it does | Will you edit it? |
|---|---|---|
| `main.js` | The window, every IPC handler, the `chat:send` turn. The switchboard. | Only to add a feature. |
| `claude.js` | Spawns the CLI, parses the JSON event stream, classifies errors, handles Stop. **The most delicate file in the repo.** | No. |
| `engine.js` | `assembleSystemPrompt()` and `runStep()`. Chat, workflows, schedules and the fleet all run through here so they can never drift apart. | Rarely, and carefully. |
| `store.js` | All persistence: settings, conversations, workflows, schedules. Also holds `DEFAULT_SETTINGS` (including the base system prompt) and `profilePreamble()`. | **Yes.** The system prompt and profile fields live here. |
| `roles.js` | The persona list for the main process: each role's `label`, `starter` skills, and `altitude` paragraph. | **Yes.** This is a primary dial. |
| `commands.js` | Scans `~/.claude/skills` and `~/.claude/commands` to build the `/` picker. Parses YAML frontmatter. | No. |
| `skills-pack.js` | Installs a bundled skill pack into `~/.claude/skills`, non-destructively, tracked by a `.accela-pack` marker file. | Only to rename the marker. |
| `skill-import.js` | Pulls per-role skill zips from a shared OneDrive folder. Contains the hardcoded share URL and folder name. | **Yes**, if you distribute skills this way. |
| `mcp.js` | The registry of connected tools, a connection test probe, and import from an existing Claude config. | No. |
| `workflow.js` | Runs a multi-step workflow, one resumable turn per step, with approval gates. | No. |
| `scheduler.js` | Fires workflows and built-in sweeps on a cadence. | Only to add a built-in sweep type. |
| `fleet.js` | Runs up to 24 parallel read-only agents, four at a time, one per item. Write tools removed. | No. |
| `taskboard.js` | Serves the Command Center task board view. | No. |
| `preload.js` | The `window.accela` API. Every renderer-to-main call is declared here. | Only when adding an IPC call. |

### `src/` (the renderer: the part you see)

| File | What it does | Will you edit it? |
|---|---|---|
| `App.tsx` | Pane manager and gate logic: is Claude installed, has onboarding run, which panel is open. | Only to add a panel. |
| `components/ChatPane.tsx` | The turn lifecycle in the UI: queueing, the working indicator, the error card. The biggest component. | No. |
| `components/MessageBubble.tsx` | One message. **Memoized on purpose.** Pass it an unstable prop and the whole transcript re-parses markdown on every token. | No. |
| `components/Composer.tsx` | The text box, the `/` picker, attachments. | Rarely. |
| `components/Sidebar.tsx` | Conversation list plus the nav buttons. Holds the logo. | To rename or reorder nav. |
| `components/SettingsPanel.tsx` | Model, font, text size, tool mode, system prompt. | Rarely. |
| `components/OnboardingFlow.tsx` | The run-once setup wizard. Holds `PRODUCTS`, `TONES`, `LENGTHS`, `WORK_TYPES`, `TOOL_MODES`. | **Yes.** Department-specific questions live here. |
| `components/GettingStarted.tsx` | First-launch explainer. Auto-imports the role's skill pack. | **Yes.** Copy. |
| `components/HelpPanel.tsx` | In-app help text. | **Yes.** Copy. |
| `components/SkillsPanel.tsx` | The skill side-menu, grouped by `presets.ts`. | No. |
| `components/SkillEditor.tsx` | Lets a user edit a `SKILL.md` from inside the app. | No. |
| `components/McpPanel.tsx` | The Connections screen, driven by `mcpCatalog.ts`. | No. |
| `components/WorkflowsPanel.tsx` | Build and run workflows. | No. |
| `components/SchedulesPanel.tsx` | Recurring sweeps. | No. |
| `components/FleetPanel.tsx` | Parallel agent tiles. | No. |
| `components/CommandCenterView.tsx` | The embedded task board. | No. |
| `components/Motif.tsx` | Four SVG rectangles: the ascending-bars brand motif. | **Yes** if rebranding. |
| `lib/roles.ts` | The persona registry the UI sees: `id`, `group`, `label`, `short`, `blurb`, `starter`, `library`. | **Yes.** Primary dial. |
| `lib/presets.ts` | `PRESET_GROUPS` (menu grouping), `SKILL_LABELS` (pretty names), `RECOMMENDED_MAX`. | **Yes.** Primary dial. |
| `lib/models.ts` | Which Claude models appear in the picker. | Rarely. |
| `lib/mcpCatalog.ts` | The connect-a-tool catalog, each with a `setupPrompt` that Claude executes for the user. | **Yes** if your team uses different tools. |
| `lib/workflowTemplates.ts` | Prebuilt multi-step routines users clone. | **Yes.** High-value dial. |
| `lib/types.ts` | Shared TypeScript types. Edit only when you add a field. | Sometimes. |
| `styles.css` | Everything visual. The palette is the first 25 lines. | **Yes** if rebranding. |
| `assets/*.svg` | The logo, light and dark. | **Yes** if rebranding. |

### Everything else

| Path | What it is |
|---|---|
| `skills/` | The skill source. **Gitignored on purpose** because the public repo ships the app shell only. `_pack.json` lists which skills belong to the pack and the pack version. |
| `scripts/dev.mjs` | Starts Vite, waits for it, launches Electron. |
| `scripts/build-skill-packages.mjs` | Reads `roles.ts` + `presets.ts` + `skills/` and writes one zip per persona plus an "All" bundle and an index page. |
| `scripts/preflight.mjs` | Release gate. Fails the build if proprietary terms, a leaky resource bundle, or `salesforce-mcp` would ship. |
| `.github/workflows/release.yml` | Tag `vX.Y.Z`, CI builds Mac dmg/zip and Windows exe, creates a **draft** release, a human publishes it. |
| `CLAUDE.md` | Working notes for AI agents editing this repo. Read it before letting an agent loose here. |
| `INSTALL.md`, `INSTALL-WINDOWS.md`, `RELEASING.md`, `QA-ACCEPTANCE.md` | Operational docs. |

### Where user data lives

```
macOS    ~/Library/Application Support/accela-chat/
Windows  %APPDATA%\accela-chat\

  settings.json          model, fonts, tool mode, system prompt, profile, MCP servers
  conversations/<id>.json  one file per chat, including its Claude session ID
  workflows/<id>.json
  schedules/<id>.json
```

Skills live somewhere else entirely: `~/.claude/skills/`. They are shared with Claude Code
itself, which is the point. A skill you write is usable in the app, in the terminal, and in
any other Claude Code surface.

---

## 5. The six customization dials

Ranked by leverage per unit of effort. Start at the top.

### Dial 1: Skills. Where almost all your work should go.

A skill is one folder with one markdown file:

```
~/.claude/skills/vendor-vetting/SKILL.md
```

```markdown
---
name: vendor-vetting
description: >-
  Vet a new supplier before contract award. Use when someone says "check this vendor",
  "supplier risk", "can we buy from them", "run diligence", or drops a W-9, a COI,
  or a capability statement. Produces a go / conditional / no-go with the gaps named.
---
# Vendor Vetting

## When to use
- A new supplier is proposed for an award over the direct-buy threshold.
- An existing supplier's insurance or registration is expiring.

## How to run it
1. Confirm identity: legal name, DBA, UEI/SAM registration, tax ID on file.
2. Pull financial signals: years in business, D&B if available, any liens.
3. Check compliance: active insurance certificate, W-9 on file, no debarment.
4. Score each dimension green / amber / red and state what evidence you used.
5. Give one recommendation and the single next action.

## Output format
A short table, then a one-paragraph recommendation, then the next step.

## Never do
- Never assert a registration is active without seeing evidence. Say "unverified".
```

That is the whole thing. No build step, no restart of anything except the app (it scans
skills at startup). The `description` field is load-bearing: Claude uses it to decide when
the skill applies, so pack it with the phrases your team actually says.

**How to build a skill set for a new department, fast:**

1. List the 8 to 12 recurring jobs that department does. Not topics. Jobs. "Run a quarterly
   supplier review", not "supplier management".
2. For each one, write a SKILL.md with the four sections above: when to use, how to run it,
   output format, never do.
3. Add each slug to `skills/_pack.json` and bump its `version`.
4. Add each slug to the right group in `src/lib/presets.ts` and give it a pretty label.
5. Assign it to the personas that need it in `src/lib/roles.ts`.

The "Never do" section matters more than you expect. It is how you stop the assistant
inventing a policy number or a rate.

### Dial 2: Personas. The reason one skill serves six job titles.

Two files, and **they must stay in sync.** The renderer cannot import from `electron/`, so
the list exists twice on purpose.

`src/lib/roles.ts` holds what the UI shows:

```ts
{
  id: "procurement_analyst",
  group: "Procurement",
  label: "Procurement Analyst",
  short: "Analyst",
  blurb: "Runs solicitations end to end: spec, post, evaluate, award.",
  starter: ["solicitation-builder", "bid-evaluation", "vendor-vetting"],  // pre-activated
  library: ["solicitation-builder", "bid-evaluation", "vendor-vetting",
            "contract-review", "spend-analysis", ...UNIVERSAL],           // full recommended set
}
```

`electron/roles.js` holds the same `starter` array **plus the altitude paragraph**:

```js
procurement_analyst: {
  label: "Procurement Analyst",
  starter: ["solicitation-builder", "bid-evaluation", "vendor-vetting"],
  altitude:
    "You support a Procurement Analyst who runs individual solicitations end to end. " +
    "Optimize for the single solicitation in front of them: specification quality, " +
    "compliant evaluation, and a defensible award file. When a review skill runs, go " +
    "deep on this one solicitation, not the category. Compliance before speed: a " +
    "protestable award is worse than a slow one.",
}
```

**The altitude paragraph is the highest-leverage text in the entire codebase.** It gets
folded into the system prompt on every single turn. It is why the same "run a review" skill
produces a line-item audit for an analyst and a category-spend narrative for a CPO, without
forking the skill. Write these carefully. Two to four sentences. Say what to optimize for,
and say explicitly how shared skills should behave differently at this level.

If you change `starter` in one file, change it in the other. Nothing enforces this.

### Dial 3: The skill menu

`src/lib/presets.ts`. Two structures:

- `PRESET_GROUPS`: the group headings and which skills sit under each. Only list skills that
  actually exist in `skills/_pack.json`, or you get a phantom row.
- `SKILL_LABELS`: pretty display names. Anything missing falls back to title-cased slug.

Pure presentation. Safe to edit.

### Dial 4: The base system prompt and the onboarding questions

**The base prompt** is in `electron/store.js`, inside `DEFAULT_SETTINGS.systemPrompt`. It is
short by design. Today it says "you are Accela Assistant, helping a sales engineer, favor
plain language a non-technical government buyer understands". Swap it for your department's
equivalent. Note that existing users have their own copy saved in `settings.json`, so
changing the default only affects new installs and anyone who resets.

**The profile preamble** is built by `profilePreamble()` in the same file. It currently
hardcodes the phrase "an Accela sales rep" and labels the role as "Sales role". Change those
strings when you fork. It also decides which profile fields get sent: name, title, role,
regions, products, tone, response length, work types, custom preferences, signature.

**The onboarding questions** are in `src/components/OnboardingFlow.tsx`, as four plain arrays
near the top:

```ts
const PRODUCTS   = ["Accela", "OpenCounter", "ePermitHub", "Novotx"];
const TONES      = ["Professional", "Friendly & warm", "Direct & punchy", ...];
const LENGTHS    = ["Extremely short", ... "Extremely long"];   // a slider
const WORK_TYPES = ["Email Writing", "Document Creation", "Deal Strategy", ...];
```

For a finance fork, `PRODUCTS` might become the systems they own (ERP, FP&A tool, billing),
and `WORK_TYPES` becomes "Variance Analysis, Board Reporting, Forecast Review, Close
Support". These answers flow straight into the preamble on every turn, so they are worth
tailoring.

If you add a new profile field, you touch four places: `DEFAULT_SETTINGS.profile` in
`store.js`, the render in `profilePreamble()`, the form in `OnboardingFlow.tsx`, and the type
in `src/lib/types.ts`.

### Dial 5: Brand

Five edits and it is someone else's app.

1. **Palette.** `src/styles.css`, the `:root` block at the top:
   ```css
   --blue: #0068be;  --bright: #00aff1;  --navy: #0d263a;
   --teal: #00cec3;  --yellow: #eac645;  --orange: #ea7445;  --gray: #d4d8d9;
   --ink: #0d263a;   --body: #1c2b38;    --muted: #5b6b78;
   --panel: #f2f5f7; --line: #e2e7ea;
   ```
   `--navy` is the sidebar. `--blue` and `--bright` are the accents. Change these seven and
   the whole app moves.
2. **Logo.** Replace `src/assets/accela-logo-white.svg` (used on the navy sidebar) and
   `accela-logo-dark.svg` (used on the light welcome screen). Keep the filenames and you
   change nothing else.
3. **Motif.** `src/components/Motif.tsx` is four `<rect>` elements. Replace or delete.
4. **App name.** `package.json`: top-level `name`, `build.appId`, `build.productName`,
   `build.dmg.title`, `build.nsis.shortcutName`. Also `<title>` in `index.html`. Changing
   the top-level `name` moves the user-data folder, so existing users start clean. That is
   usually what you want in a fork.
5. **Window background.** `backgroundColor` in `createWindow()` in `electron/main.js`.

Then grep for the word `Accela` and work through the copy: `OnboardingFlow.tsx`,
`GettingStarted.tsx`, `HelpPanel.tsx`, `SetupScreen.tsx`, `ChatPane.tsx`, `Sidebar.tsx`.
Roughly 40 occurrences across the renderer, most of them user-visible sentences.

### Dial 6: Workflows, connections, schedules, fleet

**Workflow templates** (`src/lib/workflowTemplates.ts`) are the sleeper feature. A template
is a list of steps, each with instructions, which skills to use, which connections to use,
and a gate:

- `gate: "none"` runs straight through.
- `gate: "wait"` pauses until the user comes back (used for "the meeting is happening now").
- `gate: "approve"` shows the output and waits for approve, edit or reject. Put this in front
  of anything that writes to a system of record or sends an email.

Each step is one resumable Claude turn chained by session ID, so a paused workflow survives
quitting the app. Write templates that mirror a real recurring process: an event follow-up
loop for marketing, a month-end close checklist for finance, a solicitation timeline for
procurement, a ticket triage sweep for IT.

**Connections** (`src/lib/mcpCatalog.ts`) list the tools a user can attach. The clever part:
each entry has a `setupPrompt` that gets seeded into a chat, and Claude Code does the wiring
itself. The user never hunts for a token. To add a tool, copy an existing entry and write the
prompt in the same style: "connect my X so you can do Y", plus the shared `RULES` string that
makes it idempotent and self-verifying.

**Schedules** (`electron/scheduler.js`) fire either a workflow or a built-in sweep on a
cadence. Add a built-in by extending `builtinPrompt()`.

**Fleet** (`electron/fleet.js`) fans one task across a list of items, four at a time, up to
24 items, with write tools stripped. Point it at a list of vendors, campaigns, cost centers
or servers and it researches all of them in parallel.

---

## 6. Worked example: turning this into Procurement Chat

Roughly a day of work, most of it writing skills.

**Step 1. Copy and rename.**
```bash
cp -R ~/accela-chat ~/procurement-chat
cd ~/procurement-chat
rm -rf node_modules dist release .git
bun install
```
Edit `package.json`: `name` to `procurement-chat`, `build.appId` to
`com.yourorg.procurement-chat`, `build.productName` to `Procurement Chat`, plus the dmg title
and shortcut name. Edit `<title>` in `index.html`.

**Step 2. Write the skills.** Create 10 folders under `skills/`, each with a `SKILL.md`.
Suggested set: `solicitation-builder`, `bid-evaluation`, `vendor-vetting`, `contract-review`,
`spend-analysis`, `sole-source-justification`, `protest-response`, `cooperative-purchasing`,
`supplier-scorecard`, `policy-lookup`. Then rewrite `skills/_pack.json` with those slugs and
a fresh version number.

**Step 3. Define the personas.** Replace the contents of `ROLES` in `src/lib/roles.ts` and
`electron/roles.js`. Something like: Buyer, Procurement Analyst, Contract Manager,
Procurement Manager, CPO, plus AP / Finance Liaison and Legal Review as a second group.
Write an altitude paragraph for each. This is the step that decides whether the app feels
generic or feels built for them.

**Step 4. Regroup the menu.** Rewrite `PRESET_GROUPS` and `SKILL_LABELS` in
`src/lib/presets.ts` to match.

**Step 5. Reword the identity.** In `electron/store.js`, rewrite
`DEFAULT_SETTINGS.systemPrompt` and change the two Accela-specific strings in
`profilePreamble()` ("an Accela sales rep", "Sales role"). In `OnboardingFlow.tsx`, replace
`PRODUCTS` and `WORK_TYPES`.

**Step 6. Rebrand.** Palette, logo, motif, window color. Then grep `Accela` and fix the copy.

**Step 7. Rewire distribution.** In `electron/skill-import.js`, change `SHARE_URL`, `FOLDER`,
the `MARKER` constant and the `Accela-Skills-*.zip` pattern. In
`scripts/build-skill-packages.mjs`, change `pkgName()` and the output folder. Then run
`bun scripts/build-skill-packages.mjs` to generate the per-persona zips.

**Step 8. Add two workflow templates** in `src/lib/workflowTemplates.ts` that match a real
process, with an `approve` gate before anything binding.

**Step 9. Run it.**
```bash
bun run dev
```

**Step 10. Ship it.** `bun x tsc --noEmit` to typecheck, `bun run pack` for a local bundle,
then the CI tag flow for real installers.

The same recipe works for the other departments:

| Department | Personas | Anchor skills | Obvious workflow |
|---|---|---|---|
| Marketing events | Event Manager, Field Marketer, Demand Gen, CMO | event-brief, booth-plan, lead-followup, post-event-report, budget-tracker | Pre-event checklist to post-event lead routing, with an approve gate before the follow-up send |
| Procurement | Buyer, Analyst, Contract Manager, CPO | solicitation-builder, bid-evaluation, vendor-vetting, contract-review | Solicitation timeline with a compliance gate before posting |
| Finance | Analyst, Controller, FP&A, CFO | variance-analysis, close-checklist, forecast-review, board-pack | Month-end close, gated at the reconciliation sign-off |
| IT | Helpdesk, SysAdmin, Security, CIO | ticket-triage, incident-writeup, change-request, access-review | Incident response with an approve gate before customer comms |
| HR | Recruiter, HRBP, Comp, CHRO | job-brief, interview-kit, offer-analysis, policy-lookup | Req to offer, gated before the offer goes out |

---

## 7. Cookbook

| I want to... | Do this |
|---|---|
| Teach it something new | Add `~/.claude/skills/<slug>/SKILL.md`. Add the slug to `skills/_pack.json`, `presets.ts` and the relevant `roles.ts` entries. |
| Change what it knows by default | Edit `DEFAULT_SETTINGS.systemPrompt` in `electron/store.js`. Note: existing users keep their saved copy. |
| Make it behave differently for managers | Edit that role's `altitude` in `electron/roles.js`. |
| Add a job title | Add an entry to `ROLES` in **both** `src/lib/roles.ts` and `electron/roles.js`, keeping `starter` identical. |
| Change which skills are on by default | Edit the `starter` array for that role. In both files. Keep it to three or fewer (`RECOMMENDED_MAX`). |
| Rename a skill in the menu | `SKILL_LABELS` in `src/lib/presets.ts`. |
| Reorder or regroup the menu | `PRESET_GROUPS` in `src/lib/presets.ts`. |
| Change the colors | The `:root` block in `src/styles.css`. |
| Change the logo | Replace the two SVGs in `src/assets/`, same filenames. |
| Rename the app | `package.json` (`name`, `build.appId`, `build.productName`, dmg title, shortcut name) and `index.html`. |
| Change the onboarding questions | The arrays at the top of `src/components/OnboardingFlow.tsx`. |
| Add a profile field | `store.js` `DEFAULT_SETTINGS.profile` + `profilePreamble()`, `OnboardingFlow.tsx`, `src/lib/types.ts`. |
| Add a prebuilt routine | `src/lib/workflowTemplates.ts`. |
| Add a connectable tool | `src/lib/mcpCatalog.ts`. Copy an entry, write the `setupPrompt`, append `RULES`. |
| Change which models appear | `src/lib/models.ts`. |
| Change the default model | `DEFAULT_SETTINGS.model` in `electron/store.js`. |
| Make it safer by default | `DEFAULT_SETTINGS.toolMode` from `"agent"` to `"readonly"`. Understand the tradeoff first: `readonly` means skills that write files stop working. |
| Change how skills get distributed | `electron/skill-import.js` (`SHARE_URL`, `FOLDER`, `MARKER`) and `scripts/build-skill-packages.mjs`. |
| Add a whole new screen | New component in `src/components/`, mount it in `App.tsx`, add a nav button in `Sidebar.tsx`, and if it needs machine access, add an IPC handler in `main.js` and expose it in `preload.js`. Get help for this one. |

---

## 8. Nine rules that will bite you

1. **`roles.ts` and `roles.js` are twins.** Same `starter` arrays, maintained by hand.
   Nothing checks. Drift means a user's starter skills do not match their recommended pack.
2. **Only list real skills in `presets.ts`.** A slug with no folder shows an empty menu row.
3. **`skills/` is gitignored.** In the Accela repo that is deliberate IP protection: the
   public repo ships the app shell only. Decide your own policy, and if you make the repo
   public, keep the same discipline.
4. **Do not pass unstable props to `MessageBubble`.** It is memoized. Break that and every
   token re-parses the entire transcript's markdown. The app will feel broken on a slow
   laptop and it will not be obvious why.
5. **`claude.js` is load-bearing.** Turn lifecycle, session resume, error classification,
   treating a Stop as a clean exit. A subtle race here bricks chat. Have someone adversarially
   review any change to it.
6. **Tool mode is a real security decision.** `agent` mode passes
   `--permission-mode bypassPermissions`, which means skills can write files and run shell
   commands without asking. That is intentional here (approval prompts have no UI to answer
   them), but for a fork going to a wider or less technical audience, think hard. `readonly`
   is the conservative default.
7. **Run `bun scripts/preflight.mjs` before any release.** It catches proprietary terms
   leaking into a public pack. If you fork, update its term list rather than deleting the check.
8. **Do not pass empty signing secrets to CI.** An absent GitHub secret becomes `""`, and
   electron-builder reads `""` as a certificate path and crashes the Mac build. The current
   builds are unsigned by design.
9. **Users need Claude Code installed and logged in.** The app has no fallback. `App.tsx`
   gates on `claude:check` and shows `SetupScreen` if it is missing. Budget for that in your
   rollout: it is the single biggest install friction.

---

## 9. Run, build, ship

```bash
bun install                  # dependencies (bun, not npm: there is no node on PATH here)
bun run dev                  # Vite + Electron with hot reload. Your main loop.
bun x tsc --noEmit           # typecheck. CI gate. Run before you commit.
bun run build:renderer       # vite build only
bun run pack                 # unpacked local app bundle
bun scripts/preflight.mjs    # release safety gate
bun scripts/build-skill-packages.mjs   # generate the per-persona skill zips
```

Editing markdown, colors or copy needs no build at all in dev: hot reload picks it up.
Editing anything in `electron/` restarts the Electron process, so you will lose the current
chat state but not the saved conversations.

To ship installers: push a `vX.Y.Z` tag, CI builds Mac dmg/zip plus a Windows exe and opens
a **draft** release, then a human publishes it. `electron-updater` only serves published
releases, so drafts are safe to test. Read `RELEASING.md` before your first cut.

---

## 10. Glossary

| Term | Plain English |
|---|---|
| **Electron** | The framework that wraps a web page into a desktop app. `electron/` is the desktop half, `src/` is the web half. |
| **Main process / renderer** | Main has access to the machine (files, subprocesses). Renderer is the UI and deliberately does not. They talk over IPC. |
| **IPC** | The message passing between the two halves. Declared in `preload.js`, handled in `main.js`. |
| **Skill** | A markdown file of instructions that Claude Code loads when the request matches its description. Your main authoring surface. |
| **System prompt** | Standing instructions attached to every message. Assembled fresh each turn by `engine.js`. |
| **Altitude** | The per-role paragraph that tells the assistant what level to work at. Lives in `electron/roles.js`. |
| **Starter pack** | The two or three skills switched on automatically in a new chat, based on the user's role. |
| **MCP** | Model Context Protocol. The standard way Claude connects to outside tools: mail, calendar, CRM. |
| **Tool mode** | How much the assistant is allowed to do. `chat` (talk only), `readonly` (read and search), `agent` (full, including writes and shell). |
| **Gate** | A pause in a workflow. `wait` for the user to return, `approve` for a human sign-off before something consequential happens. |
| **Fleet** | Running the same task across many items in parallel, read-only. |
| **Session ID** | Claude Code's handle on a conversation. Stored per conversation and passed with `--resume` so the AI remembers. |
| **Vite** | The build tool for the UI half. Gives you hot reload in dev. |
| **bun** | The package manager and runner used here instead of npm. |

---

## Where to start tomorrow

1. `bun run dev` and click every button. Fifteen minutes.
2. Open `electron/roles.js` and read one `altitude` paragraph. That is the app's actual brain.
3. Open any `skills/*/SKILL.md`. That is the app's actual expertise.
4. Change one color in `src/styles.css` and watch it hot reload. Now you know the loop.
5. Write one skill for your team. Ship that. Everything else is decoration.
