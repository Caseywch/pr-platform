"use client";

import Logo from "../Logo";
import {
  STATUS_META,
  timeliness,
  timelinessMeta,
  pendingActionsFor,
  actionLabelFor,
  benchmarkDate,
  pendingCancelRequestsFor,
  cancelRequestActionLabel,
  pendingChangeRequestsFor,
  changeRequestActionLabel,
} from "../board/prHelpers";

const card = "bg-white border border-neutral-200 rounded-lg p-5";

export default function MyActions({ profile, prs, allProjectRoles, sla, cancelRequests = [], changeRequests = [] }) {
  const mine = pendingActionsFor(prs, profile, allProjectRoles, cancelRequests);
  const cancelMine = pendingCancelRequestsFor(cancelRequests, prs, profile);
  const changeMine = pendingChangeRequestsFor(changeRequests, prs, profile);

  // Most pressing first: cancellation requests before routine work (they're
  // usually time-sensitive), then anything already late, then by due date.
  const sortedMine = [...mine].sort((a, b) => {
    const la = timeliness(a, sla) === "delay" ? 0 : 1;
    const lb = timeliness(b, sla) === "delay" ? 0 : 1;
    if (la !== lb) return la - lb;
    return (benchmarkDate(a) || "").localeCompare(benchmarkDate(b) || "");
  });
  const sorted = [...cancelMine, ...changeMine, ...sortedMine];

  const open = (pr) => {
    window.location.href = `/board?pr=${pr.id}`;
  };

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <Logo height={40} />
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-600">Purchase Requisition Platform</div>
              <h1 className="text-2xl font-bold mt-0.5">My Actions</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:ml-[52px]">
            {profile?.is_admin && (
              <a href="/admin" className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 text-white">Admin Setup</a>
            )}
            <a href="/board" className="text-xs underline text-neutral-600">Board</a>
            <a href="/dashboard" className="text-xs underline text-neutral-600">Dashboard</a>
            <a href="/schedule" className="text-xs underline text-neutral-600">Schedule</a>
            <a href="/favourites" className="text-xs underline text-neutral-600">Favourites</a>
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
            const isCancelRequest = !!pr._cancelRequest;
            const isChangeRequest = !!pr._changeRequest;
            const meta = STATUS_META[pr.status] || { label: pr.status, color: "#666" };
            const t = timelinessMeta(timeliness(pr, sla));
            return (
              <button
                key={pr._cancelRequest ? `cancel-${pr._cancelRequest.id}` : pr._changeRequest ? `change-${pr._changeRequest.id}` : pr.id}
                onClick={() => open(pr)}
                className={card + " p-0 text-left w-full"}
                style={isCancelRequest ? { borderColor: "#B23A2E" } : isChangeRequest ? { borderColor: "#B8860B" } : undefined}
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-3">
                  <div className="min-w-[150px] flex-1">
                    <div className="text-sm font-medium break-words">
                      {pr.pr_number}{" "}
                      <span className="text-neutral-600">
                        · {pr.projects?.name || "Unknown project"} ({pr.projects?.code || ""})
                      </span>
                    </div>
                    <div className="text-xs text-neutral-600 mt-0.5">
                      {pr.suppliers?.name || "No supplier"} · raised by {pr.requester?.name || "\u2014"}
                    </div>
                    <div
                      className="text-xs mt-1 font-medium"
                      style={{ color: isCancelRequest ? "#B23A2E" : isChangeRequest ? "#B8860B" : meta.color }}
                    >
                      {isCancelRequest
                        ? cancelRequestActionLabel(pr._cancelRequest)
                        : isChangeRequest
                        ? changeRequestActionLabel()
                        : actionLabelFor(pr)}
                    </div>
                  </div>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {isCancelRequest && (
                      <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: "#B23A2E14", color: "#B23A2E" }}>
                        Cancellation Requested
                      </span>
                    )}
                    {isChangeRequest && (
                      <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: "#B8860B14", color: "#B8860B" }}>
                        Change Requested
                      </span>
                    )}
                    {!isCancelRequest && !isChangeRequest && t && (
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
