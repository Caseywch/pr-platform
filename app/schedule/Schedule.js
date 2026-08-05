"use client";

import { useState } from "react";
import Logo from "../Logo";
import { scheduleDate, timeliness, STATUS_META, localDate } from "../board/prHelpers";

const card = "bg-white border border-neutral-200 rounded-lg p-5";
const DELAY = "#B23A2E";
const ONTIME = "#34456B";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeek(d) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // shift so Monday is 0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

// Local calendar day, not UTC — otherwise every column key shifts by a day.
const iso = localDate;

function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export default function Schedule({ profile, prs, sla }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [projectFilter, setProjectFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");

  const projects = Array.from(new Set(prs.map((p) => p.projects?.name).filter(Boolean))).sort();
  const suppliers = Array.from(new Set(prs.map((p) => p.suppliers?.name).filter(Boolean))).sort();

  let visible = prs;
  if (projectFilter !== "all") visible = visible.filter((p) => p.projects?.name === projectFilter);
  if (supplierFilter !== "all") visible = visible.filter((p) => p.suppliers?.name === supplierFilter);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dayKeys = days.map(iso);
  const todayKey = iso(new Date());

  // A requisition lands on the date the goods are actually expected, which is
  // the most recent promise: postponed first, then the PO date, then the
  // original request.
  const byDay = {};
  dayKeys.forEach((k) => (byDay[k] = []));
  const outsideWeek = [];
  for (const pr of visible) {
    const d = scheduleDate(pr);
    if (d && byDay[d]) byDay[d].push(pr);
    else if (d) outsideWeek.push(pr);
  }

  const weekLabel = `${days[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;

  const openPr = (pr) => {
    window.location.href = `/board?pr=${pr.id}`;
  };

  const select = "border border-neutral-300 rounded-md px-3 py-2 text-sm";
  const btn = "text-sm px-3 py-1.5 rounded-md border border-neutral-300";

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <Logo height={36} />
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-600">Purchase Requisition Platform</div>
              <h1 className="text-2xl font-bold mt-0.5">Delivery Schedule</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:ml-[52px]">
            {profile?.is_admin && (
              <a href="/admin" className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 text-white">Admin Setup</a>
            )}
            <a href="/board" className="text-xs underline text-neutral-600">Board</a>
            <a href="/dashboard" className="text-xs underline text-neutral-600">Dashboard</a>
            <a href="/" className="text-xs underline text-neutral-600">Home</a>
          </div>
        </div>

        <div className={card + " mb-5"}>
          <div className="mb-3">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setWeekStart(addDays(weekStart, -7))}
                className={`${btn} flex flex-col items-center justify-center leading-tight py-2`}
              >
                <span>←</span>
                <span>Previous</span>
              </button>
              <button
                onClick={() => setWeekStart(startOfWeek(new Date()))}
                className={`${btn} flex flex-col items-center justify-center leading-tight py-2`}
              >
                <span>&nbsp;</span>
                <span>This week</span>
              </button>
              <button
                onClick={() => setWeekStart(addDays(weekStart, 7))}
                className={`${btn} flex flex-col items-center justify-center leading-tight py-2`}
              >
                <span>→</span>
                <span>Next</span>
              </button>
            </div>
            <div
              className="text-sm font-medium text-center rounded-md py-2 mt-2"
              style={{ background: "#404040", color: "white" }}
            >
              {weekLabel}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select className={select} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              <option value="all">All projects</option>
              {projects.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className={select} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
              <option value="all">All suppliers</option>
              {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-xs text-neutral-600 ml-auto flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span style={{ width: 12, height: 12, background: DELAY, borderRadius: 2, display: "inline-block" }} /> Delay
              </span>
              <span className="flex items-center gap-1.5">
                <span style={{ width: 12, height: 12, background: ONTIME, borderRadius: 2, display: "inline-block" }} /> On-time
              </span>
            </span>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {days.map((d, i) => {
            const key = dayKeys[i];
            const items = byDay[key] || [];
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className="bg-white border rounded-lg p-2 flex flex-col shrink-0"
                style={{ minHeight: 180, width: 140, borderColor: isToday ? "#171717" : "#e5e5e5" }}
              >
                <div className="text-center mb-2 pb-2 border-b border-neutral-100">
                  <div className="text-xs uppercase tracking-wide text-neutral-600">{DAY_NAMES[i]}</div>
                  <div className="text-sm font-medium" style={{ color: isToday ? "#171717" : undefined }}>
                    {d.getDate()}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  {items.map((pr) => {
                    const late = timeliness(pr, sla) === "delay";
                    const colour = late ? DELAY : ONTIME;
                    return (
                      <button
                        key={pr.id}
                        onClick={() => openPr(pr)}
                        className="text-left rounded px-1.5 py-1"
                        style={{ background: `${colour}14`, borderLeft: `3px solid ${colour}` }}
                        title={`${pr.pr_number} · ${STATUS_META[pr.status]?.label || pr.status}`}
                      >
                        <div className="text-xs font-medium" style={{ color: colour }}>{pr.pr_number}</div>
                        <div className="text-xs text-neutral-600 truncate">{pr.suppliers?.name}</div>
                        <div className="text-xs text-neutral-600 truncate">{pr.projects?.name}</div>
                        {pr.postponed_delivery_date && (
                          <div className="text-xs" style={{ color: DELAY }}>postponed</div>
                        )}
                      </button>
                    );
                  })}
                  {items.length === 0 && <div className="text-xs text-neutral-400 text-center mt-2">—</div>}
                </div>
              </div>
            );
          })}
        </div>

        {outsideWeek.length > 0 && (
          <div className={card + " mt-5"}>
            <div className="text-sm font-bold mb-1">Not in this week</div>
            <div className="text-xs text-neutral-600 mb-3">
              {outsideWeek.length} outstanding deliver{outsideWeek.length === 1 ? "y falls" : "ies fall"} outside
              the week shown. Use the arrows above to find them.
            </div>
            <div className="flex flex-wrap gap-1.5">
              {outsideWeek
                .sort((a, b) => (scheduleDate(a) || "").localeCompare(scheduleDate(b) || ""))
                .map((pr) => {
                  const late = timeliness(pr, sla) === "delay";
                  const colour = late ? DELAY : ONTIME;
                  return (
                    <button
                      key={pr.id}
                      onClick={() => openPr(pr)}
                      className="text-xs px-2 py-1 rounded"
                      style={{ background: `${colour}14`, color: colour }}
                    >
                      {pr.pr_number} · {scheduleDate(pr)}
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
