import { useEffect, useMemo, useRef, useState } from "react";
import {
  X, Plus, Trash2, Download, RefreshCw, Check, AlertTriangle,
  ToggleLeft, ToggleRight, SlidersHorizontal, Plug, ChevronDown, ChevronRight, Sparkles,
} from "lucide-react";
import type { McpServerConfig, McpSupport, McpTestResult, McpTransport, Settings } from "../lib/types";
import { MCP_CATALOG } from "../lib/mcpCatalog";

// Local editing shape for the ADVANCED manual form. env/headers are ordered rows
// so keys stay editable; args are discrete rows so spaces round-trip verbatim.
interface KV { k: string; v: string }
interface FormState {
  id: string;
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  url: string;
  envRows: KV[];
  headerRows: KV[];
  enabled: boolean;
  access?: McpServerConfig["access"];
  catalogId?: string;
}

function newId(): string {
  try { return crypto.randomUUID(); } catch { return "mcp-" + Math.abs(Date.now() ^ (Math.random() * 1e9)).toString(36); }
}
function recToRows(r?: Record<string, string>): KV[] {
  return r ? Object.entries(r).map(([k, v]) => ({ k, v })) : [];
}
function rowsToRec(rows: KV[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { k, v } of rows) { const key = k.trim(); if (key) out[key] = v; }
  return out;
}
function blankForm(): FormState {
  return { id: newId(), name: "", transport: "stdio", command: "", args: [], url: "", envRows: [], headerRows: [], enabled: true };
}
function formFromServer(s: McpServerConfig): FormState {
  return {
    id: s.id, name: s.name, transport: s.transport,
    command: s.command || "", args: s.args ? [...s.args] : [], url: s.url || "",
    envRows: recToRows(s.env), headerRows: recToRows(s.headers),
    enabled: s.enabled !== false, access: s.access, catalogId: s.catalogId,
  };
}
function formToServer(f: FormState, prev?: McpServerConfig): McpServerConfig {
  const s: McpServerConfig = {
    ...prev,
    id: f.id, name: f.name.trim(), transport: f.transport, enabled: f.enabled,
    access: f.access, catalogId: f.catalogId,
  };
  if (f.transport === "stdio") {
    s.command = f.command.trim();
    s.args = f.args.filter((a) => a.length > 0);
    const env = rowsToRec(f.envRows);
    s.env = Object.keys(env).length ? env : undefined;
    s.url = undefined; s.headers = undefined;
  } else {
    s.url = f.url.trim();
    const headers = rowsToRec(f.headerRows);
    s.headers = Object.keys(headers).length ? headers : undefined;
    s.command = undefined; s.args = undefined; s.env = undefined;
  }
  return s;
}
function formValid(f: FormState): boolean {
  if (!f.name.trim()) return false;
  return f.transport === "stdio" ? !!f.command.trim() : !!f.url.trim();
}

function AccessBadge({ access }: { access?: McpServerConfig["access"] }) {
  if (!access) return null;
  const cls = access === "read" ? "read" : access === "write" ? "write" : "readwrite";
  return <span className={"mcp-badge " + cls}>{access}</span>;
}

