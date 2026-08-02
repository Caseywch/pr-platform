"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AttachmentPicker, uploadAttachments, AttachmentsDisplay } from "./Attachments";

const STATUS_META = {
  pending_verification: { label: "Pending Verification", color: "#A6791E" },
  rejected: { label: "Needs Revision", color: "#B23A2E" },
  pending_approval: { label: "Pending Approval", color: "#34456B" },
  pending_po: { label: "Approved — Pending PO", color: "#1F6B63" },
  po_issued: { label: "PO Issued — Awaiting Delivery", color: "#8A3B1F" },
  partial_delivery: { label: "Partial Delivery — Outstanding", color: "#9C6B14" },
  fulfilled: { label: "Fulfilled", color: "#3F7D4F" },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}
function blankItem() {
  return { itemNumber: "", description: "", sku: "", qty: "", uomId: "", remark: "" };
}
function canActAs(allProjectRoles, projectId, role, userId) {
  const assigned = allProjectRoles.filter((r) => r.project_id === projectId && r.role === role);
  if (assigned.length === 0) return true;
  return assigned.some((r) => r.user_id === userId);
}
function assignedNames(allProjectRoles, projectId, role) {
  return allProjectRoles.filter((r) => r.project_id === projectId && r.role === role).map((r) => r.user_id);
}

const btn = "text-sm px-3 py-1.5 rounded-md";
const input = "border border-neutral-300 rounded-md px-3 py-2 text-sm";
const card = "bg-white border border-neutral-200 rounded-lg p-5";

export default function Board({ profile, initialPrs, allProjects, eligibleProjects, suppliers, uoms, allProjectRoles }) {
  const supabase = createClient();
  const [prs, setPrs] = useState(initialPrs);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [itemsByPr, setItemsByPr] = useState({});
  const [deliveriesByPr, setDeliveriesByPr] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [poDraft, setPoDraft] = useState({});
  const [deliveryDraft, setDeliveryDraft] = useState({});

  const projectName = (pr) => pr.projects?.name || "Unknown project";
  const projectCode = (pr) => pr.projects?.code || "";
  const supplierName = (pr) => pr.suppliers?.name || "Unknown supplier";

  const filtered = statusFilter === "all" ? prs : prs.filter((p) => p.status === statusFilter);

  const counts = {};
  Object.keys(STATUS_META).forEach((k) => (counts[k] = 0));
  prs.forEach((p) => (counts[p.status] = (counts[p.status] || 0) + 1));

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

  const resubmit = async (pr) => {
    const { data, error } = await supabase
      .from("purchase_requisitions")
      .update({ status: "pending_verification", rejected_by: null, rejection_reason: null })
      .eq("id", pr.id)
      .select()
      .single();
    if (error) return setError(error.message);
    updatePrLocal(pr.id, data);
  };

  const issuePo = async (pr) => {
    const poNumber = poDraft[pr.id];
    if (!poNumber?.trim()) return;
    const { data, error } = await supabase
      .from("purchase_requisitions")
      .update({ status: "po_issued", po_number: poNumber.trim(), po_date: today() })
      .eq("id", pr.id)
      .select()
      .single();
    if (error) return setError(error.message);
    updatePrLocal(pr.id, data);
    setPoDraft((prev) => ({ ...prev, [pr.id]: "" }));
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
            uoms={uoms}
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
            const canVerify = canActAs(allProjectRoles, pr.project_id, "verifier", profile.id);
            const canApprove = canActAs(allProjectRoles, pr.project_id, "approver", profile.id);
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
                  <span className="text-xs px-2 py-1 rounded-full shrink-0 ml-3" style={{ background: `${meta.color}14`, color: meta.color }}>
                    {meta.label}
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
                      <div className="flex gap-2">
                        <input
                          className={input + " flex-1"}
                          placeholder="PO number"
                          value={poDraft[pr.id] || ""}
                          onChange={(e) => setPoDraft({ ...poDraft, [pr.id]: e.target.value })}
                        />
                        <button onClick={() => issuePo(pr)} className={`${btn} text-white shrink-0`} style={{ background: "#1F6B63" }}>Issue PO</button>
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

                    {/* Requester: resubmit */}
                    {pr.status === "rejected" && pr.requester_id === profile.id && (
                      <button onClick={() => resubmit(pr)} className={`${btn} text-white`} style={{ background: "#171717" }}>
                        Resubmit for Verification
                      </button>
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

function NewPrForm({ supabase, eligibleProjects, suppliers, uoms, onCreated, onError }) {
  const [projectId, setProjectId] = useState(eligibleProjects[0]?.id || "");
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
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
  const canSubmit = projectId && supplierId && requestDate && requiredDate && requiredDateValid && itemsValid && drawingsValid && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data: prData, error: prError } = await supabase
      .from("purchase_requisitions")
      .insert({
        project_id: projectId,
        supplier_id: supplierId,
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
          {eligibleProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {suppliers.length === 0 ? (
          <div className="text-xs text-red-600 flex items-center">No suppliers set up yet.</div>
        ) : (
          <select className={input} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

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
      <button
        onClick={() => setItems([...items, blankItem()])}
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
