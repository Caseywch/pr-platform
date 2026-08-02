"use client";

import { useState } from "react";

const card = "bg-white border border-neutral-200 rounded-lg p-5";

function today() {
  return new Date().toISOString().slice(0, 10);
}

// Adds N working days (Mon–Fri) to a date, matching the "Working Days" SLA
// settings configured in Admin Setup.
function addWorkingDays(dateStr, days) {
  if (!dateStr || days == null) return null;
  const d = new Date(dateStr + "T00:00:00");
  let remaining = Number(days);
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return d.toISOString().slice(0, 10);
}

// The due date for whatever stage a PR currently sits in. Verify/approve/PO
// stages are measured against the SLA working-day settings from Admin Setup;
// once a PO is issued, the due date becomes the Required Date the requester
// originally asked for.
function stageDueDate(pr, sla) {
  switch (pr.status) {
    case "pending_verification":
      return addWorkingDays(pr.request_date, sla.verify_days);
    case "pending_approval":
      return addWorkingDays(pr.verified_date, sla.approve_days);
    case "pending_po":
      return addWorkingDays(pr.approved_date, sla.po_days);
    case "po_issued":
    case "partial_delivery":
      return pr.required_date;
    default:
      return null; // rejected / fulfilled — not tracked against SLA
  }
}

function isDelayed(pr, sla) {
  const due = stageDueDate(pr, sla);
  return due ? today() > due : false;
}

function groupByKey(prs, keyFn) {
  const map = {};
  for (const pr of prs) {
    const key = keyFn(pr) || "Unassigned";
    (map[key] = map[key] || []).push(pr);
  }
  return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
}

function Panel({ title, groups, accent }) {
  return (
    <div className={card}>
      <div className="text-sm font-bold mb-3">{title}</div>
      {groups.length === 0 && <div className="text-xs text-neutral-600">None right now.</div>}
      <div className="flex flex-col gap-2">
        {groups.map(([name, items]) => (
          <div key={name}>
            <div className="flex items-center justify-between text-sm">
              <span>{name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${accent}14`, color: accent }}>
                {items.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {items.map((pr) => (
                <span key={pr.id} className="text-xs px-1.5 py-0.5 rounded bg-neutral-50 border border-neutral-200 text-neutral-700">
                  {pr.pr_number}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ profile, prs, sla }) {
  const [tab, setTab] = useState("pending");

  const pendingPrs = prs.filter((p) => p.status !== "fulfilled");
  const delayedPrs = prs.filter((p) => isDelayed(p, sla));

  const set = tab === "pending" ? pendingPrs : delayedPrs;
  const accent = tab === "pending" ? "#A6791E" : "#B23A2E";

  const byRequester = groupByKey(set, (p) => p.requester?.name);
  const byProject = groupByKey(set, (p) => p.projects?.name);
  const bySupplier = groupByKey(set, (p) => p.suppliers?.name);

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4 mb-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-neutral-600">Purchase Requisition Platform</div>
            <h1 className="text-2xl font-bold mt-1">Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            {profile?.is_admin && (
              <a href="/admin" className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 text-white">Admin Setup</a>
            )}
            <a href="/board" className="text-xs underline text-neutral-600">Board</a>
            <a href="/" className="text-xs underline text-neutral-600">Home</a>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("pending")}
            className="text-sm px-4 py-2 rounded-md"
            style={{
              border: "1.5px solid #A6791E",
              background: tab === "pending" ? "#A6791E14" : "white",
              color: "#A6791E",
            }}
          >
            Pending ({pendingPrs.length})
          </button>
          <button
            onClick={() => setTab("delayed")}
            className="text-sm px-4 py-2 rounded-md"
            style={{
              border: "1.5px solid #B23A2E",
              background: tab === "delayed" ? "#B23A2E14" : "white",
              color: "#B23A2E",
            }}
          >
            Delayed ({delayedPrs.length})
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title={`${tab === "pending" ? "Pending" : "Delayed"} by Requester`} groups={byRequester} accent={accent} />
          <Panel title={`${tab === "pending" ? "Pending" : "Delayed"} by Project`} groups={byProject} accent={accent} />
          <Panel title={`${tab === "pending" ? "Pending" : "Delayed"} by Supplier`} groups={bySupplier} accent={accent} />
        </div>
      </div>
    </div>
  );
}