export default function McpPanel({
  settings,
  onSaveSettings,
  onClose,
  onSetupViaClaude,
}: {
  settings: Settings;
  onSaveSettings: (patch: Partial<Settings>) => void;
  onClose: () => void;
  onSetupViaClaude: (prompt: string) => void;
}) {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [support, setSupport] = useState<McpSupport | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, McpTestResult>>({});
  const [permsFor, setPermsFor] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [ambient, setAmbient] = useState<string[]>([]); // server names already in ~/.claude.json
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Ref mirror so writes that run AFTER an await (test/import) build on the
  // latest state, never a stale render snapshot. persist() keeps it in sync.
  const serversRef = useRef<McpServerConfig[]>([]);

  useEffect(() => {
    window.accela.listMcpServers().then((s) => { serversRef.current = s; setServers(s); });
    window.accela.mcpSupport().then(setSupport);
    // Servers the rep set up via a guided Connect land in ~/.claude.json; surface
    // those names so the catalog card reads "connected" without a manual Import.
    window.accela.importMcpServers().then((found) => setAmbient(found.map((f) => f.name).filter(Boolean) as string[]));
  }, []);

  const enabledCount = servers.filter((s) => s.enabled !== false).length;
  const connectedIds = useMemo(
    () => new Set([...servers.flatMap((s) => [s.catalogId, s.name].filter(Boolean) as string[]), ...ambient]),
    [servers, ambient],
  );

  function persist(next: McpServerConfig[]) {
    serversRef.current = next;
    setServers(next);
    window.accela.saveMcpServers(next);
  }
  function upsert(s: McpServerConfig) {
    const base = serversRef.current;
    const i = base.findIndex((x) => x.id === s.id);
    persist(i >= 0 ? base.map((x) => (x.id === s.id ? s : x)) : [...base, s]);
  }
  function toggle(id: string) {
    persist(serversRef.current.map((s) => (s.id === id ? { ...s, enabled: s.enabled === false } : s)));
  }
  function remove(id: string) {
    persist(serversRef.current.filter((s) => s.id !== id));
    setResults((r) => { const n = { ...r }; delete n[id]; return n; });
    if (permsFor === id) setPermsFor(null);
  }
  function toggleTool(id: string, tool: string) {
    persist(serversRef.current.map((s) => {
      if (s.id !== id) return s;
      const off = new Set(s.disabledTools || []);
      off.has(tool) ? off.delete(tool) : off.add(tool);
      return { ...s, disabledTools: [...off] };
    }));
  }
  function setAllTools(id: string, disabled: boolean) {
    persist(serversRef.current.map((s) =>
      s.id === id ? { ...s, disabledTools: disabled ? [...(s.tools || [])] : [] } : s,
    ));
  }
  function saveForm() {
    if (!form || !formValid(form)) return;
    const prev = serversRef.current.find((x) => x.id === form.id);
    upsert(formToServer(form, prev));
    setForm(null);
  }
  async function test(s: McpServerConfig) {
    setTestingId(s.id);
    try {
      const r = await window.accela.testMcpServer(s);
      setResults((prev) => ({ ...prev, [s.id]: r }));
      persist(serversRef.current.map((x) =>
        x.id === s.id ? { ...x, status: r.ok ? "connected" : "error", tools: r.ok ? r.tools : x.tools } : x,
      ));
      if (r.ok && r.tools.length) setPermsFor(s.id);
    } finally {
      setTestingId(null);
    }
  }
  async function doImport() {
    setImportMsg(null);
    const found = await window.accela.importMcpServers();
    const base = serversRef.current;
    const have = new Set(base.map((s) => s.name));
    const additions: McpServerConfig[] = [];
    for (const f of found) {
      if (!f.name || have.has(f.name)) continue;
      have.add(f.name);
      additions.push({
        id: newId(),
        name: f.name,
        transport: (f.transport as McpTransport) || (f.url ? "http" : "stdio"),
        command: f.command, args: f.args, env: f.env, url: f.url, headers: f.headers,
        enabled: true,
      });
    }
    if (additions.length) persist([...base, ...additions]);
    setImportMsg(
      additions.length
        ? `Imported ${additions.length} connection${additions.length === 1 ? "" : "s"} from Claude Code.`
        : "No new connections found in your Claude Code config.",
    );
  }

  const notAgent = settings.toolMode !== "agent";

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="sheet" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close-x" onClick={onClose}><X size={20} /></button>
        <h2><Plug size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />Connections</h2>
        <p className="sub">
          Connect your tools — Gong, Salesforce, calendar, mail. Click Connect and the assistant sets it up
          and walks you through sign-in. No tokens or setup to look up.
        </p>

        {support && !support.mcpConfig && (
          <div className="mcp-warn">
            <AlertTriangle size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Your Claude Code is too old for connections. Update it, then reopen Accela Chat.
          </div>
        )}
        {enabledCount > 0 && notAgent && (
          <div className="mcp-warn">
            <AlertTriangle size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Connections only run in <strong>Sales cockpit</strong> mode. You're in “{settings.toolMode}”.
            <button className="link-btn" onClick={() => onSaveSettings({ toolMode: "agent" })}>Switch to Sales cockpit</button>
          </div>
        )}

        {/* ---- Your connections ---- */}
        <div className="section-label">Your connections {servers.length > 0 && `(${servers.length})`}</div>
        {servers.length === 0 && (
          <p className="range-val" style={{ marginBottom: 12 }}>
            Nothing connected yet. Pick a tool below, or pull in what you already have with “Import from Claude Code.”
          </p>
        )}
        {servers.map((s) => {
          const r = results[s.id];
          const on = s.enabled !== false;
          const open = permsFor === s.id;
          const disabledCount = (s.disabledTools || []).length;
          return (
            <div className="mcp-item" key={s.id}>
              <div className="mcp-row">
                <button className="mcp-toggle" title={on ? "Enabled" : "Disabled"} onClick={() => toggle(s.id)}>
                  {on ? <ToggleRight size={22} color="var(--blue)" /> : <ToggleLeft size={22} color="var(--muted)" />}
                </button>
                <div className="mcp-main">
                  <div className="mcp-name">
                    {s.name} <AccessBadge access={s.access} />
                    {r && (
                      <span className="status-pill" style={{ margin: 0 }}>
                        <span className={"dot " + (r.ok ? "ok" : "bad")} />
                        {r.ok ? `${r.tools.length} tools` : "error"}
                      </span>
                    )}
                  </div>
                  <div className="mcp-meta">
                    {s.tools?.length
                      ? `${s.tools.length} tools${disabledCount ? ` · ${disabledCount} off` : ""}`
                      : s.transport === "stdio"
                        ? (s.command || "—") + (s.args?.length ? " " + s.args.join(" ") : "")
                        : s.url || "—"}
                  </div>
                  {r && !r.ok && r.error && <div className="mcp-err">{r.error}</div>}
                </div>
                <div className="mcp-actions">
                  <button className="icon-btn" title="Test connection" disabled={testingId === s.id} onClick={() => test(s)}>
                    <RefreshCw size={15} className={testingId === s.id ? "spin" : ""} />
                  </button>
                  <button className={"icon-btn" + (open ? " on" : "")} title="Permissions" onClick={() => setPermsFor(open ? null : s.id)}>
                    <SlidersHorizontal size={15} />
                  </button>
                  <button className="icon-btn" title="Remove" onClick={() => remove(s.id)}><Trash2 size={15} /></button>
                </div>
              </div>

              {open && (
                <div className="mcp-perms">
                  {s.tools && s.tools.length ? (
                    <>
                      <div className="perms-head">
                        <span className="hint-inline">Switch off any tool you don't want the assistant to use.</span>
                        <span className="perms-actions">
                          <button className="link-btn" onClick={() => setAllTools(s.id, false)}>All on</button>
                          <button className="link-btn" onClick={() => setAllTools(s.id, true)}>All off</button>
                        </span>
                      </div>
                      {s.tools.map((t) => {
                        const off = (s.disabledTools || []).includes(t);
                        return (
                          <div className="perm-row" key={t}>
                            <button className="mcp-toggle" onClick={() => toggleTool(s.id, t)}>
                              {off ? <ToggleLeft size={18} color="var(--muted)" /> : <ToggleRight size={18} color="var(--blue)" />}
                            </button>
                            <span className="perm-name">{t.replace(`mcp__${s.name}__`, "")}</span>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="hint-inline">
                      Run <strong>Test</strong> (the refresh icon) to discover this connection's tools, then switch them on or off here.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="mcp-add-row">
          <button className="btn-sm" onClick={doImport}><Download size={15} /> Import from Claude Code</button>
        </div>
        {importMsg && <p className="range-val">{importMsg}</p>}

        {/* ---- Add a connection (catalog, zero-config) ---- */}
        <div className="section-label">Add a connection</div>
        {MCP_CATALOG.map((e) => {
          const connected = connectedIds.has(e.id) || connectedIds.has(e.name);
          return (
            <div className={"skill-card" + (connected ? " on" : "")} key={e.id} style={{ cursor: "default" }}>
              <span className="skill-text">
                <span className="skill-name">
                  {e.label} <AccessBadge access={e.access} />
                  {!e.available && <span className="mcp-badge soon">soon</span>}
                  {connected && <span className="mcp-badge soon"><Check size={11} style={{ verticalAlign: "-1px" }} /> connected</span>}
                </span>
                <span className="skill-desc">{e.blurb}{e.note ? ` — ${e.note}` : ""}</span>
              </span>
              <button
                className="btn-sm"
                disabled={!e.available}
                onClick={() => onSetupViaClaude(e.setupPrompt)}
                style={{ alignSelf: "center", flex: "0 0 auto" }}
              >
                {!e.available ? "Coming soon" : (<><Sparkles size={14} /> Connect</>)}
              </button>
            </div>
          );
        })}

        {/* ---- Advanced (manual) ---- */}
        <button className="disclosure" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Advanced
        </button>
        {showAdvanced && (
          <div className="advanced-body">
            {!form && (
              <button className="btn-sm" onClick={() => setForm(blankForm())}><Plus size={15} /> Add a server manually</button>
            )}
            {form && (
              <div className="mcp-form">
                <div className="field">
                  <label>Server name</label>
                  <input type="text" value={form.name} placeholder="e.g. gong"
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="field">
                  <label>Transport</label>
                  <div className="seg">
                    {(["stdio", "http", "sse"] as McpTransport[]).map((t) => (
                      <button key={t} className={form.transport === t ? "on" : ""} onClick={() => setForm({ ...form, transport: t })}>{t}</button>
                    ))}
                  </div>
                </div>
                {form.transport === "stdio" ? (
                  <>
                    <div className="field">
                      <label>Command</label>
                      <input type="text" value={form.command} placeholder="e.g. npx"
                        onChange={(e) => setForm({ ...form, command: e.target.value })} />
                    </div>
                    <ArgsEditor args={form.args} onChange={(args) => setForm({ ...form, args })} />
                    <KVEditor label="Environment variables" hint="tokens & keys — stored locally"
                      rows={form.envRows} onChange={(envRows) => setForm({ ...form, envRows })} />
                  </>
                ) : (
                  <>
                    <div className="field">
                      <label>URL</label>
                      <input type="text" value={form.url} placeholder="https://…"
                        onChange={(e) => setForm({ ...form, url: e.target.value })} />
                    </div>
                    <KVEditor label="Headers" hint="e.g. Authorization"
                      rows={form.headerRows} onChange={(headerRows) => setForm({ ...form, headerRows })} />
                  </>
                )}
                <div className="mcp-form-actions">
                  <button className="setup-btn" disabled={!formValid(form)} onClick={saveForm}>Save connection</button>
                  <button className="link-btn" onClick={() => setForm(null)}>Cancel</button>
                </div>
              </div>
            )}

            <div className="field" style={{ marginTop: 16 }}>
              <label>Server scope</label>
              <div className="seg">
                <button className={!settings.mcpStrict ? "on" : ""} onClick={() => onSaveSettings({ mcpStrict: false })}>Merge with Claude Code</button>
                <button className={settings.mcpStrict ? "on" : ""} onClick={() => onSaveSettings({ mcpStrict: true })}>App-managed only</button>
              </div>
              <div className="range-val">
                {settings.mcpStrict
                  ? "Turns use ONLY the servers listed here (ignores your terminal Claude config)."
                  : "Turns use these servers plus any you've set up in Claude Code."}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KVEditor({
  label, hint, rows, onChange,
}: {
  label: string; hint?: string; rows: KV[]; onChange: (rows: KV[]) => void;
}) {
  return (
    <div className="field">
      <label>{label} {hint && <span className="hint-inline">{hint}</span>}</label>
      {rows.map((row, i) => (
        <div className="env-row" key={i}>
          <input type="text" value={row.k} placeholder="KEY"
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, k: e.target.value } : r)))} />
          <input type="text" value={row.v} placeholder="value"
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, v: e.target.value } : r)))} />
          <button className="icon-btn" title="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <X size={14} />
          </button>
        </div>
      ))}
      <button className="btn-sm" onClick={() => onChange([...rows, { k: "", v: "" }])}><Plus size={14} /> Add</button>
    </div>
  );
}

// Args as discrete rows — each argument is its own input so values containing
// spaces round-trip verbatim, never space-tokenized.
function ArgsEditor({ args, onChange }: { args: string[]; onChange: (a: string[]) => void }) {
  return (
    <div className="field">
      <label>Arguments <span className="hint-inline">one per row</span></label>
      {args.map((a, i) => (
        <div className="env-row" key={i}>
          <input type="text" value={a} placeholder={i === 0 ? "-y" : "value"}
            onChange={(e) => onChange(args.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="icon-btn" title="Remove" onClick={() => onChange(args.filter((_, j) => j !== i))}>
            <X size={14} />
          </button>
        </div>
      ))}
      <button className="btn-sm" onClick={() => onChange([...args, ""])}><Plus size={14} /> Add argument</button>
    </div>
  );
}
