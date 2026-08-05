"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

// Branded dropdown controls for the rail — replace the chip clutter with
// compact single-select (group-by) and multi-select (pipelines) dropdowns that
// drive the URL query params.

type Dim = { key: string; label: string };
type CatGroup = { category: string; pipelines: { id: string; label: string; stages: number }[] };

type UrlState = { pipelines: string[]; groupBy: string; demo: boolean };

function buildQuery(
  next: Partial<UrlState>,
  base: UrlState,
  defaults: string[],
  allIds: string[],
): string {
  const pipelines = next.pipelines ?? base.pipelines;
  const groupBy = next.groupBy ?? base.groupBy;
  const demo = next.demo ?? base.demo;
  const params = new URLSearchParams();
  const same =
    pipelines.length === defaults.length && pipelines.every((id) => defaults.includes(id));
  if (!same) params.set("pipelines", allIds.filter((id) => pipelines.includes(id)).join(","));
  if (groupBy && groupBy !== "pipeline") params.set("groupBy", groupBy);
  if (demo) params.set("demo", "1");
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
