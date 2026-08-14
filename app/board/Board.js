"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Logo from "../Logo";
import { AttachmentPicker, uploadAttachments, AttachmentsDisplay, ExistingAttachmentsEditor, duplicateAttachments } from "./Attachments";
import PrPrintForm from "./PrPrintForm";
import { exportPrAsExcel } from "./exportExcel";
import {
  MAX_ITEMS, STATUS_META, btn, input, card, today, blankItem,
  canActAs, projectHasRole, benchmarkDate, timeliness, timelinessMeta,
  findSimilarSupplier, pendingActionsFor,
  activeCancelRequest, isLockedByCancelRequest, pendingCancelRequestsFor,
  autoCorrectAllCaps, activeChangeRequest, assignedNamesFor,
} from "./prHelpers";

export default function Board({ profile, initialPrs, allProjects, eligibleProjects, suppliers: initialSuppliers, uoms, allProjectRoles, sla, initialCancelRequests = [], initialChangeRequests = [] }) {
  const supabase = createClient();
  const [prs, setPrs] = useState(initialPrs);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [itemsByPr, setItemsByPr] = useState({});
  const [deliveriesByPr, setDeliveriesByPr] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [delayOnly, setDelayOnly] = useState(false);
  const [error, setError] = useState("");
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [directEditingId, setDirectEditingId] = useState(null);
  const [poDraft, setPoDraft] = useState({});
  const [poDateDraft, setPoDateDraft] = useState({});
  const [poDeliverDraft, setPoDeliverDraft] = useState({});
  const [deliveryDraft, setDeliveryDraft] = useState({});
  const [postponeDraft, setPostponeDraft] = useState({});
  const [cancelRequests, setCancelRequests] = useState(initialCancelRequests);
  const [changeRequests, setChangeRequests] = useState(initialChangeRequests);
  const [requestingChangeId, setRequestingChangeId] = useState(null);
  const [purchaserDecidingChangeId, setPurchaserDecidingChangeId] = useState(null);
  const [changeRejectReason, setChangeRejectReason] = useState({});
  const [requestingCancelId, setRequestingCancelId] = useState(null);
  const [cancelRequestDraft, setCancelRequestDraft] = useState({});
  const [purchaserDeciding, setPurchaserDeciding] = useState(null);
  const [adminDecidingRequest, setAdminDecidingRequest] = useState(null);
  const [adminRequestReason, setAdminRequestReason] = useState({});
  const [postponingId, setPostponingId] = useState(null);
  const [adminEditId, setAdminEditId] = useState(null);
  const [eventsByPr, setEventsByPr] = useState({});
  const [attachmentsByPr, setAttachmentsByPr] = useState({});
  const [favouriteIds, setFavouriteIds] = useState(new Set());
  const [duplicateSource, setDuplicateSource] = useState(null);

  // Arriving from the Dashboard with ?pr=<id> should open that requisition.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("pr");
    if (!wanted) return;
    const match = prs.find((p) => p.id === wanted);
    if (match) toggleExpand(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the overlay in step with browser navigation.
  useEffect(() => {
    const onPop = () => {
      const wanted = new URLSearchParams(window.location.search).get("pr");
      setExpandedId(wanted || null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Load this user's own favourites (personal, independent of other users).
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from("pr_favourites").select("pr_id").eq("user_id", profile.id);
      if (alive) setFavouriteIds(new Set((data || []).map((r) => r.pr_id)));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFavourite = async (pr, e) => {
    e?.stopPropagation(); // don't also trigger the card's open-PR click
    const isFav = favouriteIds.has(pr.id);
    // Optimistic UI update, reverted below if the write fails.
    setFavouriteIds((prev) => {
      const next = new Set(prev);
      isFav ? next.delete(pr.id) : next.add(pr.id);
      return next;
    });
    const { error } = isFav
      ? await supabase.from("pr_favourites").delete().eq("user_id", profile.id).eq("pr_id", pr.id)
      : await supabase.from("pr_favourites").insert({ user_id: profile.id, pr_id: pr.id });
    if (error) {
      setFavouriteIds((prev) => {
        const next = new Set(prev);
        isFav ? next.add(pr.id) : next.delete(pr.id);
        return next;
      });
      setError(error.message);
    }
  };

  const startDuplicate = async (pr) => {
    // Item shape must match what NewPrForm keeps internally (camelCase), not
    // the raw pr_items column names, since the form edits these fields
    // directly the same way it edits a freshly-typed line item.
    const { data: sourceItems, error } = await supabase
      .from("pr_items")
      .select("*")
      .eq("pr_id", pr.id)
      .order("item_number");
    if (error) { setError(error.message); return; }
    setDuplicateSource({
      projectId: pr.project_id,
      supplierId: pr.supplier_id,
      deliverTo: pr.deliver_to,
      deliverAddress: pr.deliver_to_address || "",
      sourcePrId: pr.id,
      items: (sourceItems || []).map((it) => ({
        itemNumber: it.item_number,
        description: it.description,
        sku: it.sku,
        qty: String(it.qty),
        uomId: it.uom_id,
        remark: it.remark || "",
      })),
    });
    closePr();
    setShowForm(true);
  };

  const projectName = (pr) => pr.projects?.name || "Unknown project";
  const projectCode = (pr) => pr.projects?.code || "";
  const supplierName = (pr) => pr.suppliers?.name || "Unknown supplier";

  let filtered = statusFilter === "all" ? prs : prs.filter((p) => p.status === statusFilter);
  if (delayOnly) filtered = filtered.filter((p) => timeliness(p, sla) === "delay");

  const counts = {};
  const delayCounts = {};
  Object.keys(STATUS_META).forEach((k) => { counts[k] = 0; delayCounts[k] = 0; });
  prs.forEach((p) => {
    counts[p.status] = (counts[p.status] || 0) + 1;
    if (timeliness(p, sla) === "delay") delayCounts[p.status] = (delayCounts[p.status] || 0) + 1;
  });

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

  // Fire-and-forget: email is a courtesy notification, never a dependency
  // for the workflow action itself. Silently no-ops until an email
  // service key is configured.
  const notify = (payload) => {
    fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  };

  const closePr = () => {
    setExpandedId(null);
    window.history.pushState({}, "", "/board");
  };

  const toggleExpand = async (pr) => {
    if (expandedId === pr.id) {
      closePr();
      return;
    }
    setExpandedId(pr.id);
    window.history.pushState({}, "", `/board?pr=${pr.id}`);
    if (!itemsByPr[pr.id]) {
      const { data, error } = await supabase
        .from("pr_items")
        .select("*, uoms(name)")
        .eq("pr_id", pr.id)
        .order("item_number");
      if (error) { setError(error.message); return; }
      setItemsByPr((prev) => ({ ...prev, [pr.id]: data || [] }));
    }
    if (!attachmentsByPr[pr.id]) {
      const { data } = await supabase
        .from("pr_attachments")
        .select("*")
        .eq("pr_id", pr.id)
        .order("uploaded_at");
      setAttachmentsByPr((prev) => ({ ...prev, [pr.id]: data || [] }));
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

  const onCreated = async (newPr) => {
    setPrs([newPr, ...prs]);
    setShowForm(false);
    if (duplicateSource) {
      try {
        await duplicateAttachments(supabase, duplicateSource.sourcePrId, newPr.id);
      } catch (err) {
        setError(err.message + " (the requisition itself was still created successfully)");
      }
      setDuplicateSource(null);
    }
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
    notify({ event: "rejected", prId: pr.id, reason: rejectReason.trim() });
    setRejectingId(null);
    setRejectReason("");
  };

  const issuePo = async (pr) => {
    const poNumber = poDraft[pr.id];
    if (!poNumber?.trim()) return;
    // The supplier's committed date, if the Purchaser has one. This becomes the
    // benchmark that On-time / Delay is judged against from here on.
    const confirmedDate = poDateDraft[pr.id] || null;
    const patch = { status: "po_issued", po_number: poNumber.trim(), po_date: today(), po_issued_by: profile.id };
    if (confirmedDate) patch.new_delivery_date = confirmedDate;
    const del = poDeliverDraft[pr.id];
    if (del?.to && del.to !== pr.deliver_to) {
      patch.deliver_to = del.to;
      patch.deliver_to_address = del.to === "Other Location" ? (del.addr || "").trim() : null;
    } else if (del?.to === "Other Location" && (del.addr || "").trim() !== (pr.deliver_to_address || "")) {
      patch.deliver_to_address = (del.addr || "").trim();
    }
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
    notify({ event: "po_issued", prId: pr.id });
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
    notify({ event: "postponed", prId: pr.id, newDate: d.date, reason: d.reason.trim() });
    setPostponeDraft((prev) => ({ ...prev, [pr.id]: { date: "", reason: "" } }));
    setPostponingId(null);
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

  // Requester or Verifier asks for a PR to be cancelled. Before a PO exists
  // this goes straight to Admin; once a PO is issued, the Purchaser is asked
  // first whether it can actually be cancelled with the supplier.
  const requestCancellation = async (pr) => {
    const reason = (cancelRequestDraft[pr.id] || "").trim();
    if (!reason) return;
    const startsWith = pr.status === "po_issued" ? "pending_purchaser" : "pending_admin";
    const { data, error } = await supabase
      .from("pr_cancellation_requests")
      .insert({
        pr_id: pr.id,
        requested_by: profile.id,
        reason,
        pr_status_at_request: pr.status,
        status: startsWith,
      })
      .select()
      .single();
    if (error) return setError(error.message);
    setCancelRequests([...cancelRequests, data]);
    notify({ event: "cancel_requested", prId: pr.id, reason, toPurchaser: startsWith === "pending_purchaser" });
    setRequestingCancelId(null);
    setCancelRequestDraft((prev) => ({ ...prev, [pr.id]: "" }));
  };

  // The Requester/Verifier who opened the request can pull it back at any
  // point before it's been decided.
  const withdrawCancelRequest = async (request) => {
    const { data, error } = await supabase
      .from("pr_cancellation_requests")
      .update({ status: "withdrawn" })
      .eq("id", request.id)
      .select()
      .single();
    if (error) return setError(error.message);
    setCancelRequests(cancelRequests.map((r) => (r.id === request.id ? data : r)));
  };

  // Purchaser's answer to "can this PO actually be cancelled?" — Yes moves it
  // to Admin for the final decision; No ends it here and unlocks the PR.
  const purchaserRespondToCancelRequest = async (request, canCancel) => {
    const { data, error } = await supabase
      .from("pr_cancellation_requests")
      .update({
        status: canCancel ? "pending_admin" : "purchaser_rejected",
        purchaser_decision: canCancel,
        purchaser_decided_by: profile.id,
        purchaser_decided_at: new Date().toISOString(),
      })
      .eq("id", request.id)
      .select()
      .single();
    if (error) return setError(error.message);
    setCancelRequests(cancelRequests.map((r) => (r.id === request.id ? data : r)));
    notify({ event: "cancel_purchaser_decision", prId: request.pr_id, canCancel });
    setPurchaserDeciding(null);
  };

  // Admin's final word. Approve actually cancels the PR (reusing the same
  // cancellation fields the direct-cancel path already writes); reject just
  // unlocks it, leaving the door open for a fresh request later.
  const adminRespondToCancelRequest = async (request, approve) => {
    const reasonNote = (adminRequestReason[request.id] || "").trim();
    const { data: reqData, error: reqError } = await supabase
      .from("pr_cancellation_requests")
      .update({
        status: approve ? "approved" : "admin_rejected",
        admin_decided_by: profile.id,
        admin_decided_at: new Date().toISOString(),
        admin_decision_reason: reasonNote || null,
      })
      .eq("id", request.id)
      .select()
      .single();
    if (reqError) return setError(reqError.message);
    setCancelRequests(cancelRequests.map((r) => (r.id === request.id ? reqData : r)));

    if (approve) {
      const { data: prData, error: prError } = await supabase
        .from("purchase_requisitions")
        .update({
          status: "cancelled",
          cancelled_by: profile.id,
          cancelled_at: new Date().toISOString(),
          cancellation_reason: request.reason,
        })
        .eq("id", request.pr_id)
        .select()
        .single();
      if (prError) return setError(prError.message);
      updatePrLocal(request.pr_id, prData);
      await logEvent(request.pr_id, "cancelled", `from:${request.pr_status_at_request}|${request.reason} (requested cancellation, approved by ${profile.name})`);
    }
    notify({ event: "cancel_admin_decision", prId: request.pr_id, approved: approve });
    setAdminDecidingRequest(null);
  };

  // Requester pulls back their own pending change request before Purchasing
  // decides. Unlike a cancellation withdrawal, this is a real delete (the
  // row's only purpose was to be pending; nothing needs to persist after).
  const withdrawChangeRequest = async (request) => {
    const { error } = await supabase.from("pr_change_requests").delete().eq("id", request.id);
    if (error) return setError(error.message);
    setChangeRequests(changeRequests.filter((r) => r.id !== request.id));
  };

  // Purchasing's decision — approve applies the proposed values to the PR
  // and its items; reject just marks the request rejected and unlocks the
  // PR, leaving its original details untouched. This is Purchasing's call
  // alone, no separate Admin step, per the agreed spec.
  const purchaserDecideChangeRequest = async (request, approve) => {
    const reasonNote = (changeRejectReason[request.id] || "").trim();
    if (!approve && !reasonNote) return;

    const { data: reqData, error: reqError } = await supabase
      .from("pr_change_requests")
      .update({
        status: approve ? "approved" : "rejected",
        decided_by: profile.id,
        decided_at: new Date().toISOString(),
        rejection_reason: approve ? null : reasonNote,
      })
      .eq("id", request.id)
      .select()
      .single();
    if (reqError) return setError(reqError.message);
    setChangeRequests(changeRequests.filter((r) => r.id !== request.id));

    if (approve) {
      const { data: prData, error: prError } = await supabase
        .from("purchase_requisitions")
        .update({
          project_id: request.new_project_id,
          supplier_id: request.new_supplier_id,
          request_date: request.new_request_date,
          required_date: request.new_required_date,
        })
        .eq("id", request.pr_id)
        .select("*, projects(name, code), suppliers(name)")
        .single();
      if (prError) return setError(prError.message);

      // Replace items with the proposed set, same delete-then-insert pattern
      // used everywhere else items are wholesale replaced.
      const { error: deleteError } = await supabase.from("pr_items").delete().eq("pr_id", request.pr_id);
      if (deleteError) return setError(deleteError.message);
      const newItemRows = (request.new_items || []).map((i) => ({
        pr_id: request.pr_id,
        item_number: i.item_number,
        description: i.description,
        sku: i.sku,
        qty: i.qty,
        uom_id: i.uom_id,
        remark: i.remark,
      }));
      if (newItemRows.length > 0) {
        const { error: insertError } = await supabase.from("pr_items").insert(newItemRows);
        if (insertError) return setError(insertError.message);
      }

      updatePrLocal(request.pr_id, prData);
      const { data: freshItems } = await supabase
        .from("pr_items")
        .select("*, uoms(name)")
        .eq("pr_id", request.pr_id)
        .order("item_number");
      setItemsByPr((prev) => ({ ...prev, [request.pr_id]: freshItems || [] }));
      await logEvent(request.pr_id, "change_approved", `Change request approved by ${profile.name}`);
    } else {
      await logEvent(request.pr_id, "change_rejected", `Change request rejected by ${profile.name}: ${reasonNote}`);
    }

    notify({ event: "pr_change_decision", prId: request.pr_id, approved: approve, reason: reasonNote });
    setPurchaserDecidingChangeId(null);
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
    notify({ event: "delivery", prId: pr.id, delivery: deliveryRow });
    setDeliveryDraft((prev) => ({ ...prev, [pr.id]: { doNumber: "", deliveryDate: today(), type: "complete" } }));
  };

  const printPr = prs.find((p) => p.id === expandedId) || null;
  const myActionCount =
    pendingActionsFor(prs, profile, allProjectRoles, cancelRequests).length +
    pendingCancelRequestsFor(cancelRequests, prs, profile).length;

  return (
    <>
    <div className="min-h-screen bg-neutral-50 px-6 py-10 screen-root">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <Logo height={40} />
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-600">Purchase Requisition Platform</div>
              <h1 className="text-2xl font-bold mt-0.5">PR Board</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:ml-[52px]">
            {profile?.is_admin && (
              <a href="/admin" className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 text-white">Admin Setup</a>
            )}
            <a href="/my-actions" className="text-xs underline text-neutral-600 flex items-center gap-1">
              My Actions
              {myActionCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ background: "#B23A2E", color: "white" }}>
                  {myActionCount}
                </span>
              )}
            </a>
            <a href="/dashboard" className="text-xs underline text-neutral-600">Dashboard</a>
            <a href="/schedule" className="text-xs underline text-neutral-600">Schedule</a>
            <a href="/favourites" className="text-xs underline text-neutral-600">Favourites</a>
            <a href="/" className="text-xs underline text-neutral-600">Home</a>
          </div>
        </div>

        {error && <div className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2 mb-4">{error}</div>}

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-6">
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <div
              key={key}
              className="text-left px-2.5 py-2 rounded-md cursor-pointer"
              onClick={() => { setStatusFilter(statusFilter === key ? "all" : key); setDelayOnly(false); }}
              style={{
                border: `1.5px solid ${meta.color}`,
                background: statusFilter === key ? `${meta.color}14` : "white",
                color: meta.color,
              }}
            >
              <div className="text-[10px] uppercase tracking-wide leading-tight" style={{ minHeight: "3.6em" }}>{meta.label}</div>
              <div className="text-lg font-medium flex items-baseline gap-1">
                <span>{counts[key] || 0}</span>
                {delayCounts[key] > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const same = statusFilter === key && delayOnly;
                      setStatusFilter(same ? "all" : key);
                      setDelayOnly(!same);
                    }}
                    className="text-xs underline"
                    style={{ color: "#B23A2E" }}
                    title={`${delayCounts[key]} delayed \u2014 click to show only these`}
                  >
                    ({delayCounts[key]})
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <button onClick={() => { setStatusFilter("all"); setDelayOnly(false); }} className="text-xs uppercase tracking-wide text-neutral-600">
            Show all ({prs.length})
          </button>
          <button onClick={() => { setShowForm(!showForm); setDuplicateSource(null); }} className={`${btn} bg-neutral-900 text-white`}>
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
            duplicateSource={duplicateSource}
          />
        )}

        <div className="flex flex-col gap-2">
          {filtered.map((pr) => {
            const meta = STATUS_META[pr.status] || { label: pr.status, color: "#666" };
            const items = itemsByPr[pr.id];
            const deliveries = deliveriesByPr[pr.id];
            const canVerify = canActAs(allProjectRoles, pr.project_id, "verifier", profile.id, profile.is_admin);
            const canApprove = canActAs(allProjectRoles, pr.project_id, "approver", profile.id, profile.is_admin);
            const canPurchase = canActAs(allProjectRoles, pr.project_id, "purchaser", profile.id, profile.is_admin);
            const draft = deliveryDraft[pr.id] || { doNumber: "", deliveryDate: today(), type: "complete" };

            return (
              <div key={pr.id} className={card + " p-0"} style={expandedId === pr.id ? { borderColor: "#171717" } : undefined}>
                <div onClick={() => toggleExpand(pr)} className="w-full flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-3 text-left cursor-pointer">
                  <button
                    onClick={(e) => toggleFavourite(pr, e)}
                    className="shrink-0 text-lg leading-none"
                    style={{ color: favouriteIds.has(pr.id) ? "#D4A017" : "#d4d4d4" }}
                    title={favouriteIds.has(pr.id) ? "Remove from favourites" : "Add to favourites"}
                  >
                    {favouriteIds.has(pr.id) ? "★" : "☆"}
                  </button>
                  <div className="min-w-[150px] flex-1">
                    <div className="text-sm font-medium break-words">
                      {pr.pr_number} <span className="text-neutral-600">· {projectName(pr)} ({projectCode(pr)})</span>
                    </div>
                    <div className="text-xs text-neutral-600 mt-0.5">
                      {supplierName(pr)} · required by {pr.required_date}
                    </div>
                  </div>
                  <span className="flex flex-wrap items-center gap-1.5">
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
                      {meta.label}{assignedNamesFor(pr, allProjectRoles) ? ` — ${assignedNamesFor(pr, allProjectRoles)}` : ""}
                    </span>
                    {activeCancelRequest(cancelRequests, pr.id) && (
                      <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: "#B23A2E14", color: "#B23A2E" }}>
                        Cancellation Requested
                      </span>
                    )}
                  </span>
                </div>

              </div>
            );
          })}
          {filtered.length === 0 && <div className="text-sm text-neutral-600 text-center py-10">No requisitions here yet.</div>}
        </div>

        {/* PR detail opens as an overlay so the board stays in place behind it */}
        {(() => {
          const pr = prs.find((p) => p.id === expandedId);
          if (!pr) return null;
          const meta = STATUS_META[pr.status] || { label: pr.status, color: "#666" };
          const items = itemsByPr[pr.id];
          const deliveries = deliveriesByPr[pr.id];
          const canVerify = canActAs(allProjectRoles, pr.project_id, "verifier", profile.id, profile.is_admin);
          const canApprove = canActAs(allProjectRoles, pr.project_id, "approver", profile.id, profile.is_admin);
          const canPurchase = canActAs(allProjectRoles, pr.project_id, "purchaser", profile.id, profile.is_admin);
          const draft = deliveryDraft[pr.id] || { doNumber: "", deliveryDate: today(), type: "complete" };
          return (
            <>
            <div
              className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto overflow-x-hidden no-print"
              style={{ background: "rgba(0,0,0,0.45)" }}
            >
              <div className="bg-white rounded-lg w-full max-w-2xl my-8 shadow-xl" id="pr-print-area">
                <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 border-b border-neutral-200 sticky top-0 bg-white rounded-t-lg z-10">
                  <div className="min-w-0 pr-2">
                    <div className="text-sm font-medium break-words">
                      {pr.pr_number} <span className="text-neutral-600">· {projectName(pr)} ({projectCode(pr)})</span>
                    </div>
                    <div className="text-xs text-neutral-600 mt-0.5">{supplierName(pr)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-auto">
                    <button
                      onClick={(e) => toggleFavourite(pr, e)}
                      className="text-lg leading-none no-print"
                      style={{ color: favouriteIds.has(pr.id) ? "#D4A017" : "#d4d4d4" }}
                      title={favouriteIds.has(pr.id) ? "Remove from favourites" : "Add to favourites"}
                    >
                      {favouriteIds.has(pr.id) ? "★" : "☆"}
                    </button>
                    <button onClick={() => window.print()} className="text-xs underline text-neutral-600 no-print" title="Save as PDF">
                      PDF
                    </button>
                    <button
                      onClick={() => exportPrAsExcel(pr, itemsByPr[pr.id] || [], attachmentsByPr[pr.id] || [], deliveriesByPr[pr.id] || [])}
                      className="text-xs underline text-neutral-600 no-print"
                      title="Export as Excel"
                    >
                      Excel
                    </button>
                    <button onClick={() => startDuplicate(pr)} className="text-xs underline text-neutral-600 no-print" title="Duplicate this requisition">
                      Duplicate
                    </button>
                    <button onClick={closePr} className="text-lg leading-none px-1 text-neutral-600 no-print" aria-label="Close">
                      ×
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 w-full">
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
                      {meta.label}{assignedNamesFor(pr, allProjectRoles) ? ` — ${assignedNamesFor(pr, allProjectRoles)}` : ""}
                    </span>
                    {activeCancelRequest(cancelRequests, pr.id) && (
                      <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ background: "#B23A2E14", color: "#B23A2E" }}>
                        Cancellation Requested
                      </span>
                    )}
                  </div>
                </div>
                <div className="px-4 pb-4 pt-3">
                  <div className="pb-4 pt-1">
                    <div className="text-xs text-neutral-600 mb-2">
                      Requested {pr.request_date} · Required {pr.required_date}
                    </div>
                    <div className="text-xs text-neutral-600 mb-2">
                      Deliver to: {pr.deliver_to || "\u2014"}
                      {pr.deliver_to === "Other Location" && pr.deliver_to_address ? ` \u2014 ${pr.deliver_to_address}` : ""}
                    </div>

                    {!items && <div className="text-xs text-neutral-600">Loading items…</div>}
                    {items && (
                      <div className="overflow-x-auto mb-3">
                        <table className="text-xs" style={{ tableLayout: "auto", minWidth: 480 }}>
                          <colgroup>
                            <col />
                            <col style={{ width: 150 }} />
                            <col style={{ width: 56 }} />
                            <col style={{ width: 44 }} />
                            <col style={{ width: 56 }} />
                            <col style={{ width: 118 }} />
                          </colgroup>
                          <thead>
                            <tr className="text-left text-neutral-600">
                              <th className="py-1 pr-3" style={{ whiteSpace: "nowrap" }}>Item No.</th>
                              <th className="py-1 pr-3" style={{ whiteSpace: "nowrap" }}>Description</th>
                              <th className="py-1 pr-3" style={{ whiteSpace: "nowrap" }}>SKU</th>
                              <th className="py-1 pr-3" style={{ whiteSpace: "nowrap" }}>Qty</th>
                              <th className="py-1 pr-3" style={{ whiteSpace: "nowrap" }}>UOM</th>
                              <th className="py-1" style={{ whiteSpace: "nowrap" }}>Remark</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it) => (
                              <tr key={it.id} className="border-t border-neutral-100">
                                <td className="py-1.5 pr-3 align-top" style={{ whiteSpace: "nowrap" }}>{it.item_number}</td>
                                <td className="py-1.5 pr-3 align-top">
                                  <div className="break-words" style={{ maxHeight: 72, overflowY: "auto" }}>{it.description}</div>
                                </td>
                                <td className="py-1.5 pr-3 align-top break-words">{it.sku}</td>
                                <td className="py-1.5 pr-3 align-top break-words">{it.qty}</td>
                                <td className="py-1.5 pr-3 align-top break-words">{it.uoms?.name || "—"}</td>
                                <td className="py-1.5 align-top">
                                  <div className="break-words" style={{ maxHeight: 72, overflowY: "auto" }}>{it.remark || "—"}</div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <AttachmentsDisplay supabase={supabase} prId={pr.id} />

                    <div className="text-xs text-neutral-600 mb-3 flex flex-col gap-0.5">
                      <div>Requested by {pr.requester?.name || "—"} on {pr.request_date}</div>
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
                    {pr.status === "pending_po" && canPurchase && (
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
                        <div className="mb-2">
                          <select
                            className={input + " text-xs w-full"}
                            value={poDeliverDraft[pr.id]?.to ?? (pr.deliver_to || "")}
                            onChange={(e) => setPoDeliverDraft({ ...poDeliverDraft, [pr.id]: { to: e.target.value, addr: e.target.value === "Other Location" ? (poDeliverDraft[pr.id]?.addr ?? pr.deliver_to_address ?? "") : "" } })}
                          >
                            <option value="">Deliver to…</option>
                            <option value="TMS Factory">TMS Factory</option>
                            <option value="Other Location">Other Location</option>
                          </select>
                          {(poDeliverDraft[pr.id]?.to ?? pr.deliver_to) === "Other Location" && (
                            <textarea
                              className={input + " text-xs w-full mt-1"}
                              rows={2}
                              placeholder="Delivery address"
                              value={poDeliverDraft[pr.id]?.addr ?? pr.deliver_to_address ?? ""}
                              onChange={(e) => setPoDeliverDraft({ ...poDeliverDraft, [pr.id]: { to: poDeliverDraft[pr.id]?.to ?? pr.deliver_to, addr: e.target.value } })}
                            />
                          )}
                          <div className="text-xs text-neutral-600 mt-1">Amend the delivery destination if it has changed.</div>
                        </div>
                        <button onClick={() => issuePo(pr)} className={`${btn} text-white`} style={{ background: "#1F6B63" }}>Issue PO</button>
                      </div>
                    )}

                    {/* Purchasing: log delivery — locked while a cancellation or change request is pending */}
                    {(pr.status === "po_issued" || pr.status === "partial_delivery") && canPurchase &&
                      !activeCancelRequest(cancelRequests, pr.id) && !activeChangeRequest(changeRequests, pr.id) && (
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

                    {/* Administrator: correct details at any stage before fulfilment, including a rejected PR.
                        Hidden when this Admin is also the Requester of a rejected PR, since that case
                        already shows the Requester's own "Edit & Resubmit" button below — avoids two
                        different edit buttons with different behavior appearing at once. */}
                    {profile.is_admin && !["fulfilled", "cancelled"].includes(pr.status) &&
                      !(pr.status === "rejected" && pr.requester_id === profile.id) && (
                      adminEditId === pr.id ? (
                        <EditPrForm
                          supabase={supabase}
                          pr={pr}
                          suppliers={suppliers}
                          uoms={uoms}
                          initialItems={items || []}
                          mode="admin"
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

                    {/* Purchasing: postpone an agreed delivery — locked while a cancellation or change request is pending */}
                    {(pr.status === "po_issued" || pr.status === "partial_delivery") && canPurchase &&
                      !activeCancelRequest(cancelRequests, pr.id) && !activeChangeRequest(changeRequests, pr.id) && (
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

                    {profile.is_admin && pr.status === "cancelled" && (
                      <button onClick={() => reinstatePr(pr)} className={`${btn} text-white mt-2`} style={{ background: "#171717" }}>
                        Reinstate requisition
                      </button>
                    )}

                    {(() => {
                      const request = activeCancelRequest(cancelRequests, pr.id);
                      // Requester, Verifier, or Approver may request cancellation.
                      // Admin is deliberately excluded here (stays purely the
                      // approver/decision-maker on the request), so this
                      // checks project roles directly rather than via
                      // canActAs, which would otherwise grant any Admin
                      // access through its blanket isAdmin bypass.
                      const isVerifierOnPr = allProjectRoles.some(
                        (r) => r.project_id === pr.project_id && r.role === "verifier" && r.user_id === profile.id
                      );
                      const isApproverOnPr = allProjectRoles.some(
                        (r) => r.project_id === pr.project_id && r.role === "approver" && r.user_id === profile.id
                      );
                      const canRequest =
                        !request &&
                        !profile.is_admin &&
                        !profile.is_purchasing &&
                        !["cancelled", "fulfilled", "partial_delivery"].includes(pr.status) &&
                        (pr.requester_id === profile.id || isVerifierOnPr || isApproverOnPr);

                      if (canRequest) {
                        return requestingCancelId === pr.id ? (
                          <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 mt-2">
                            <div className="text-xs text-neutral-600 mb-2">
                              {pr.status === "po_issued"
                                ? "A PO has already been issued. The Purchaser will confirm it can be cancelled with the supplier before this goes to Admin."
                                : "This will be sent to your Administrator to approve."}
                            </div>
                            <div className="flex gap-2">
                              <input
                                className={input + " text-xs flex-1"}
                                placeholder="Reason for cancellation request *"
                                value={cancelRequestDraft[pr.id] || ""}
                                onChange={(e) => setCancelRequestDraft({ ...cancelRequestDraft, [pr.id]: e.target.value })}
                              />
                              <button
                                onClick={() => requestCancellation(pr)}
                                disabled={!(cancelRequestDraft[pr.id] || "").trim()}
                                className={`${btn} shrink-0`}
                                style={{ background: (cancelRequestDraft[pr.id] || "").trim() ? "#B23A2E" : "#d4d4d4", color: "white" }}
                              >
                                Send request
                              </button>
                              <button onClick={() => setRequestingCancelId(null)} className={`${btn} border border-neutral-300 shrink-0`}>Back</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setRequestingCancelId(pr.id)} className={`${btn} border mt-2`} style={{ borderColor: "#B23A2E", color: "#B23A2E" }}>
                            Request cancellation
                          </button>
                        );
                      }

                      if (request && request.requested_by === profile.id) {
                        return (
                          <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 mt-2">
                            <div className="text-xs text-neutral-600 mb-2">
                              Cancellation requested{request.status === "pending_purchaser" ? " — waiting on Purchasing to confirm the PO can be cancelled." : " — waiting on Admin to approve."}
                            </div>
                            <button onClick={() => withdrawCancelRequest(request)} className={`${btn} border border-neutral-300`}>
                              Withdraw request
                            </button>
                          </div>
                        );
                      }

                      if (request && request.status === "pending_purchaser" && (profile.is_purchasing || profile.is_admin)) {
                        return purchaserDeciding === pr.id ? (
                          <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 mt-2">
                            <div className="text-xs text-neutral-600 mb-2">Reason given: {request.reason}</div>
                            <div className="text-xs text-neutral-600 mb-2">Can this PO be cancelled with the supplier?</div>
                            <div className="flex gap-2">
                              <button onClick={() => purchaserRespondToCancelRequest(request, true)} className={`${btn} text-white`} style={{ background: "#1F6B63" }}>
                                Yes, PO can be cancelled
                              </button>
                              <button onClick={() => purchaserRespondToCancelRequest(request, false)} className={`${btn} border`} style={{ borderColor: "#B23A2E", color: "#B23A2E" }}>
                                No, keep PO
                              </button>
                              <button onClick={() => setPurchaserDeciding(null)} className={`${btn} border border-neutral-300`}>Back</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setPurchaserDeciding(pr.id)} className={`${btn} border mt-2`} style={{ borderColor: "#B23A2E", color: "#B23A2E" }}>
                            Respond to cancellation request
                          </button>
                        );
                      }

                      if (request && request.status === "pending_admin" && profile.is_admin) {
                        return adminDecidingRequest === pr.id ? (
                          <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 mt-2">
                            <div className="text-xs text-neutral-600 mb-2">Reason given: {request.reason}</div>
                            {request.purchaser_decision === true && (
                              <div className="text-xs mb-2" style={{ color: "#1F6B63" }}>Purchasing confirmed the PO can be cancelled.</div>
                            )}
                            <input
                              className={input + " text-xs w-full mb-2"}
                              placeholder="Note (optional)"
                              value={adminRequestReason[request.id] || ""}
                              onChange={(e) => setAdminRequestReason({ ...adminRequestReason, [request.id]: e.target.value })}
                            />
                            <div className="flex gap-2">
                              <button onClick={() => adminRespondToCancelRequest(request, true)} className={`${btn} text-white`} style={{ background: "#B23A2E" }}>
                                Approve cancellation
                              </button>
                              <button onClick={() => adminRespondToCancelRequest(request, false)} className={`${btn} border border-neutral-300`}>
                                Reject request
                              </button>
                              <button onClick={() => setAdminDecidingRequest(null)} className={`${btn} border border-neutral-300`}>Back</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setAdminDecidingRequest(pr.id)} className={`${btn} border mt-2`} style={{ borderColor: "#B23A2E", color: "#B23A2E" }}>
                            Respond to cancellation request
                          </button>
                        );
                      }

                      return null;
                    })()}

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

                    {/* Requester: direct edit on any pre-PO PR other than "rejected" (which uses
                        the resubmit flow above instead). Applies immediately, no approval step —
                        Admin is deliberately excluded here, same reasoning as elsewhere: this is
                        the Requester's own direct-edit privilege, not an Admin capability. Blocked
                        while a cancellation request is pending on this PR, per the agreed rule that
                        a change request and a cancellation request can't be open at the same time. */}
                    {["pending_verification", "pending_approval", "pending_po"].includes(pr.status) &&
                      pr.requester_id === profile.id &&
                      !activeCancelRequest(cancelRequests, pr.id) && (
                      directEditingId === pr.id ? (
                        <EditPrForm
                          supabase={supabase}
                          pr={pr}
                          suppliers={suppliers}
                          uoms={uoms}
                          initialItems={items || []}
                          mode="requester_direct"
                          notify={notify}
                          eligibleProjects={eligibleProjects}
                          onUpdated={(prId, updatedPr, freshItems) => {
                            updatePrLocal(prId, updatedPr);
                            setItemsByPr((prev) => ({ ...prev, [prId]: freshItems }));
                            setDirectEditingId(null);
                          }}
                          onError={setError}
                          onCancel={() => setDirectEditingId(null)}
                        />
                      ) : (
                        <button onClick={() => setDirectEditingId(pr.id)} className={`${btn} border mt-2`} style={{ borderColor: "#171717", color: "#171717" }}>
                          Edit requisition
                        </button>
                      )
                    )}

                    {/* Requester: request a change on a post-PO PR (PO issued, no delivery yet).
                        Doesn't touch the PR directly — Purchasing reviews and decides alone.
                        Blocked while a cancellation request is pending, same rule as above. */}
                    {pr.status === "po_issued" &&
                      pr.requester_id === profile.id &&
                      !activeCancelRequest(cancelRequests, pr.id) &&
                      !activeChangeRequest(changeRequests, pr.id) && (
                      requestingChangeId === pr.id ? (
                        <ChangeRequestForm
                          supabase={supabase}
                          pr={pr}
                          suppliers={suppliers}
                          uoms={uoms}
                          initialItems={items || []}
                          eligibleProjects={eligibleProjects}
                          profile={profile}
                          onSubmitted={(newRequest) => {
                            setChangeRequests([...changeRequests, newRequest]);
                            setRequestingChangeId(null);
                          }}
                          onError={setError}
                          onCancel={() => setRequestingChangeId(null)}
                        />
                      ) : (
                        <button onClick={() => setRequestingChangeId(pr.id)} className={`${btn} border mt-2`} style={{ borderColor: "#171717", color: "#171717" }}>
                          Request a change
                        </button>
                      )
                    )}

                    {/* Requester: withdraw their own pending change request at any time before
                        Purchasing decides. */}
                    {(() => {
                      const changeRequest = activeChangeRequest(changeRequests, pr.id);
                      if (changeRequest && changeRequest.requested_by === profile.id) {
                        return (
                          <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 mt-2">
                            <div className="text-xs text-neutral-600 mb-2">
                              Change requested — waiting on Purchasing to review.
                            </div>
                            <button onClick={() => withdrawChangeRequest(changeRequest)} className={`${btn} border border-neutral-300`}>
                              Withdraw request
                            </button>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Purchasing: decide a pending change request. Shows a simple text summary of
                        what changed (per the agreed spec — not a full field-by-field UI), then
                        checks with the supplier before approving or rejecting with a reason.
                        Deliberately checks REAL Purchasing-role membership only, not canPurchase's
                        usual Admin bypass — the database policy on pr_change_requests excludes
                        Admin entirely ("Purchasing's decision alone"), so the button must match
                        exactly what the database will actually allow, or Admin sees a button that
                        silently fails when clicked. */}
                    {(() => {
                      const changeRequest = activeChangeRequest(changeRequests, pr.id);
                      const isPurchasingOnPr = allProjectRoles.some(
                        (r) => r.project_id === pr.project_id && r.role === "purchaser" && r.user_id === profile.id
                      );
                      if (!changeRequest || !isPurchasingOnPr) return null;

                      const changedFields = [];
                      if (changeRequest.old_project_id !== changeRequest.new_project_id) changedFields.push("Project");
                      if (changeRequest.old_supplier_id !== changeRequest.new_supplier_id) changedFields.push("Supplier");
                      if (changeRequest.old_request_date !== changeRequest.new_request_date) changedFields.push("Request date");
                      if (changeRequest.old_required_date !== changeRequest.new_required_date) changedFields.push("Required delivery date");
                      const oldItemsStr = JSON.stringify(changeRequest.old_items);
                      const newItemsStr = JSON.stringify(changeRequest.new_items);
                      if (oldItemsStr !== newItemsStr) changedFields.push("Items");

                      return purchaserDecidingChangeId === pr.id ? (
                        <div className="bg-neutral-50 border border-neutral-200 rounded-md p-3 mt-2">
                          <div className="text-xs uppercase tracking-wide text-neutral-600 mb-2">Proposed change</div>
                          <div className="text-xs text-neutral-600 mb-2">
                            {changedFields.length > 0 ? changedFields.join(", ") + " changed." : "No fields appear changed."}
                          </div>
                          <div className="text-xs text-neutral-600 mb-2">Check with the supplier whether this is acceptable.</div>
                          <input
                            className={input + " text-xs w-full mb-2"}
                            placeholder="Reason if rejecting (required to reject)"
                            value={changeRejectReason[changeRequest.id] || ""}
                            onChange={(e) => setChangeRejectReason({ ...changeRejectReason, [changeRequest.id]: e.target.value })}
                          />
                          <div className="flex gap-2">
                            <button onClick={() => purchaserDecideChangeRequest(changeRequest, true)} className={`${btn} text-white`} style={{ background: "#1F6B63" }}>
                              Approve change
                            </button>
                            <button
                              onClick={() => purchaserDecideChangeRequest(changeRequest, false)}
                              disabled={!(changeRejectReason[changeRequest.id] || "").trim()}
                              className={`${btn} border`}
                              style={{ borderColor: "#B23A2E", color: "#B23A2E" }}
                            >
                              Reject
                            </button>
                            <button onClick={() => setPurchaserDecidingChangeId(null)} className={`${btn} border border-neutral-300`}>Back</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setPurchaserDecidingChangeId(pr.id)} className={`${btn} border mt-2`} style={{ borderColor: "#171717", color: "#171717" }}>
                          Review change request
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            </>
          );
        })()}

      </div>
    </div>

    {printPr && (
      <div className="print-only">
        <PrPrintForm
          pr={printPr}
          items={itemsByPr[printPr.id] || []}
          attachments={attachmentsByPr[printPr.id] || []}
          deliveries={deliveriesByPr[printPr.id] || []}
        />
      </div>
    )}
    </>
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

// Post-PO change request: Requester proposes new values for a PR that
// already has a PO issued. Doesn't touch the PR directly — creates a
// pr_change_requests row with old+new snapshots for Purchasing to review.
function ChangeRequestForm({ supabase, pr, suppliers, uoms, initialItems, eligibleProjects, profile, onSubmitted, onError, onCancel }) {
  const [projectId, setProjectId] = useState(pr.project_id || "");
  const [supplierId, setSupplierId] = useState(pr.supplier_id || "");
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
  const [submitting, setSubmitting] = useState(false);

  const updateItem = (idx, field, val) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: val };
    setItems(next);
  };
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));

  const requiredDateValid = !requiredDate || requiredDate >= today();
  const itemsValid = items.length > 0 && items.every(
    (i) => i.description.trim() && String(i.qty).trim() !== "" && i.uomId
  );
  const canSubmit = projectId && supplierId && requestDate && requiredDate && requiredDateValid && itemsValid && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    const newItemRows = items.map((i) => ({
      item_number: i.itemNumber.trim(),
      description: i.description.trim(),
      sku: i.sku.trim(),
      qty: Number(i.qty),
      uom_id: i.uomId,
      remark: i.remark.trim() || null,
    }));
    const oldItemRows = initialItems.map((it) => ({
      item_number: it.item_number,
      description: it.description,
      sku: it.sku,
      qty: it.qty,
      uom_id: it.uom_id,
      remark: it.remark,
    }));

    const { data, error } = await supabase
      .from("pr_change_requests")
      .insert({
        pr_id: pr.id,
        requested_by: profile.id,
        old_project_id: pr.project_id,
        old_supplier_id: pr.supplier_id,
        old_request_date: pr.request_date,
        old_required_date: pr.required_date,
        old_items: oldItemRows,
        new_project_id: projectId,
        new_supplier_id: supplierId,
        new_request_date: requestDate,
        new_required_date: requiredDate,
        new_items: newItemRows,
      })
      .select()
      .single();

    setSubmitting(false);
    if (error) return onError(error.message);
    onSubmitted(data);
  };

  return (
    <div className={card + " mb-2"}>
      <div className="text-sm font-bold mb-1">Request a change</div>
      <div className="text-xs text-neutral-600 mb-3">
        A PO has already been issued for this requisition. Your proposed changes will be sent to
        Purchasing to check with the supplier before anything is applied.
      </div>

      <div className="mb-3">
        <div className="text-xs text-neutral-600 mb-1">Project</div>
        <select className={input + " w-full"} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {eligibleProjects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
        </select>
      </div>

      <div className="mb-3">
        <div className="text-xs text-neutral-600 mb-1">Supplier</div>
        <select className={input + " w-full"} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">Please select</option>
          {suppliers.filter((s) => s.status !== "pending").map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <div className="text-xs text-neutral-600 mb-1">Request date</div>
          <input type="date" className={input + " w-full"} value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
        </div>
        <div>
          <div className="text-xs text-neutral-600 mb-1">Required delivery date</div>
          <input type="date" className={input + " w-full"} value={requiredDate} onChange={(e) => setRequiredDate(e.target.value)} />
          {!requiredDateValid && <div className="text-xs text-red-600 mt-1">Can't be in the past.</div>}
        </div>
      </div>

      <div className="mb-2">
        {items.map((it, idx) => (
          <div key={idx} className="border border-neutral-200 rounded-md p-2.5 mb-2">
            <div className="flex justify-between mb-1.5">
              <span className="text-xs font-medium text-neutral-600">Item {idx + 1}</span>
              {items.length > 1 && (
                <button onClick={() => removeItem(idx)} className="text-xs text-red-600">Remove</button>
              )}
            </div>
            <textarea
              className={input + " w-full mb-2"}
              placeholder="Description of item *"
              value={it.description}
              onChange={(e) => updateItem(idx, "description", e.target.value)}
              onBlur={(e) => updateItem(idx, "description", autoCorrectAllCaps(e.target.value))}
              rows={2}
            />
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                className={input}
                placeholder="Item Number (optional)"
                value={it.itemNumber}
                onChange={(e) => updateItem(idx, "itemNumber", e.target.value)}
              />
              <input
                className={input}
                placeholder="SKU / product code (optional)"
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
            <textarea
              className={input + " w-full"}
              placeholder="Remark (optional)"
              value={it.remark}
              onChange={(e) => updateItem(idx, "remark", e.target.value)}
              onBlur={(e) => updateItem(idx, "remark", autoCorrectAllCaps(e.target.value))}
              rows={2}
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => {
          if (items.length >= MAX_ITEMS) return;
          setItems([...items, blankItem()]);
        }}
        className="text-xs w-full py-2 rounded-md border border-dashed border-neutral-300 text-neutral-600 mb-4"
      >
        + Add another item
      </button>

      <div className="flex gap-2">
        <button onClick={submit} disabled={!canSubmit} className={`${btn} text-white`} style={{ background: canSubmit ? "#171717" : "#d4d4d4" }}>
          {submitting ? "Submitting…" : "Submit change request"}
        </button>
        <button onClick={onCancel} className={`${btn} border border-neutral-300`}>Cancel</button>
      </div>
    </div>
  );
}

function NewPrForm({ supabase, eligibleProjects, suppliers, setSuppliers, uoms, allProjectRoles, profile, onCreated, onError, duplicateSource = null }) {
  const [projectId, setProjectId] = useState(duplicateSource?.projectId || "");
  const [supplierId, setSupplierId] = useState(duplicateSource?.supplierId || "");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [deliverTo, setDeliverTo] = useState(duplicateSource?.deliverTo || "");
  const [deliverAddress, setDeliverAddress] = useState(duplicateSource?.deliverAddress || "");
  const [dupeWarning, setDupeWarning] = useState(null);
  const [itemLimitNotice, setItemLimitNotice] = useState("");
  const [requestDate, setRequestDate] = useState(today());
  const [requiredDate, setRequiredDate] = useState("");
  const [items, setItems] = useState(duplicateSource?.items?.length > 0 ? duplicateSource.items : [blankItem()]);
  const [quotationFiles, setQuotationFiles] = useState([]);
  const [budgetComparisonFiles, setBudgetComparisonFiles] = useState([]);
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
    (i) => i.description.trim() && String(i.qty).trim() !== "" && i.uomId
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
  const deliverToOk = deliverTo === "TMS Factory" || (deliverTo === "Other Location" && deliverAddress.trim().length > 0);
  const canSubmit = projectId && supplierChosen && deliverToOk && rolesReady && requestDate && requiredDate && requiredDateValid && itemsValid && drawingsValid && !submitting;

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
        deliver_to: deliverTo,
        deliver_to_address: deliverTo === "Other Location" ? deliverAddress.trim() : null,
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
      await uploadAttachments(supabase, prData.id, { quotationFiles, budgetComparisonFiles, drawings, photos });
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
      {duplicateSource && (
        <div className="text-xs px-3 py-2 rounded-md mb-3 bg-amber-50 text-amber-700">
          Duplicating an existing requisition — Project, Supplier, Deliver To, and items have been copied.
          Dates need to be entered fresh, and you'll become the Requester on this new requisition.
        </div>
      )}

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
            placeholder="New supplier name * (max 20 characters)"
            value={newSupplierName}
            maxLength={20}
            onChange={(e) => {
              const v = e.target.value;
              setNewSupplierName(v);
              setDupeWarning(findSimilarSupplier(suppliers, v));
            }}
            onBlur={(e) => {
              const v = autoCorrectAllCaps(e.target.value);
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

      <div className="mb-4">
        <label className="text-xs text-neutral-600">Deliver to *</label>
        <select
          className={input + " w-full"}
          value={deliverTo}
          onChange={(e) => { setDeliverTo(e.target.value); if (e.target.value !== "Other Location") setDeliverAddress(""); }}
        >
          <option value="">Please select</option>
          <option value="TMS Factory">TMS Factory</option>
          <option value="Other Location">Other Location</option>
        </select>
        {deliverTo === "Other Location" && (
          <textarea
            className={input + " w-full mt-2"}
            rows={2}
            placeholder="Delivery address *"
            value={deliverAddress}
            onChange={(e) => setDeliverAddress(e.target.value)}
          />
        )}
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
            <textarea
              className={input + " w-full mb-2"}
              placeholder="Description of item *"
              value={it.description}
              onChange={(e) => updateItem(idx, "description", e.target.value)}
              onBlur={(e) => updateItem(idx, "description", autoCorrectAllCaps(e.target.value))}
              rows={2}
            />
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                className={input}
                placeholder="Item Number (optional)"
                value={it.itemNumber}
                onChange={(e) => updateItem(idx, "itemNumber", e.target.value)}
              />
              <input
                className={input}
                placeholder="SKU / product code (optional)"
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
            <textarea
              className={input + " w-full"}
              placeholder="Remark (optional)"
              value={it.remark}
              onChange={(e) => updateItem(idx, "remark", e.target.value)}
              onBlur={(e) => updateItem(idx, "remark", autoCorrectAllCaps(e.target.value))}
              rows={2}
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
        budgetComparisonFiles={budgetComparisonFiles}
        setBudgetComparisonFiles={setBudgetComparisonFiles}
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

function EditPrForm({ supabase, pr, suppliers, uoms, initialItems, onUpdated, onError, onCancel, mode = "resubmit", notify, eligibleProjects = [] }) {
  // "resubmit": existing Requester flow for a REJECTED PR — resets status to
  //   pending_verification, clears the rejection.
  // "admin": Admin's own edit path — saves in place, no status change.
  // "requester_direct": NEW — Requester editing any pre-PO PR immediately,
  //   no approval step. Saves in place, same as admin, but reached via a
  //   different eligibility check, allows changing Project (unlike the other
  //   two modes), and triggers its own notification.
  const skipStatusReset = mode === "admin" || mode === "requester_direct";
  const adminMode = mode === "admin"; // kept for the two purely cosmetic uses below (heading/button text)
  const [projectId, setProjectId] = useState(pr.project_id || "");
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
  const [budgetComparisonFiles, setBudgetComparisonFiles] = useState([]);
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
    (i) => i.description.trim() && String(i.qty).trim() !== "" && i.uomId
  );
  const drawingsValid = drawings.every((d) => d.drawingNumber.trim() && d.revisionNo.trim());
  const canSubmit = (mode !== "requester_direct" || projectId) && supplierId && requestDate && requiredDate && requiredDateValid && itemsValid && drawingsValid && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    // The delete-old-items policy only permits this while the PR is still
    // "rejected" — so the old items MUST be cleared out before the status
    // moves on, or the delete silently matches nothing (Supabase does not
    // treat an RLS-filtered delete as an error) and every resubmission ends
    // up appending a fresh copy of the items on top of the untouched old ones.
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

    const { data: prData, error: prError } = await supabase
      .from("purchase_requisitions")
      .update(
        skipStatusReset
          ? {
              ...(mode === "requester_direct" ? { project_id: projectId } : {}),
              supplier_id: supplierId,
              request_date: requestDate,
              required_date: requiredDate,
            }
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

    try {
      await uploadAttachments(supabase, pr.id, { quotationFiles, budgetComparisonFiles, drawings, photos });
    } catch (attachErr) {
      onError(attachErr.message + " (the resubmission itself still went through)");
    }

    const { data: freshItems } = await supabase
      .from("pr_items")
      .select("*, uoms(name)")
      .eq("pr_id", pr.id)
      .order("item_number");

    setSubmitting(false);
    if (mode === "requester_direct" && notify) {
      notify({ event: "pr_edited", prId: pr.id });
    }
    onUpdated(pr.id, prData, freshItems || []);
  };

  return (
    <div className={card + " mb-2"}>
      <div className="text-sm font-bold mb-1">
        {mode === "admin" ? "Edit details" : mode === "requester_direct" ? "Edit requisition" : "Edit & Resubmit"}
      </div>
      {mode === "requester_direct" ? (
        <div className="mb-3">
          <div className="text-xs text-neutral-600 mb-1">Project</div>
          <select className={input + " w-full"} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {eligibleProjects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
        </div>
      ) : (
        <div className="text-xs text-neutral-600 mb-3">
          {pr.projects?.name} ({pr.projects?.code}) — project can't be changed here.
        </div>
      )}

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
            placeholder="New supplier name * (max 20 characters)"
            value={newSupplierName}
            maxLength={20}
            onChange={(e) => {
              const v = e.target.value;
              setNewSupplierName(v);
              setDupeWarning(findSimilarSupplier(suppliers, v));
            }}
            onBlur={(e) => {
              const v = autoCorrectAllCaps(e.target.value);
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
            <textarea
              className={input + " w-full mb-2"}
              placeholder="Description of item *"
              value={it.description}
              onChange={(e) => updateItem(idx, "description", e.target.value)}
              onBlur={(e) => updateItem(idx, "description", autoCorrectAllCaps(e.target.value))}
              rows={2}
            />
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                className={input}
                placeholder="Item Number (optional)"
                value={it.itemNumber}
                onChange={(e) => updateItem(idx, "itemNumber", e.target.value)}
              />
              <input
                className={input}
                placeholder="SKU / product code (optional)"
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
            <textarea
              className={input + " w-full"}
              placeholder="Remark (optional)"
              value={it.remark}
              onChange={(e) => updateItem(idx, "remark", e.target.value)}
              onBlur={(e) => updateItem(idx, "remark", autoCorrectAllCaps(e.target.value))}
              rows={2}
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

      {pr.status === "rejected" && (
        <ExistingAttachmentsEditor supabase={supabase} prId={pr.id} onError={onError} />
      )}
      <div className="text-xs text-neutral-600 mb-2">Add any new supporting files below (existing ones stay attached):</div>
      <AttachmentPicker
        quotationFiles={quotationFiles}
        setQuotationFiles={setQuotationFiles}
        budgetComparisonFiles={budgetComparisonFiles}
        setBudgetComparisonFiles={setBudgetComparisonFiles}
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
          {submitting
            ? "Saving…"
            : mode === "admin"
            ? "Save changes"
            : mode === "requester_direct"
            ? "Save changes"
            : "Save & Resubmit for Verification"}
        </button>
        <button onClick={onCancel} className={`${btn} border border-neutral-300`}>Cancel</button>
      </div>
    </div>
  );
}
