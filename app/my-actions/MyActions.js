"use client";

import Logo from "../Logo";
import {
  STATUS_META,
  timeliness,
  timelinessMeta,
  pendingActionsFor,
  actionLabelFor,
  benchmarkDate,
} from "../board/prHelpers";

const card = "bg-white border border-neutral-200 rounded-lg p-5";

export default function MyActions({ profile, prs, allProjectRoles, sla }) {
  const mine = pendingActionsFor(prs, profile, allProjectRoles);

  // Most pressing first: anything already late, then by the date it's due.
  const sorted = [...mine].sort((a, b) => {
    const la = timeliness(a, sla) === "delay" ? 0 : 1;
    const lb = timeliness(b, sla) === "delay" ? 0 : 1;
    if (la !== lb) return la - lb;
    return (benchmarkDate(a) || "").localeCompare(benchmarkDate(b) || "");
  });

  const open = (pr) => {
    window.location.href = `/board?pr=${pr.id}`;
  };

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <Logo height={40} />
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-600 hidden sm:block">Purchase Requisition Platform</div>
              <h1 className="text-2xl font-bold mt-0.5">My Actions</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {profile?.is_admin && (
              <a href="/admin" className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 text-white">Admin Setup</a>
            )}
            <a href="/board" className="text-xs underline text-neutral-600">Board</a>
            <a href="/dashboard" className="text-xs underline text-neutral-600">Dashboard</a>
            <a href="/schedule" className="text-xs underline text-neutral-600">Schedule</a>
            <a href="/" className="text-xs underline text-neutral-600">Home</a>
          </div>
        </div>

        <div className="text-sm text-neutral-600 mb-4">
          {sorted.length === 0
            ? "Nothing is waiting on you right now."
            : `${sorted.length} requisition${sorted.length === 1 ? "" : "s"} waiting on you.`}
          {profile?.is_admin && (
            <span className="block text-xs mt-1">
              As an Administrator you can act on any requisition, but this list only shows the ones
              where you hold the assigned role.
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {sorted.map((pr) => {
            const meta = STATUS_META[pr.status] || { label: pr.status, color: "#666" };
            const t = timelinessMeta(timeliness(pr, sla));
            return (
              <button
                key={pr.id}
                onClick={() => open(pr)}
                className={card + " p-0 text-left w-full"}
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {pr.pr_number}{" "}
                      <span className="text-neutral-600">
                        · {pr.projects?.name || "Unknown project"} ({pr.projects?.code || ""})
                      </span>
                    </div>
                    <div className="text-xs text-neutral-600 mt-0.5">
                      {pr.suppliers?.name || "No supplier"} · raised by {pr.requester?.name || "\u2014"}
                    </div>
                    <div className="text-xs mt-1 font-medium" style={{ color: meta.color }}>
                      {actionLabelFor(pr)}
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 shrink-0 ml-3">
                    {t && (
                      <span
                        className="text-xs px-2 py-1 rounded-full"
                        style={{ background: `${t.color}14`, color: t.color }}
                      >
                        {t.label}
                      </span>
                    )}
                    <span
                      className="text-xs px-2 py-1 rounded-full"
                      style={{ background: `${meta.color}14`, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
