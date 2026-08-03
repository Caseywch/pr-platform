"use client";

import { useState } from "react";

const btn = "text-sm px-3 py-1.5 rounded-md";
const input = "border border-neutral-300 rounded-md px-3 py-2 text-sm";
const card = "bg-white border border-neutral-200 rounded-lg p-5";

// Suppliers typed in by a Requester arrive here. Approving one makes it
// available to everyone; rejecting merges its requisitions onto a supplier
// you already have, so nothing is left pointing at a dead record.
export default function PendingTab({ supabase, suppliers, setSuppliers, fail }) {
  const [busyId, setBusyId] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [mergeInto, setMergeInto] = useState("");
  const [notice, setNotice] = useState("");

  const pending = suppliers.filter((s) => s.status === "pending");
  const approved = suppliers.filter((s) => s.status !== "pending");

  const approve = async (sup) => {
    setBusyId(sup.id);
    const { error } = await supabase
      .from("suppliers")
      .update({ status: "approved" })
      .eq("id", sup.id);
    setBusyId(null);
    if (error) return fail(error);
    setSuppliers(suppliers.map((s) => (s.id === sup.id ? { ...s, status: "approved" } : s)));
    setNotice(`${sup.name} approved and is now available to everyone.`);
  };

  const reject = async (sup) => {
    if (!mergeInto) return;
    setBusyId(sup.id);

    // Point any requisitions that used the rejected name at the chosen supplier
    const { error: moveErr } = await supabase
      .from("purchase_requisitions")
      .update({ supplier_id: mergeInto })
      .eq("supplier_id", sup.id);
    if (moveErr) {
      setBusyId(null);
      return fail(moveErr);
    }

    const { error: delErr } = await supabase.from("suppliers").delete().eq("id", sup.id);
    setBusyId(null);
    if (delErr) return fail(delErr);

    const target = suppliers.find((s) => s.id === mergeInto);
    setSuppliers(suppliers.filter((s) => s.id !== sup.id));
    setRejectFor(null);
    setMergeInto("");
    setNotice(`${sup.name} rejected. Its requisitions now use ${target ? target.name : "the supplier you chose"}.`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={card}>
        <div className="text-sm font-bold mb-1">Suppliers awaiting approval</div>
        <div className="text-xs text-neutral-600 mb-3">
          These were typed in by a Requester while raising a requisition. They only appear in
          everyone else&apos;s supplier list once you approve them.
        </div>

        {notice && (
          <div className="text-xs mb-3 px-3 py-2 rounded-md bg-emerald-50 text-emerald-700">{notice}</div>
        )}

        {pending.length === 0 && (
          <div className="text-sm text-neutral-600">Nothing waiting for approval.</div>
        )}

        <div className="flex flex-col gap-2">
          {pending.map((sup) => (
            <div key={sup.id}>
              <div className="flex items-center justify-between border border-neutral-200 rounded-md px-3 py-2">
                <div className="text-sm font-medium">{sup.name}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approve(sup)}
                    disabled={busyId === sup.id}
                    className={`${btn} text-white`}
                    style={{ background: "#1F6B63" }}
                  >
                    {busyId === sup.id ? "Working…" : "Approve"}
                  </button>
                  <button
                    onClick={() => { setRejectFor(rejectFor === sup.id ? null : sup.id); setMergeInto(""); }}
                    className={`${btn} border`}
                    style={{ borderColor: "#B23A2E", color: "#B23A2E" }}
                  >
                    Reject
                  </button>
                </div>
              </div>

              {rejectFor === sup.id && (
                <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 mt-1.5">
                  <div className="text-xs text-neutral-600 mb-2">
                    Any requisition using &ldquo;{sup.name}&rdquo; will be moved to the supplier you pick,
                    and this entry removed.
                  </div>
                  <div className="flex gap-2">
                    <select
                      className={input + " text-xs flex-1"}
                      value={mergeInto}
                      onChange={(e) => setMergeInto(e.target.value)}
                    >
                      <option value="">Move its requisitions to…</option>
                      {approved.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => reject(sup)}
                      disabled={!mergeInto || busyId === sup.id}
                      className={`${btn} shrink-0`}
                      style={{ background: mergeInto ? "#B23A2E" : "#d4d4d4", color: "white" }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => { setRejectFor(null); setMergeInto(""); }}
                      className={`${btn} border border-neutral-300 shrink-0`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
