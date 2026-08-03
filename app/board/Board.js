"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { AttachmentPicker, uploadAttachments, AttachmentsDisplay } from "./Attachments";
import {
  MAX_ITEMS, STATUS_META, btn, input, card, today, blankItem,
  canActAs, projectHasRole, benchmarkDate, timeliness, timelinessMeta,
  findSimilarSupplier,
} from "./prHelpers";

export default function Board({ profile, initialPrs, allProjects, eligibleProjects, suppliers: initialSuppliers, uoms, allProjectRoles, sla }) {
  const supabase = createClient();
  const [prs, setPrs] = useState(initialPrs);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [itemsByPr, setItemsByPr] = useState({});
  const [deliveriesByPr, setDeliveriesByPr] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [poDraft, setPoDraft] = useState({});
  const [poDateDraft, setPoDateDraft] = useState({});
  const [deliveryDraft, setDeliveryDraft] = useState({});
  const [postponeDraft, setPostponeDraft] = useState({});
  const [cancelDraft, setCancelDraft] = useState({});
  const [cancellingId, setCancellingId] = useState(null);
  const [postponingId, setPostponingId] = useState(null);
  const [adminEditId, setAdminEditId] = useState(null);
  const [eventsByPr, setEventsByPr] = useState({});

  // Arriving from the Dashboard with ?pr=<id> should open that requisition.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("pr");
    if (!wanted) return;
    const match = prs.find((p) => p.id === wanted);
    if (match) toggleExpand(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projectName = (pr) => pr.projects?.name || "Unknown project";
  const projectCode = (pr) => pr.projects?.code || "";
  const supplierName = (pr) => pr.suppliers?.name || "Unknown supplier";

  const filtered = statusFilter === "all" ? prs : prs.filter((p) => p.status === statusFilter);

  const counts = {};
  Object.keys(STATUS_META).forEach((k) => (counts[k] = 0));
  prs.forEach((p) => (counts[p.status] = (counts[p.status] || 0) + 1));

  // Every notable change is written to a single history trail so the PR can
  // explain its own past: who changed what, when, and why.
  const logEvent = async (prId, eventType, detail) => {
    const { data, error } = await supabase
      .from("pr_events")
      .insert({ pr_id: prId, actor_id: profile.id, event_type: eventType, detail })
      .select()
      .single();
    if (!error && data) {
      setEventsByPr((prev) => ({ ...prev, [prId]: [...(prev[prId] || []), data] }));
    }
  };

  const updatePrLocal = (id, patch) => setPrs(prs.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const toggleExpand = async (pr) => {
    if (expandedId === pr.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(pr.id);
    if (!itemsByPr[pr.id]) {
      const { data, error } = await supabase
        .from("pr_items")
        .select("*, uoms(name)")
        .eq("pr_id", pr.id)
        .order("item_number");
      if (error) { setError(error.message); return; }
      setItemsByPr((prev) => ({ ...prev, [pr.id]: data || [] }));
    }
    if (!eventsByPr[pr.id]) {
      const { data } = await supabase
        .from("pr_events")
        .select("*")
        .eq("pr_id", pr.id)
        .order("created_at");
      setEventsByPr((prev) => ({ ...prev, [pr.id]: data || [] }));
    }
    if (!deliveriesByPr[pr.id]) {
      const { data, error } = await supabase
        .from("pr_deliveries")
        .select("*")
        .eq("pr_id", pr.id)
        .order("created_at");
      if (error) { setError(error.message); return; }
      setDeliveriesByPr((prev) => ({ ...prev, [pr.id]: data || [] }));
    }
  };

  const onCreated = (newPr) => {
    setPrs([newPr, ...prs]);
    setShowForm(false);
  };

  const verify = async (pr) => {
    const { data, error } = await supabase
      .from("purchase_requisitions")
      .update({ status: "pending_approval", verified_by: profile.id, verified_date: today() })
      .eq("id", pr.id)
      .select("*, verifier:profiles!verified_by(name)")
      .single();
    if (error) return setError(error.message);
    updatePrLocal(pr.id, data);
  };

  const approve = async (pr) => {
    const { data, error } = await supabase
      .from("purchase_requisitions")
      .update({ status: "pending_po", approved_by: profile.id, approved_date: today() })
      .eq("id", pr.id)
      .select("*, approver:profiles!approved_by(name)")
      .single();
    if (error) return setError(error.message);
    updatePrLocal(pr.id, data);
  };

  const reject = async (pr, byRole) => {
    if (!rejectReason.trim()) return;
    const { data, error } = await supabase
      .from("purchase_requisitions")
      .update({ status: "rejected", rejected_by: byRole, rejection_reason: rejectReason.trim() })
      .eq("id", pr.id)
      .select()
      .single();
    if (error) return setError(error.message);
    updatePrLocal(pr.id, data);
    setRejectingId(null);
    setRejectReason("");
  };

  const issuePo = async (pr) => {
    const poNumber = poDraft[pr.id];
    if (!poNumber?.trim()) return;
    // The supplier's committed date, if the Purchaser has one. This becomes the
    // benchmark that On-time / Delay is judged against from here on.
    const confirmedDate = poDateDraft[pr.id] || null;
    const patch = { status: "po_issued", po_number: poNumber.trim(), po_date: today() };
    if (confirmedDate) patch.new_delivery_date = confirmedDate;
    const { data, error } = await supabase
      .from("purchase_requisitions")
      .update(patch)
      .eq("id", pr.id)
      .select()
      .single();
    if (error) return setError(error.message);
    updatePrLocal(pr.id, data);
    await logEvent(
      pr.id,
      "po_issued",
      confirmedDate
        ? `PO ${poNumber.trim()} issued; delivery confirmed for ${confirmedDate}`
        : `PO ${poNumber.trim()} issued`
    );
    setPoDateDraft((prev) => ({ ...prev, [pr.id]: "" }));
    setPoDraft((prev) => ({ ...prev, [pr.id]: "" }));
  };

  // A postponement records slippage without moving the benchmark, so a
  // supplier who keeps pushing the date back still shows as Delayed.
  const postponeDelivery = async (pr) => {
    const d = postponeDraft[pr.id] || {};
    if (!d.date || !d.reason?.trim()) return;
    const { data, error } = await supabase
      .from("purchase_requisitions")
      .update({ postponed_delivery_date: d.date })
      .eq("id", pr.id)
      .select()
      .single();
    if (error) return setError(error.message);
    updatePrLocal(pr.id, data);
    await logEvent(pr.id, "postponed", `Delivery postponed to ${d.date} — ${d.reason.trim()}`);
    setPostponeDraft((prev) => ({ ...prev, [pr.id]: { date: "", reason: "" } }));
    setPostponingId(null);
  };

  const cancelPr = async (pr) => {
    const reason = (cancelDraft[pr.id] || "").trim();
    if (!reason) return;
    const { data, error } = await supabase
      .from("purchase_requisitions")
      .update({
        status: "cancelled",
        cancelled_by: profile.id,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
      })
      .eq("id", pr.id)
      .select()
      .single();
    if (error) return setError(error.message);
    updatePrLocal(pr.id, data);
    // Remember where it was so it can be put back exactly there.
    await logEvent(pr.id, "cancelled", `from:${pr.status}|${reason}`);
    setCancelDraft((prev) => ({ ...prev, [pr.id]: "" }));
    setCancellingId(null);
  };

  const reinstatePr = async (pr) => {
    const events = eventsByPr[pr.id] || [];
    const lastCancel = [...events].reverse().find((e) => e.event_type === "cancelled");
    const priorStatus =
      lastCancel && lastCancel.detail?.startsWith("from:")
        ? lastCancel.detail.slice(5).split("|")[0]
        : "pending_verification";
    const { data, error } = await supabase
      .from("purchase_requisitions")
      .update({ status: priorStatus, cancelled_by: null, cancelled_at: null, cancellation_reason: null })
      .eq("id", pr.id)
      .select()
      .single();
    if (error) return setError(error.message);
    updatePrLocal(pr.id, data);
    await logEvent(pr.id, "reinstated", `Reinstated to ${STATUS_META[priorStatus]?.label || priorStatus}`);
  };

  const logDelivery = async (pr) => {
    const draft = deliveryDraft[pr.id];
    if (!draft?.doNumber?.trim() || !draft?.deliveryDate) return;
    const { data: deliveryRow, error: deliveryError } = await supabase
      .from("pr_deliveries")
      .insert({ pr_id: pr.id, do_number: draft.doNumber.trim(), delivery_date: draft.deliveryDate, type: draft.type })
      .select()
      .single();
    if (deliveryError) return setError(deliveryError.message);
    setDeliveriesByPr((prev) => ({ ...prev, [pr.id]: [...(prev[pr.id] || []), deliveryRow] }));

    const patch = draft.type === "complete"
      ? { status: "fulfilled", fulfilled_date: draft.deliveryDate }
      : { status: "partial_delivery" };
    const { data, error } = await supabase
      .from("purchase_requisitions")
      .update(patch)
      .eq("id", pr.id)
      .select()
      .single();
    if (error) return setError(error.message);
    updatePrLocal(pr.id, data);
    setDeliveryDraft((prev) => ({ ...prev, [pr.id]: { doNumber: "", deliveryDate: today(), type: "complete" } }));
  };

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4 mb-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-neutral-600">Purchase Requisition Platform</div>
            <h1 className="text-2xl font-bold mt-1">PR Board</h1>
          </div>
          <div className="flex items-center gap-4">
            {profile?.is_admin && (
              <a href="/admin" className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 text-white">Admin Setup</a>
            )}
            <a href="/dashboard" className="text-xs underline text-neutral-600">Dashboard</a>
            <a href="/schedule" className="text-xs underline text-neutral-600">Schedule</a>
            <a href="/" className="text-xs underline text-neutral-600">Home</a>
          </div>
        </div>

        {error && <div className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2 mb-4">{error}</div>}

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-6">
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
              className="text-left px-2.5 py-2 rounded-md"
              style={{
                border: `1.5px solid ${meta.color}`,
                background: statusFilter === key ? `${meta.color}14` : "white",
                color: meta.color,
              }}
            >
              <div className="text-[10px] uppercase tracking-wide leading-tight">{meta.label}</div>
              <div className="text-lg font-medium">{counts[key] || 0}</div>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setStatusFilter("all")} className="text-xs uppercase tracking-wide text-neutral-600">
            Show all ({prs.length})
          </button>
          <button onClick={() => setShowForm(!showForm)} className={`${btn} bg-neutral-900 text-white`}>
            {showForm ? "Cancel" : "New Purchase Requisition"}
          </button>
        </div>

        {showForm && (
          <NewPrForm
            supabase={supabase}
            eligibleProjects={eligibleProjects}
            suppliers={suppliers}
            setSuppliers={setSuppliers}
            uoms={uoms}
            allProjectRoles={allProjectRoles}
            profile={profile}
            onCreated={onCreated}
            onError={setError}
          />
        )}

        <div className="flex flex-col gap-2">
          {filtered.map((pr) => {
            const meta = STATUS_META[pr.status] || { label: pr.status, color: "#666" };
            const isOpen = expandedId === pr.id;
            const items = itemsByPr[pr.id];
            const deliveries = deliveriesByPr[pr.id];
            const canVerify = canActAs(allProjectRoles, pr.project_id, "verifier", profile.id, profile.is_admin);
            const canApprove = canActAs(allProjectRoles, pr.project_id, "approver", profile.id, profile.is_admin);
            const draft = deliveryDraft[pr.id] || { doNumber: "", deliveryDate: today(), type: "complete" };

            return (
              <div key={pr.id} className={card + " p-0"}>
                <button onClick={() => toggleExpand(pr)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {pr.pr_number} <span className="text-neutral-600">· {projectName(pr)} ({projectCode(pr)})</span>
                    </div>
                    <div className="text-xs text-neutral-600 mt-0.5">
                      {supplierName(pr)} · required by {pr.required_date}
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 shrink-0 ml-3">
                    {timelinessMeta(timeliness(pr, sla)) && (
                      <span
                        className="text-xs px-2 py-1 rounded-full"
                        style={{
                          background: `${timelinessMeta(timeliness(pr, sla)).color}14`,
                          color: timelinessMeta(timeliness(pr, sla)).color,
                        }}
                      >
                        {timelinessMeta(timeliness(pr, sla)).label}
                      </span>
                    )}
                    <span className="text-xs px-2 py-1 rounded-full" style={{ background: `${meta.color}14`, color: meta.color }}>
                      {meta.label}
                    </span>
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-neutral-100">
                    <div className="text-xs text-neutral-600 mb-2">
                      Requested {pr.request_date} · Required {pr.required_date}
                    </div>

                    {!items && <div className="text-xs text-neutral-600">Loading items…</div>}
                    {items && (
                      <table className="w-full text-xs mb-3">
                        <thead>
                          <tr className="text-left text-neutral-600">
                            <th className="py-1 pr-3">Item No.</th>
                            <th className="py-1 pr-3">Description</th>
                            <th className="py-1 pr-3">SKU</th>
                            <th className="py-1 pr-3">Qty</th>
                            <th className="py-1 pr-3">UOM</th>
                            <th className="py-1">Remark</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it) => (
                            <tr key={it.id} className="border-t border-neutral-100">
                              <td className="py-1.5 pr-3">{it.item_number}</td>
                              <td className="py-1.5 pr-3">{it.description}</td>
                              <td className="py-1.5 pr-3">{it.sku}</td>
                              <td className="py-1.5 pr-3">{it.qty}</td>
                              <td className="py-1.5 pr-3">{it.uoms?.name || "—"}</td>
                              <td className="py-1.5">{it.remark || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {isOpen && <AttachmentsDisplay supabase={supabase} prId={pr.id} />}

                    <div className="text-xs text-neutral-600 mb-3 flex flex-col gap-0.5">
                      {pr.verified_by && <div>Verified by {pr.verifier?.name || "—"} on {pr.verified_date}</div>}
                      {pr.approved_by && <div>Approved by {pr.approver?.name || "—"} on {pr.approved_date}</div>}
                      {pr.po_number && <div>PO {pr.po_number} issued {pr.po_date}</div>}
                      {(deliveries || []).map((d) => (
                        <div key={d.id}>DO {d.do_number} — {d.type === "complete" ? "Complete" : "Partial"} delivery on {d.delivery_date}</div>
                      ))}
                      {pr.status === "rejected" && (
                        <div className="text-red-600">Rejected by {pr.rejected_by}: "{pr.rejection_reason}"</div>
                      )}
                    </div>

                    {/* Verifier actions */}
                    {pr.status === "pending_verification" && (
                      canVerify ? (
                        rejectingId === pr.id ? (
                          <RejectBox reason={rejectReason} setReason={setRejectReason} onConfirm={() => reject(pr, "verifier")} onCancel={() => { setRejectingId(null); setRejectReason(""); }} />
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => verify(pr)} className={`${btn} text-white`} style={{ background: "#1F6B63" }}>Verify</button>
                            <button onClick={() => setRejectingId(pr.id)} className={`${btn} border`} style={{ borderColor: "#B23A2E", color: "#B23A2E" }}>Reject</button>
                          </div>
                        )
                      ) : (
                        <div className="text-xs text-neutral-600">Only assigned Verifiers for this project can act.</div>
                      )
                    )}

                    {/* Approver actions */}
                    {pr.status === "pending_approval" && (
                      canApprove ? (
                        rejectingId === pr.id ? (
                          <RejectBox reason={rejectReason} setReason={setRejectReason} onConfirm={() => reject(pr, "approver")} onCancel={() => { setRejectingId(null); setRejectReason(""); }} />
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => approve(pr)} className={`${btn} text-white`} style={{ background: "#34456B" }}>Approve</button>
                            <button onClick={() => setRejectingId(pr.id)} className={`${btn} border`} style={{ borderColor: "#B23A2E", color: "#B23A2E" }}>Reject</button>
                          </div>
                        )
                      ) : (
                        <div className="text-xs text-neutral-600">Only assigned Approvers for this project can act.</div>
                      )
                    )}

                    {/* Purchasing: issue PO */}
                    {pr.status === "pending_po" && profile.is_purchasing && (
                      <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3">
                        <div className="text-xs uppercase tracking-wide text-neutral-600 mb-2">Issue purchase order</div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <input
                            className={input + " text-xs"}
                            placeholder="PO number *"
                            value={poDraft[pr.id] || ""}
                            onChange={(e) => setPoDraft({ ...poDraft, [pr.id]: e.target.value })}
                          />
                          <div>
                            <input
                              type="date"
                              className={input + " text-xs w-full"}
                              value={poDateDraft[pr.id] || ""}
                              onChange={(e) => setPoDateDraft({ ...poDateDraft, [pr.id]: e.target.value })}
                            />
                            <div className="text-xs text-neutral-600 mt-1">
                              New delivery date (optional) — leave blank to keep {pr.required_date}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => issuePo(pr)} className={`${btn} text-white`} style={{ background: "#1F6B63" }}>Issue PO</button>
                      </div>
                    )}

                    {/* Purchasing: log delivery */}
                    {(pr.status === "po_issued" || pr.status === "partial_delivery") && profile.is_purchasing && (
                      <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3">
                        <div className="text-xs uppercase tracking-wide text-neutral-600 mb-2">Log delivery</div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <input
                            className={input + " text-xs"}
                            placeholder="Supplier DO number"
                            value={draft.doNumber}
                            onChange={(e) => setDeliveryDraft({ ...deliveryDraft, [pr.id]: { ...draft, doNumber: e.target.value } })}
                          />
                          <input
                            type="date"
                            max={today()}
                            className={input + " text-xs"}
                            value={draft.deliveryDate}
                            onChange={(e) => setDeliveryDraft({ ...deliveryDraft, [pr.id]: { ...draft, deliveryDate: e.target.value } })}
                          />
                        </div>
                        <div className="flex items-center gap-4 mb-2 text-xs">
                          <label className="flex items-center gap-1.5">
                            <input type="radio" checked={draft.type === "complete"} onChange={() => setDeliveryDraft({ ...deliveryDraft, [pr.id]: { ...draft, type: "complete" } })} />
                            Complete delivery
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input type="radio" checked={draft.type === "partial"} onChange={() => setDeliveryDraft({ ...deliveryDraft, [pr.id]: { ...draft, type: "partial" } })} />
                            Partial delivery
                          </label>
                        </div>
                        <button onClick={() => logDelivery(pr)} className={`${btn} text-white`} style={{ background: "#1F6B63" }}>Save delivery record</button>
                      </div>
                    )}

                    {/* Administrator: correct details at any stage before fulfilment */}
                    {profile.is_admin && !["fulfilled", "cancelled"].includes(pr.status) && pr.status !== "rejected" && (
                      adminEditId === pr.id ? (
                        <EditPrForm
                          supabase={supabase}
                          pr={pr}
                          suppliers={suppliers}
                          uoms={uoms}
                          initialItems={items || []}
                          adminMode
                          onUpdated={(prId, updatedPr, freshItems) => {
                            updatePrLocal(prId, updatedPr);
                            setItemsByPr((prev) => ({ ...prev, [prId]: freshItems }));
                            setAdminEditId(null);
                            logEvent(prId, "admin_edit", `Details amended by ${profile.name}`);
                          }}
                          onError={setError}
                          onCancel={() => setAdminEditId(null)}
                        />
                      ) : (
                        <button onClick={() => setAdminEditId(pr.id)} className={`${btn} border mt-2`} style={{ borderColor: "#34456B", color: "#34456B" }}>
                          Edit details (Admin)
                        </button>
                      )
                    )}

                    {/* Purchasing: postpone an agreed delivery */}
                    {(pr.status === "po_issued" || pr.status === "partial_delivery") && profile.is_purchasing && (
                      postponingId === pr.id ? (
                        <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 mt-2">
                          <div className="text-xs uppercase tracking-wide text-neutral-600 mb-2">Postpone delivery</div>
                          <div className="text-xs text-neutral-600 mb-2">
                            This records the supplier&apos;s new promise. It does not change the date this PR is
                            measured against, so a genuine delay stays visible.
                          </div>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <input
                              type="date"
                              className={input + " text-xs"}
                              value={(postponeDraft[pr.id] || {}).date || ""}
                              onChange={(e) => setPostponeDraft({ ...postponeDraft, [pr.id]: { ...(postponeDraft[pr.id] || {}), date: e.target.value } })}
                            />
                            <input
                              className={input + " text-xs"}
                              placeholder="Reason *"
                              value={(postponeDraft[pr.id] || {}).reason || ""}
                              onChange={(e) => setPostponeDraft({ ...postponeDraft, [pr.id]: { ...(postponeDraft[pr.id] || {}), reason: e.target.value } })}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => postponeDelivery(pr)} className={`${btn} text-white`} style={{ background: "#9C6B14" }}>Save postponement</button>
                            <button onClick={() => setPostponingId(null)} className={`${btn} border border-neutral-300`}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setPostponingId(pr.id)} className={`${btn} border mt-2`} style={{ borderColor: "#9C6B14", color: "#9C6B14" }}>
                          Postpone delivery
                        </button>
                      )
                    )}

                    {/* Administrator: cancel before a PO exists, or put one back */}
                    {profile.is_admin && ["pending_verification", "rejected", "pending_approval", "pending_po"].includes(pr.status) && (
                      cancellingId === pr.id ? (
                        <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 mt-2">
                          <div className="text-xs text-neutral-600 mb-2">Why is this requisition being cancelled?</div>
                          <div className="flex gap-2">
                            <input
                              className={input + " text-xs flex-1"}
                              placeholder="Reason for cancellation *"
                              value={cancelDraft[pr.id] || ""}
                              onChange={(e) => setCancelDraft({ ...cancelDraft, [pr.id]: e.target.value })}
                            />
                            <button
                              onClick={() => cancelPr(pr)}
                              disabled={!(cancelDraft[pr.id] || "").trim()}
                              className={`${btn} shrink-0`}
                              style={{ background: (cancelDraft[pr.id] || "").trim() ? "#B23A2E" : "#d4d4d4", color: "white" }}
                            >
                              Confirm cancel
                            </button>
                            <button onClick={() => setCancellingId(null)} className={`${btn} border border-neutral-300 shrink-0`}>Back</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setCancellingId(pr.id)} className={`${btn} border mt-2`} style={{ borderColor: "#B23A2E", color: "#B23A2E" }}>
                          Cancel requisition
                        </button>
                      )
                    )}

                    {profile.is_admin && pr.status === "cancelled" && (
                      <button onClick={() => reinstatePr(pr)} className={`${btn} text-white mt-2`} style={{ background: "#171717" }}>
                        Reinstate requisition
                      </button>
                    )}

                    {/* History trail */}
                    {(eventsByPr[pr.id] || []).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-neutral-100">
                        <div className="text-xs uppercase tracking-wide text-neutral-600 mb-1.5">History</div>
                        <div className="flex flex-col gap-1">
                          {(eventsByPr[pr.id] || []).map((ev) => (
                            <div key={ev.id} className="text-xs text-neutral-600">
                              {new Date(ev.created_at).toLocaleDateString()} — {ev.detail || ev.event_type}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Requester: resubmit */}
                    {pr.status === "rejected" && pr.requester_id === profile.id && (
                      editingId === pr.id ? (
                        <EditPrForm
                          supabase={supabase}
                          pr={pr}
                          suppliers={suppliers}
                          uoms={uoms}
                          initialItems={items || []}
                          onUpdated={(prId, updatedPr, freshItems) => {
                            updatePrLocal(prId, updatedPr);
                            setItemsByPr((prev) => ({ ...prev, [prId]: freshItems }));
                            setEditingId(null);
                          }}
                          onError={setError}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <button onClick={() => setEditingId(pr.id)} className={`${btn} text-white`} style={{ background: "#171717" }}>
                          Edit & Resubmit
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && <div className="text-sm text-neutral-600 text-center py-10">No requisitions here yet.</div>}
        </div>
      </div>
    </div>
  );
}

function RejectBox({ reason, setReason, onConfirm, onCancel }) {
  return (
    <div className="flex flex-col gap-2">
      <input
        className={input + " text-xs"}
        placeholder="Reason for rejection"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        <button onClick={onConfirm} className={`${btn} text-white`} style={{ background: "#B23A2E" }}>Confirm reject</button>
        <button onClick={onCancel} className={`${btn} border border-neutral-300`}>Cancel</button>
      </div>
    </div>
  );
}

function NewPrForm({ supabase, eligibleProjects, suppliers, setSuppliers, uoms, allProjectRoles, profile, onCreated, onError }) {
  const [projectId, setProjectId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [dupeWarning, setDupeWarning] = useState(null);
  const [itemLimitNotice, setItemLimitNotice] = useState("");
  const [requestDate, setRequestDate] = useState(today());
  const [requiredDate, setRequiredDate] = useState("");
  const [items, setItems] = useState([blankItem()]);
  const [quotationFiles, setQuotationFiles] = useState([]);
  const [drawings, setDrawings] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const updateItem = (idx, field, val) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: val };
    setItems(next);
  };
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const requiredDateValid = !requiredDate || requiredDate >= today();
  const itemsValid = items.length > 0 && items.every(
    (i) => i.itemNumber.trim() && i.description.trim() && i.sku.trim() && String(i.qty).trim() !== "" && i.uomId
  );
  const drawingsValid = drawings.every((d) => d.drawingNumber.trim() && d.revisionNo.trim());
  // A project with nobody assigned to verify or approve would strand the PR,
  // so we stop it being raised rather than letting it dead-end.
  const missingRoles = [];
  if (projectId) {
    if (!projectHasRole(allProjectRoles, projectId, "verifier")) missingRoles.push("Verifier");
    if (!projectHasRole(allProjectRoles, projectId, "approver")) missingRoles.push("Approver");
  }
  const rolesReady = projectId && missingRoles.length === 0;

  const supplierChosen = supplierId === "__new__" ? newSupplierName.trim().length > 0 : !!supplierId;
  const canSubmit = projectId && supplierChosen && rolesReady && requestDate && requiredDate && requiredDateValid && itemsValid && drawingsValid && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();

    // A supplier the Requester typed in is created as "pending": usable on this
    // PR straight away, but hidden from everyone else until an Admin approves it.
    let effectiveSupplierId = supplierId;
    if (supplierId === "__new__") {
      const { data: newSup, error: supErr } = await supabase
        .from("suppliers")
        .insert({
          name: newSupplierName.trim(),
          status: "pending",
          proposed_by: userData.user.id,
          proposed_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (supErr) {
        onError(supErr.message);
        setSubmitting(false);
        return;
      }
      effectiveSupplierId = newSup.id;
      setSuppliers([...suppliers, newSup]);
    }

    const { data: prData, error: prError } = await supabase
      .from("purchase_requisitions")
      .insert({
        project_id: projectId,
        supplier_id: effectiveSupplierId,
        requester_id: userData.user.id,
        request_date: requestDate,
        required_date: requiredDate,
      })
      .select("*, projects(name, code), suppliers(name)")
      .single();

    if (prError) {
      onError(prError.message);
      setSubmitting(false);
      return;
    }

    const itemRows = items.map((i) => ({
      pr_id: prData.id,
      item_number: i.itemNumber.trim(),
      description: i.description.trim(),
      sku: i.sku.trim(),
      qty: Number(i.qty),
      uom_id: i.uomId,
      remark: i.remark.trim() || null,
    }));
    const { error: itemsError } = await supabase.from("pr_items").insert(itemRows);
    if (itemsError) {
      onError(itemsError.message);
      setSubmitting(false);
      return;
    }

    try {
      await uploadAttachments(supabase, prData.id, { quotationFiles, drawings, photos });
    } catch (attachErr) {
      onError(attachErr.message + " (the requisition itself was still created successfully)");
    }

    setSubmitting(false);
    onCreated(prData);
  };

  if (eligibleProjects.length === 0) {
    return (
      <div className={card + " mb-5 text-sm text-red-600 bg-red-50"}>
        You're not set up as a Requester on any project yet. Ask your Administrator to assign you in Admin Setup → Projects & Roles.
      </div>
    );
  }

  return (
    <div className={card + " mb-5"}>
      <div className="text-sm font-bold mb-3">New Purchase Requisition</div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <select className={input} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Please select</option>
          {eligibleProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          className={input}
          value={supplierId}
          onChange={(e) => { setSupplierId(e.target.value); setDupeWarning(null); }}
        >
          <option value="">Please select</option>
          {suppliers.filter((s) => s.status !== "pending").map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value="__new__">+ Add a new supplier…</option>
        </select>
      </div>

      {supplierId === "__new__" && (
        <div className="mb-2">
          <input
            className={input + " w-full"}
            placeholder="New supplier name *"
            value={newSupplierName}
            onChange={(e) => {
              const v = e.target.value;
              setNewSupplierName(v);
              setDupeWarning(findSimilarSupplier(suppliers, v));
            }}
          />
          {dupeWarning && (
            <div className="text-xs px-3 py-2 rounded-md mt-1 bg-amber-50 text-amber-700">
              Did you mean <strong>{dupeWarning.name}</strong>?{" "}
              <button
                onClick={() => { setSupplierId(dupeWarning.id); setNewSupplierName(""); setDupeWarning(null); }}
                className="underline"
              >
                Use that one instead
              </button>
            </div>
          )}
          <div className="text-xs text-neutral-600 mt-1">
            This supplier will be usable on this requisition right away, and will appear for
            everyone else once an Administrator approves it.
          </div>
        </div>
      )}

      {projectId && missingRoles.length > 0 && (
        <div className="text-xs px-3 py-2 rounded-md mb-3 bg-red-50 text-red-600">
          This project has no {missingRoles.join(" and ")} assigned, so a requisition would have
          nobody to action it. Ask your Administrator to assign {missingRoles.length > 1 ? "them" : "one"} in
          Admin Setup → Projects &amp; Roles.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>
          <label className="text-xs text-neutral-600">Request date *</label>
          <input type="date" className={input + " w-full"} value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-neutral-600">Required delivery date *</label>
          <input
            type="date"
            min={today()}
            className={input + " w-full"}
            style={{ borderColor: requiredDate && !requiredDateValid ? "#B23A2E" : undefined }}
            value={requiredDate}
            onChange={(e) => setRequiredDate(e.target.value)}
          />
          {requiredDate && !requiredDateValid && <div className="text-xs text-red-600 mt-1">Cannot be a past date.</div>}
        </div>
      </div>

      <div className="text-xs uppercase tracking-wide text-neutral-600 mb-2">Items</div>
      {uoms.length === 0 && (
        <div className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2 mb-2">
          No units of measurement set up yet. Ask your Administrator to add some.
        </div>
      )}
      <div className="flex flex-col gap-3 mb-3">
        {items.map((it, idx) => (
          <div key={idx} className="bg-neutral-50 border border-neutral-200 rounded-md p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-neutral-600">Item {idx + 1}</span>
              {items.length > 1 && (
                <button onClick={() => removeItem(idx)} className="text-xs text-red-600">Remove</button>
              )}
            </div>
            <input
              className={input + " w-full mb-2"}
              placeholder="Description of item *"
              value={it.description}
              onChange={(e) => updateItem(idx, "description", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                className={input}
                placeholder="Item Number *"
                value={it.itemNumber}
                onChange={(e) => updateItem(idx, "itemNumber", e.target.value)}
              />
              <input
                className={input}
                placeholder="SKU / product code *"
                value={it.sku}
                onChange={(e) => updateItem(idx, "sku", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="number" min="1"
                className={input}
                placeholder="Quantity *"
                value={it.qty}
                onChange={(e) => updateItem(idx, "qty", e.target.value)}
              />
              <select className={input} value={it.uomId} onChange={(e) => updateItem(idx, "uomId", e.target.value)}>
                <option value="">UOM *</option>
                {uoms.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <input
              className={input + " w-full"}
              placeholder="Remark (optional)"
              value={it.remark}
              onChange={(e) => updateItem(idx, "remark", e.target.value)}
            />
          </div>
        ))}
      </div>
      {itemLimitNotice && (
        <div className="text-xs px-3 py-2 rounded-md mb-2 bg-amber-50 text-amber-700">{itemLimitNotice}</div>
      )}
      <button
        onClick={() => {
          if (items.length >= MAX_ITEMS) {
            setItemLimitNotice(`A requisition can have up to ${MAX_ITEMS} items. Please raise a separate requisition for anything further.`);
            return;
          }
          setItemLimitNotice("");
          setItems([...items, blankItem()]);
        }}
        className="text-xs w-full py-2 rounded-md border border-dashed border-neutral-300 text-neutral-600 mb-4"
      >
        + Add another item
      </button>

      <AttachmentPicker
        quotationFiles={quotationFiles}
        setQuotationFiles={setQuotationFiles}
        drawings={drawings}
        setDrawings={setDrawings}
        photos={photos}
        setPhotos={setPhotos}
        onError={onError}
      />

      <button
        disabled={!canSubmit}
        onClick={submit}
        className={`${btn} w-full font-medium mt-4`}
        style={{ background: canSubmit ? "#171717" : "#d4d4d4", color: "white" }}
      >
        {submitting ? "Submitting…" : "Submit for Verification"}
      </button>
    </div>
  );
}

function EditPrForm({ supabase, pr, suppliers, uoms, initialItems, onUpdated, onError, onCancel, adminMode = false }) {
  const [supplierId, setSupplierId] = useState(pr.supplier_id || "");
  const [itemLimitNotice, setItemLimitNotice] = useState("");
  const [requestDate, setRequestDate] = useState(pr.request_date);
  const [requiredDate, setRequiredDate] = useState(pr.required_date);
  const [items, setItems] = useState(
    initialItems.length > 0
      ? initialItems.map((it) => ({
          itemNumber: it.item_number,
          description: it.description,
          sku: it.sku,
          qty: String(it.qty),
          uomId: it.uom_id,
          remark: it.remark || "",
        }))
      : [blankItem()]
  );
  const [quotationFiles, setQuotationFiles] = useState([]);
  const [drawings, setDrawings] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const updateItem = (idx, field, val) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: val };
    setItems(next);
  };
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const requiredDateValid = !requiredDate || requiredDate >= today();
  const itemsValid = items.length > 0 && items.every(
    (i) => i.itemNumber.trim() && i.description.trim() && i.sku.trim() && String(i.qty).trim() !== "" && i.uomId
  );
  const drawingsValid = drawings.every((d) => d.drawingNumber.trim() && d.revisionNo.trim());
  const canSubmit = supplierId && requestDate && requiredDate && requiredDateValid && itemsValid && drawingsValid && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    const { data: prData, error: prError } = await supabase
      .from("purchase_requisitions")
      .update(
        adminMode
          ? { supplier_id: supplierId, request_date: requestDate, required_date: requiredDate }
          : {
              supplier_id: supplierId,
              request_date: requestDate,
              required_date: requiredDate,
              status: "pending_verification",
              rejected_by: null,
              rejection_reason: null,
            }
      )
      .eq("id", pr.id)
      .select("*, projects(name, code), suppliers(name)")
      .single();

    if (prError) {
      onError(prError.message);
      setSubmitting(false);
      return;
    }

    const { error: deleteError } = await supabase.from("pr_items").delete().eq("pr_id", pr.id);
    if (deleteError) {
      onError(deleteError.message);
      setSubmitting(false);
      return;
    }

    const itemRows = items.map((i) => ({
      pr_id: pr.id,
      item_number: i.itemNumber.trim(),
      description: i.description.trim(),
      sku: i.sku.trim(),
      qty: Number(i.qty),
      uom_id: i.uomId,
      remark: i.remark.trim() || null,
    }));
    const { error: itemsError } = await supabase.from("pr_items").insert(itemRows);
    if (itemsError) {
      onError(itemsError.message);
      setSubmitting(false);
      return;
    }

    try {
      await uploadAttachments(supabase, pr.id, { quotationFiles, drawings, photos });
    } catch (attachErr) {
      onError(attachErr.message + " (the resubmission itself still went through)");
    }

    const { data: freshItems } = await supabase
      .from("pr_items")
      .select("*, uoms(name)")
      .eq("pr_id", pr.id)
      .order("item_number");

    setSubmitting(false);
    onUpdated(pr.id, prData, freshItems || []);
  };

  return (
    <div className={card + " mb-2"}>
      <div className="text-sm font-bold mb-1">{adminMode ? "Edit details" : "Edit & Resubmit"}</div>
      <div className="text-xs text-neutral-600 mb-3">
        {pr.projects?.name} ({pr.projects?.code}) — project can't be changed here.
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <select
          className={input}
          value={supplierId}
          onChange={(e) => { setSupplierId(e.target.value); setDupeWarning(null); }}
        >
          <option value="">Please select</option>
          {suppliers.filter((s) => s.status !== "pending").map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value="__new__">+ Add a new supplier…</option>
        </select>
      </div>

      {supplierId === "__new__" && (
        <div className="mb-2">
          <input
            className={input + " w-full"}
            placeholder="New supplier name *"
            value={newSupplierName}
            onChange={(e) => {
              const v = e.target.value;
              setNewSupplierName(v);
              setDupeWarning(findSimilarSupplier(suppliers, v));
            }}
          />
          {dupeWarning && (
            <div className="text-xs px-3 py-2 rounded-md mt-1 bg-amber-50 text-amber-700">
              Did you mean <strong>{dupeWarning.name}</strong>?{" "}
              <button
                onClick={() => { setSupplierId(dupeWarning.id); setNewSupplierName(""); setDupeWarning(null); }}
                className="underline"
              >
                Use that one instead
              </button>
            </div>
          )}
          <div className="text-xs text-neutral-600 mt-1">
            This supplier will be usable on this requisition right away, and will appear for
            everyone else once an Administrator approves it.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>
          <label className="text-xs text-neutral-600">Request date *</label>
          <input type="date" className={input + " w-full"} value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-neutral-600">Required delivery date *</label>
          <input
            type="date"
            min={today()}
            className={input + " w-full"}
            style={{ borderColor: requiredDate && !requiredDateValid ? "#B23A2E" : undefined }}
            value={requiredDate}
            onChange={(e) => setRequiredDate(e.target.value)}
          />
          {requiredDate && !requiredDateValid && <div className="text-xs text-red-600 mt-1">Cannot be a past date.</div>}
        </div>
      </div>

      <div className="text-xs uppercase tracking-wide text-neutral-600 mb-2">Items</div>
      <div className="flex flex-col gap-3 mb-3">
        {items.map((it, idx) => (
          <div key={idx} className="bg-neutral-50 border border-neutral-200 rounded-md p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-neutral-600">Item {idx + 1}</span>
              {items.length > 1 && (
                <button onClick={() => removeItem(idx)} className="text-xs text-red-600">Remove</button>
              )}
            </div>
            <input
              className={input + " w-full mb-2"}
              placeholder="Description of item *"
              value={it.description}
              onChange={(e) => updateItem(idx, "description", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                className={input}
                placeholder="Item Number *"
                value={it.itemNumber}
                onChange={(e) => updateItem(idx, "itemNumber", e.target.value)}
              />
              <input
                className={input}
                placeholder="SKU / product code *"
                value={it.sku}
                onChange={(e) => updateItem(idx, "sku", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="number" min="1"
                className={input}
                placeholder="Quantity *"
                value={it.qty}
                onChange={(e) => updateItem(idx, "qty", e.target.value)}
              />
              <select className={input} value={it.uomId} onChange={(e) => updateItem(idx, "uomId", e.target.value)}>
                <option value="">UOM *</option>
                {uoms.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <input
              className={input + " w-full"}
              placeholder="Remark (optional)"
              value={it.remark}
              onChange={(e) => updateItem(idx, "remark", e.target.value)}
            />
          </div>
        ))}
      </div>
      {itemLimitNotice && (
        <div className="text-xs px-3 py-2 rounded-md mb-2 bg-amber-50 text-amber-700">{itemLimitNotice}</div>
      )}
      <button
        onClick={() => {
          if (items.length >= MAX_ITEMS) {
            setItemLimitNotice(`A requisition can have up to ${MAX_ITEMS} items. Please raise a separate requisition for anything further.`);
            return;
          }
          setItemLimitNotice("");
          setItems([...items, blankItem()]);
        }}
        className="text-xs w-full py-2 rounded-md border border-dashed border-neutral-300 text-neutral-600 mb-4"
      >
        + Add another item
      </button>

      <div className="text-xs text-neutral-600 mb-2">Add any new supporting files below (existing ones stay attached):</div>
      <AttachmentPicker
        quotationFiles={quotationFiles}
        setQuotationFiles={setQuotationFiles}
        drawings={drawings}
        setDrawings={setDrawings}
        photos={photos}
        setPhotos={setPhotos}
        onError={onError}
      />

      <div className="flex gap-2 mt-4">
        <button
          disabled={!canSubmit}
          onClick={submit}
          className={`${btn} flex-1 font-medium`}
          style={{ background: canSubmit ? "#171717" : "#d4d4d4", color: "white" }}
        >
          {submitting ? "Saving…" : adminMode ? "Save changes" : "Save & Resubmit for Verification"}
        </button>
        <button onClick={onCancel} className={`${btn} border border-neutral-300`}>Cancel</button>
      </div>
    </div>
  );
}
