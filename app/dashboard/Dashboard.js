"use client";

import { useState } from "react";
import Logo from "../Logo";
import { STATUS_META, benchmarkDate, timeliness } from "../board/prHelpers";

const card = "bg-white border border-neutral-200 rounded-lg p-5";

const DELAY = "#B23A2E";
const ONTIME = "#34456B";

const GROUPINGS = [
  { id: "project", label: "Project" },
  { id: "user", label: "User" },
  { id: "supplier", label: "Supplier" },
];
const STATUSES = [
  { id: "open", label: "Open" },
  { id: "fulfilled", label: "Fulfilled" },
  { id: "all", label: "All" },
];
const TIMELINESS = [
  { id: "all", label: "All" },
  { id: "ontime", label: "On-time" },
  { id: "delay", label: "Delay" },
];

function FilterRow({ label, options, value, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs uppercase tracking-wide text-neutral-600 w-20 shrink-0">{label}</span>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className="text-sm px-3 py-1.5 rounded-md"
          style={
            value === o.id
              ? { background: "#171717", color: "white" }
              : { border: "1px solid #d4d4d4", color: "#404040" }
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard({ profile, prs, sla }) {
  const [groupBy, setGroupBy] = useState("project");
  const [statusFilter, setStatusFilter] = useState("open");
  const [timeFilter, setTimeFilter] = useState("all");

  // Cancelled requisitions are left out entirely — they're not work in progress
  // and would distort every count.
  let visible = prs.filter((p) => p.status !== "cancelled");

  if (statusFilter === "open") visible = visible.filter((p) => p.status !== "fulfilled");
  if (statusFilter === "fulfilled") visible = visible.filter((p) => p.status === "fulfilled");

  const withTime = visible.map((p) => ({ ...p, _t: timeliness(p, sla) }));
  const filtered =
    timeFilter === "all" ? withTime : withTime.filter((p) => p._t === timeFilter);

  const keyOf = (pr) => {
    if (groupBy === "user") return pr.requester?.name || "Unassigned";
    if (groupBy === "supplier") return pr.suppliers?.name || "No supplier";
    return pr.projects?.name || "No project";
  };

  const groups = {};
  for (const pr of filtered) {
    const k = keyOf(pr);
    (groups[k] = groups[k] || []).push(pr);
  }

  // Delayed work sits at the top of each column so the problems are at eye level.
  // Within the delayed group the longest-running issues come first; within the
  // on-time group the soonest deadlines come first.
  const ordered = Object.entries(groups)
    .map(([name, items]) => {
      const delayed = items
        .filter((p) => p._t === "delay")
        .sort((a, b) => (benchmarkDate(b) || "").localeCompare(benchmarkDate(a) || ""));
      const ontime = items
        .filter((p) => p._t !== "delay")
        .sort((a, b) => (benchmarkDate(a) || "").localeCompare(benchmarkDate(b) || ""));
      return { name, items: [...delayed, ...ontime], delayCount: delayed.length };
    })
    .sort((a, b) => b.items.length - a.items.length);

  const tallest = ordered.reduce((m, g) => Math.max(m, g.items.length), 0);
  // Boxes shrink as a column grows so tall stacks still fit on screen.
  const boxSize = Math.max(20, Math.min(58, 58 - Math.max(0, tallest - 6) * 3));
  const showNumber = boxSize >= 34;

  const openPr = (pr) => {
    window.location.href = `/board?pr=${pr.id}`;
  };

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <Logo height={36} />
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-600">Purchase Requisition Platform</div>
              <h1 className="text-2xl font-bold mt-0.5">Dashboard</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {profile?.is_admin && (
              <a href="/admin" className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 text-white">Admin Setup</a>
            )}
            <a href="/board" className="text-xs underline text-neutral-600">Board</a>
            <a href="/" className="text-xs underline text-neutral-600">Home</a>
          </div>
        </div>

        <div className={card + " mb-5"}>
          <div className="flex flex-col gap-2.5">
            <FilterRow label="Group by" options={GROUPINGS} value={groupBy} onChange={setGroupBy} />
            <FilterRow label="Status" options={STATUSES} value={statusFilter} onChange={setStatusFilter} />
            <FilterRow label="Timeliness" options={TIMELINESS} value={timeFilter} onChange={setTimeFilter} />
          </div>
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-neutral-100 text-xs text-neutral-600">
            <span className="flex items-center gap-1.5">
              <span style={{ width: 12, height: 12, background: DELAY, borderRadius: 2, display: "inline-block" }} /> Delay
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 12, height: 12, background: ONTIME, borderRadius: 2, display: "inline-block" }} /> On-time
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 12, height: 12, background: ONTIME, opacity: 0.35, borderRadius: 2, display: "inline-block" }} /> Fulfilled
            </span>
            <span className="ml-auto">Showing {filtered.length} requisition{filtered.length === 1 ? "" : "s"}</span>
          </div>
        </div>

        <div className={card}>
          {ordered.length === 0 && (
            <div className="text-sm text-neutral-600 text-center py-10">
              Nothing matches these filters.
            </div>
          )}

          {ordered.length > 0 && (
            <div className="flex items-end gap-6 overflow-x-auto pb-2" style={{ minHeight: 200 }}>
              {ordered.map((g) => (
                <div key={g.name} className="flex flex-col items-center shrink-0">
                  <div className="flex flex-col-reverse gap-1 mb-2">
                    {[...g.items].reverse().map((pr) => {
                      const isDelay = pr._t === "delay";
                      const base = isDelay ? DELAY : ONTIME;
                      const isFulfilled = pr.status === "fulfilled";
                      return (
                        <button
                          key={pr.id}
                          onClick={() => openPr(pr)}
                          title={`${pr.pr_number} · ${STATUS_META[pr.status]?.label || pr.status}${isDelay ? " · Delay" : " · On-time"}`}
                          className="rounded flex items-center justify-center"
                          style={{
                            width: boxSize,
                            height: boxSize,
                            background: base,
                            opacity: isFulfilled ? 0.35 : 1,
                            color: "white",
                            fontSize: Math.max(7, Math.round(boxSize / 5.5)),
                            lineHeight: 1.05,
                            padding: 2,
                            wordBreak: "break-all",
                          }}
                        >
                          {showNumber ? pr.pr_number.replace(/^.*-PR/, "PR") : ""}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-xs font-medium text-center" style={{ maxWidth: 110 }}>{g.name}</div>
                  <div className="text-xs text-neutral-600">
                    {g.items.length}
                    {g.delayCount > 0 && <span style={{ color: DELAY }}> · {g.delayCount} late</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
