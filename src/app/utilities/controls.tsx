"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

// Branded dropdown controls for the rail — replace the chip clutter with
// compact single-select (group-by) and multi-select (pipelines) dropdowns that
// drive the URL query params.

type Dim = { key: string; label: string };
type CatGroup = { category: string; pipelines: { id: string; label: string; stages: number }[] };

type UrlState = { pipelines: string[]; groupBy: string; demo: boolean; owner: string | null };

function buildQuery(
  next: Partial<UrlState>,
  base: UrlState,
  defaults: string[],
  allIds: string[],
): string {
  const pipelines = next.pipelines ?? base.pipelines;
  const groupBy = next.groupBy ?? base.groupBy;
  const demo = next.demo ?? base.demo;
  const owner = next.owner !== undefined ? next.owner : base.owner;
  const params = new URLSearchParams();
  const same =
    pipelines.length === defaults.length && pipelines.every((id) => defaults.includes(id));
  if (!same) params.set("pipelines", allIds.filter((id) => pipelines.includes(id)).join(","));
  if (groupBy && groupBy !== "pipeline") params.set("groupBy", groupBy);
  if (demo) params.set("demo", "1");
  if (owner) params.set("owner", owner);
  const qs = params.toString();
  return `/utilities${qs ? `?${qs}` : ""}`;
}

function useOutsideClose(setOpen: (v: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [setOpen]);
  return ref;
}

// ── Group-by (single-select) ────────────────────────────────────────────────

