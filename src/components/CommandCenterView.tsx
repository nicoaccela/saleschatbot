import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw, ExternalLink, ListChecks, Loader2, AlertTriangle,
  MessageSquarePlus, Clock, Folder,
} from "lucide-react";
import { todaysSix, taskPrompt, dueLabel, age } from "../lib/boardRank";
import type { BoardTask } from "../lib/types";

/**
 * CommandCenterView — the rep's Command Center, as a full view inside the app.
 *
 * Deliberately NOT a modal. The board is a working surface the rep sits in, not
 * a dialog they dismiss; making it a modal is what sent them back to hunting for
 * a browser tab. The sidebar stays put, so switching between the board and a
 * chat is one click and never leaves the app.
 *
 * Two halves:
 *   - the focus rail (ours, native): today's six, each with a button that opens
 *     a chat already carrying the task's context
 *   - the board itself (the skill's own HTML, in an iframe): everything else,
 *     running in live mode so a check-off writes straight to tasks.json
 */
const SWEEP_PROMPT =
  "Run the task-sweep skill and fill my Command Center from my mail and calendar.";

export default function CommandCenterView({
  onWorkTask,
}: {
  onWorkTask: (prompt: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const [workspace, setWorkspace] = useState(false);
  const [dir, setDir] = useState("");
  const [counts, setCounts] = useState<{ owed: number; waiting: number; total: number } | null>(null);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [nonce, setNonce] = useState(0);

  const boot = useCallback(async () => {
    setErr(null);
    try {
      const r = await window.accela.openTaskBoard();
      setUrl(r.url);
      setFresh(r.scaffolded);
      setWorkspace(r.workspace);
      setDir(r.dir);
      const st = await window.accela.taskBoardStatus();
      setCounts(st.counts);
      setTasks(await window.accela.taskBoardTasks());
      setNonce((n) => n + 1); // force the iframe to re-read after a rebuild
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }, []);

  useEffect(() => { boot(); }, [boot]);

  const empty = fresh || (counts !== null && counts.total === 0);
  const six = todaysSix(tasks);

  return (
    <div className="cc-view">
      <div className="cc-head">
        <h2><ListChecks size={17} /> Command Center</h2>
        {counts && (
          <span className="cc-counts">
            <b>{counts.owed}</b> owed · <b>{counts.waiting}</b> waiting
          </span>
        )}
        <div style={{ flex: 1 }} />
        {dir && (
          <span className="cc-src" title={dir}>
            <Folder size={12} />
            {workspace ? "Sales Workspace board" : "This machine only"}
          </span>
        )}
        <button className="icon-btn" title="Reload" onClick={boot}>
          <RefreshCw size={15} />
        </button>
        {url && (
          <button
            className="icon-btn"
            title="Open in a browser window"
            onClick={() => window.accela.openExternal(url)}
          >
            <ExternalLink size={15} />
          </button>
        )}
      </div>

      {err && (
        <div className="cc-body">
          <div className="mcp-warn">
            <AlertTriangle size={16} />
            <div>
              <b>The board could not start.</b>
              <div style={{ marginTop: 4 }}>{err}</div>
              <div className="sub" style={{ marginTop: 8, fontSize: 12 }}>
                It needs python3 and the Command Center skill installed. Import
                the skill pack from Help &amp; setup, then reload.
              </div>
            </div>
          </div>
        </div>
      )}

      {!err && !url && (
        <div className="cc-body cc-center">
          <div className="sub" style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <Loader2 size={16} className="spin" /> Starting your board…
          </div>
        </div>
      )}

      {!err && url && (
        <div className="cc-split">
          <div className="cc-rail">
            {empty ? (
              <div className="cc-rail-empty">
                <b>Your board is empty.</b>
                <p>
                  There is no shared task list. Yours is built from your own mail
                  and calendar.
                </p>
                <button className="prim-btn" onClick={() => onWorkTask(SWEEP_PROMPT)}>
                  Run a task sweep
                </button>
              </div>
            ) : (
              <>
                <div className="cc-rail-head">
                  Today · {six.length === 1 ? "1 thing" : `${six.length} things`}
                </div>
                {six.map((t, i) => {
                  const due = dueLabel(t.due);
                  const old = age(t.received);
                  return (
                    <div className={`cc-task${i === 0 ? " hero" : ""}`} key={t.id}>
                      <div className="cc-task-top">
                        {t.account && <span className="cc-acct">{t.account}</span>}
                        {due && <span className="cc-due">{due}</span>}
                      </div>
                      <div className="cc-task-title">{t.title}</div>
                      {t.firstAction && (
                        <div className="cc-first">
                          <span>1st</span> {t.firstAction}
                        </div>
                      )}
                      <div className="cc-task-foot">
                        {t.effortMin != null && (
                          <span className="cc-meta"><Clock size={11} /> {t.effortMin}m</span>
                        )}
                        {old > 0 && <span className="cc-meta">{old}d old</span>}
                        <div style={{ flex: 1 }} />
                        <button
                          className="cc-work"
                          onClick={() => onWorkTask(taskPrompt(t))}
                        >
                          <MessageSquarePlus size={13} /> Work this
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="cc-rail-foot">
                  Check things off on the board. It saves as you go.
                </div>
              </>
            )}
          </div>

          <iframe
            key={nonce}
            src={url}
            title="Command Center"
            className="cc-frame"
          />
        </div>
      )}
    </div>
  );
}
