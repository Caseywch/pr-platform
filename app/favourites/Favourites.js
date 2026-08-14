"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Logo from "../Logo";
import { STATUS_META, timeliness, timelinessMeta } from "../board/prHelpers";

const card = "bg-white border border-neutral-200 rounded-lg p-5";

export default function Favourites({ profile, prs, allProjectRoles, sla, cancelRequests = [] }) {
  const supabase = createClient();
  const [removedIds, setRemovedIds] = useState(new Set());

  const open = (pr) => {
    window.location.href = `/board?pr=${pr.id}`;
  };

  const unfavourite = async (pr, e) => {
    e.stopPropagation();
    // Optimistic: hide it immediately, restore on failure.
    setRemovedIds((prev) => new Set(prev).add(pr.id));
    const { error } = await supabase.from("pr_favourites").delete().eq("user_id", profile.id).eq("pr_id", pr.id);
    if (error) {
      setRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(pr.id);
        return next;
      });
    }
  };

  const visible = prs.filter((pr) => !removedIds.has(pr.id));

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <Logo height={40} />
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-600">Purchase Requisition Platform</div>
              <h1 className="text-2xl font-bold mt-0.5">Favourites</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:ml-[52px]">
            {profile?.is_admin && (
              <a href="/admin" className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 text-white">Admin Setup</a>
            )}
            <a href="/board" className="text-xs underline text-neutral-600">Board</a>
            <a href="/my-actions" className="text-xs underline text-neutral-600">My Actions</a>
            <a href="/dashboard" className="text-xs underline text-neutral-600">Dashboard</a>
            <a href="/schedule" className="text-xs underline text-neutral-600">Schedule</a>
            <a href="/" className="text-xs underline text-neutral-600">Home</a>
          </div>
        </div>

        <div className="text-sm text-neutral-600 mb-4">
          {visible.length === 0
            ? "You haven't starred any requisitions yet."
            : `${visible.length} favourited requisition${visible.length === 1 ? "" : "s"}.`}
        </div>

        <div className="flex flex-col gap-2">
          {visible.map((pr) => {
            const meta = STATUS_META[pr.status] || { label: pr.status, color: "#666" };
            const t = timelinessMeta(timeliness(pr, sla));
            return (
              <div
                key={pr.id}
                onClick={() => open(pr)}
                className={card + " p-0 text-left w-full cursor-pointer flex items-center"}
              >
                <button
                  onClick={(e) => unfavourite(pr, e)}
                  className="shrink-0 text-lg leading-none pl-4"
                  style={{ color: "#D4A017" }}
                  title="Remove from favourites"
                >
                  ★
                </button>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-3 flex-1">
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
                  </div>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {t && (
                      <span className="text-xs px-2 py-1 rounded-full" style={{ background: `${t.color}14`, color: t.color }}>
                        {t.label}
                      </span>
                    )}
                    <span className="text-xs px-2 py-1 rounded-full" style={{ background: `${meta.color}14`, color: meta.color }}>
                      {meta.label}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