export function GroupByDropdown({
  dims,
  base,
  defaults,
  allIds,
}: {
  dims: Dim[];
  base: UrlState;
  defaults: string[];
  allIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(setOpen);
  const current = dims.find((d) => d.key === base.groupBy) ?? dims[0];

  return (
    <div className="dd" ref={ref}>
      <button className={`dd-trigger ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)}>
        <span className="dd-val">{current.label}</span>
        <span className="dd-caret">▾</span>
      </button>
      {open && (
        <div className="dd-panel">
          <ul className="dd-list">
            {dims.map((d) => (
              <li
                key={d.key}
                className={`dd-opt ${d.key === base.groupBy ? "on" : ""}`}
                onClick={() => {
                  setOpen(false);
                  router.push(buildQuery({ groupBy: d.key }, base, defaults, allIds));
                }}
              >
                <span className={`dd-box radio ${d.key === base.groupBy ? "on" : ""}`}>
                  {d.key === base.groupBy ? "•" : ""}
                </span>
                <span className="dd-opt-label">{d.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Pipelines (multi-select, grouped, searchable, Apply) ────────────────────

export function PipelinesDropdown({
  catalog,
  base,
  defaults,
  allIds,
}: {
  catalog: CatGroup[];
  base: UrlState;
  defaults: string[];
  allIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set(base.pipelines));
  const ref = useOutsideClose(setOpen);

  // Re-seed from the URL whenever it changes (e.g. Default/All/None navigations).
  useEffect(() => {
    setChecked(new Set(base.pipelines));
  }, [base.pipelines]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return catalog;
    return catalog
      .map((c) => ({
        category: c.category,
        pipelines: c.pipelines.filter((p) => p.label.toLowerCase().includes(needle)),
      }))
      .filter((c) => c.pipelines.length > 0);
  }, [q, catalog]);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const apply = () => {
    setOpen(false);
    router.push(buildQuery({ pipelines: allIds.filter((id) => checked.has(id)) }, base, defaults, allIds));
  };

  const summary =
    checked.size === 0
      ? "None selected"
      : checked.size === allIds.length
        ? "All pipelines"
        : `${checked.size} selected`;

  return (
    <div className="dd" ref={ref}>
      <button className={`dd-trigger ${open ? "open" : ""} ${checked.size ? "active" : ""}`} onClick={() => setOpen((v) => !v)}>
        <span className="dd-val">{summary}</span>
        <span className="dd-caret">▾</span>
      </button>
      {open && (
        <div className="dd-panel wide">
          <input
            className="dd-search"
            placeholder="Search pipelines…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="dd-actions">
            <button className="dd-link" onClick={() => setChecked(new Set(allIds))}>All</button>
            <button className="dd-link" onClick={() => setChecked(new Set())}>None</button>
            <button className="dd-link" onClick={() => setChecked(new Set(defaults))}>Default</button>
            <span className="dd-count">{checked.size} selected</span>
          </div>
          <div className="dd-scroll">
            {filtered.map((c) => (
              <div key={c.category}>
                <div className="dd-cat">{c.category}</div>
                <ul className="dd-list">
                  {c.pipelines.map((p) => (
                    <li key={p.id} className={`dd-opt ${checked.has(p.id) ? "on" : ""}`} onClick={() => toggle(p.id)}>
                      <span className={`dd-box ${checked.has(p.id) ? "on" : ""}`}>{checked.has(p.id) ? "✓" : ""}</span>
                      <span className="dd-opt-label">{p.label}</span>
                      <span className="dd-opt-sub">{p.stages}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {filtered.length === 0 && <div className="dd-empty">No pipelines match.</div>}
          </div>
          <button className="dd-apply" onClick={apply}>Apply</button>
        </div>
      )}
    </div>
  );
}

// ── Sample-data toggle ───────────────────────────────────────────────────────

export function DemoToggle({
  base,
  defaults,
  allIds,
}: {
  base: UrlState;
  defaults: string[];
  allIds: string[];
}) {
  const router = useRouter();
  return (
    <button
      className="dd-clear"
      onClick={() => router.push(buildQuery({ demo: !base.demo }, base, defaults, allIds))}
    >
      {base.demo ? "Exit sample preview" : "Preview with sample data"}
    </button>
  );
}

// ── Owner filter (single-select of ticket owners) ───────────────────────────

export function OwnerFilter({
  owners,
  base,
  defaults,
  allIds,
}: {
  owners: Array<{ id: string; name: string }>;
  base: UrlState;
  defaults: string[];
  allIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useOutsideClose(setOpen);
  const current = base.owner ? owners.find((o) => o.id === base.owner) : null;
  const filtered = q.trim()
    ? owners.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()))
    : owners;

  const go = (owner: string | null) => {
    setOpen(false);
    router.push(buildQuery({ owner }, base, defaults, allIds));
  };

  return (
    <div className="dd" ref={ref}>
      <button className={`dd-trigger ${open ? "open" : ""} ${base.owner ? "active" : ""}`} onClick={() => setOpen((v) => !v)}>
        <span className="dd-val">{current ? current.name : "All owners"}</span>
        <span className="dd-caret">▾</span>
      </button>
      {open && (
        <div className="dd-panel wide">
          <input className="dd-search" placeholder="Search owners…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="dd-scroll">
            <ul className="dd-list">
              <li className={`dd-opt ${!base.owner ? "on" : ""}`} onClick={() => go(null)}>
                <span className={`dd-box radio ${!base.owner ? "on" : ""}`}>{!base.owner ? "•" : ""}</span>
                <span className="dd-opt-label">All owners</span>
              </li>
              {filtered.map((o) => (
                <li key={o.id} className={`dd-opt ${base.owner === o.id ? "on" : ""}`} onClick={() => go(o.id)}>
                  <span className={`dd-box radio ${base.owner === o.id ? "on" : ""}`}>{base.owner === o.id ? "•" : ""}</span>
                  <span className="dd-opt-label">{o.name}</span>
                </li>
              ))}
              {filtered.length === 0 && <div className="dd-empty">No owners match.</div>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline stage change (writes hs_pipeline_stage) ──────────────────────────

export function StageSelect({
  ticketId,
  pipelineId,
  stageId,
  stages,
}: {
  ticketId: string;
  pipelineId: string;
  stageId: string;
  stages: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [val, setVal] = useState(stageId);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => setVal(stageId), [stageId]);

  async function onChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const prev = val;
    setVal(next);
    setSaving(true);
    setErr(false);
    try {
      const res = await fetch("/api/hubspot/ticket/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, pipelineId, stageId: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setVal(prev);
      setErr(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select className={`rowstage ${err ? "err" : ""}`} value={val} onChange={onChange} disabled={saving} aria-busy={saving}>
      {stages.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

// ── In-row note with @mention (creates a HubSpot note, tags/notifies) ───────

type Owner = { id: string; name: string; email: string | null };
let ownersCache: Owner[] | null = null;
async function loadOwners(): Promise<Owner[]> {
  if (ownersCache) return ownersCache;
  try {
    const r = await fetch("/api/hubspot/owners");
    const j = (await r.json()) as { owners?: Owner[] };
    ownersCache = j.owners ?? [];
  } catch {
    ownersCache = [];
  }
  return ownersCache;
}

export function NoteButton({ ticketId, subject }: { ticketId: string; subject: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [owners, setOwners] = useState<Owner[]>([]);
  const [mentions, setMentions] = useState<Map<string, string>>(new Map());
  const [menu, setMenu] = useState<{ q: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const ref = useOutsideClose(() => {
    setOpen(false);
    setMenu(null);
  });

  useEffect(() => {
    if (open && owners.length === 0) loadOwners().then(setOwners);
  }, [open, owners.length]);

  function onInput(e: ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setText(v);
    const caret = e.target.selectionStart ?? v.length;
    const m = v.slice(0, caret).match(/@([\p{L}\p{N}._-]*)$/u);
    setMenu(m ? { q: m[1] } : null);
  }

  function pick(o: Owner) {
    const ta = taRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\p{L}\p{N}._-]*)$/u, `@${o.name} `);
    const nt = before + text.slice(caret);
    setText(nt);
    setMentions((prev) => new Map(prev).set(o.name, o.id));
    setMenu(null);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(before.length, before.length);
    }, 0);
  }

  async function submit() {
    if (!text.trim()) return;
    setStatus("saving");
    const ids = [...mentions.entries()].filter(([name]) => text.includes("@" + name)).map(([, id]) => id);
    try {
      const res = await fetch("/api/hubspot/ticket/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, body: text, mentionOwnerIds: ids }),
      });
      if (!res.ok) throw new Error();
      setStatus("saved");
      setText("");
      setMentions(new Map());
      setTimeout(() => {
        setStatus("idle");
        setOpen(false);
      }, 900);
    } catch {
      setStatus("error");
    }
  }

  const filtered = menu
    ? owners.filter((o) => o.name.toLowerCase().includes(menu.q.toLowerCase())).slice(0, 6)
    : [];

  return (
    <div className="notewrap" ref={ref}>
      <button className="notebtn" title="Add a note" onClick={() => setOpen((v) => !v)} aria-label="Add a note">
        ✎
      </button>
      {open && (
        <div className="notepop">
          <div className="notehead">
            Note · <span className="muted">{subject.slice(0, 44)}</span>
          </div>
          <div className="notebody">
            <textarea
              ref={taRef}
              className="noteta"
              value={text}
              onChange={onInput}
              placeholder="Write a note… type @ to tag a teammate"
              rows={4}
              autoFocus
            />
            {menu && filtered.length > 0 && (
              <div className="mentionmenu">
                {filtered.map((o) => (
                  <div
                    key={o.id}
                    className="mentionopt"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(o);
                    }}
                  >
                    {o.name}
                    {o.email ? <span className="muted"> · {o.email}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="notefoot">
            <span className="muted" style={{ fontSize: 11 }}>
              {status === "saved"
                ? "Saved ✓"
                : status === "error"
                  ? "Failed — retry"
                  : status === "saving"
                    ? "Saving…"
                    : "@ tags & notifies in HubSpot"}
            </span>
            <button
              className="notesubmit"
              disabled={!text.trim() || status === "saving"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={submit}
            >
              Add note
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
