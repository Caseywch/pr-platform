// Shared building blocks for the PR Board: statuses, dates, permissions and the
// On-time / Delay rules. Kept in one place so the Board, Dashboard and Delivery
// Schedule all judge timeliness the same way.

export const MAX_ITEMS = 5;

export const STATUS_META = {
  pending_verification: { label: "Pending Verification", color: "#A6791E" },
  rejected: { label: "Needs Revision", color: "#B23A2E" },
  pending_approval: { label: "Pending Approval", color: "#34456B" },
  pending_po: { label: "Approved — Pending PO", color: "#1F6B63" },
  po_issued: { label: "PO Issued — Awaiting Delivery", color: "#8A3B1F" },
  partial_delivery: { label: "Partial Delivery — Outstanding", color: "#9C6B14" },
  fulfilled: { label: "Fulfilled", color: "#3F7D4F" },
  cancelled: { label: "Cancelled", color: "#6B7280" },
};

export const btn = "text-sm px-3 py-1.5 rounded-md";
export const input = "border border-neutral-300 rounded-md px-3 py-2 text-sm";
export const card = "bg-white border border-neutral-200 rounded-lg p-5";

// Formats a Date using its local calendar day. Using toISOString() here would
// convert to UTC first, which in Malaysia (UTC+8) rolls the date back a day.
export function localDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function today() {
  return localDate(new Date());
}

export function blankItem() {
  return { itemNumber: "", description: "", sku: "", qty: "", uomId: "", remark: "" };
}

// Only people explicitly assigned to a role on this project may act.
// Administrators are the deliberate exception, so nothing can get stuck.
export function canActAs(allProjectRoles, projectId, role, userId, isAdmin) {
  if (isAdmin) return true;
  return allProjectRoles.some(
    (r) => r.project_id === projectId && r.role === role && r.user_id === userId
  );
}

export function projectHasRole(allProjectRoles, projectId, role) {
  return allProjectRoles.some((r) => r.project_id === projectId && r.role === role);
}

// Adds N working days (Mon–Fri), matching the Turnaround Times settings.
export function addWorkingDays(dateStr, days) {
  if (!dateStr || days == null) return null;
  const d = new Date(dateStr + "T00:00:00");
  let left = Number(days);
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return localDate(d);
}

// The date a delivery is judged against. A postponement records slippage but
// deliberately does NOT move this, so a late supplier still reads as Delayed.
export function benchmarkDate(pr) {
  return pr.new_delivery_date || pr.required_date || null;
}

// Where the PR sits on the Delivery Schedule: the date goods are actually
// expected, which is the latest promise made.
export function scheduleDate(pr) {
  return pr.postponed_delivery_date || pr.new_delivery_date || pr.required_date || null;
}

// While a PR is still being processed, it's measured against the Turnaround
// Times for whichever stage it's sitting in.
function stageDueDate(pr, sla) {
  switch (pr.status) {
    case "pending_verification":
      return addWorkingDays(pr.request_date, sla?.verify_days);
    case "pending_approval":
      return addWorkingDays(pr.verified_date, sla?.approve_days);
    case "pending_po":
      return addWorkingDays(pr.approved_date, sla?.po_days);
    default:
      return null;
  }
}

// Returns "ontime", "delay", or null when timeliness doesn't apply.
export function timeliness(pr, sla) {
  if (pr.status === "cancelled") return null;

  if (pr.status === "fulfilled") {
    const bench = benchmarkDate(pr);
    if (!bench || !pr.fulfilled_date) return "ontime";
    return pr.fulfilled_date > bench ? "delay" : "ontime";
  }

  if (pr.status === "po_issued" || pr.status === "partial_delivery") {
    const bench = benchmarkDate(pr);
    return bench && today() > bench ? "delay" : "ontime";
  }

  const due = stageDueDate(pr, sla);
  return due && today() > due ? "delay" : "ontime";
}

export function timelinessMeta(value) {
  if (value === "delay") return { label: "Delay", color: "#B23A2E" };
  if (value === "ontime") return { label: "On-time", color: "#34456B" };
  return null;
}

// Loose match so "Max World" and "maxworld sdn bhd" are flagged as likely dupes.
export function findSimilarSupplier(suppliers, typed) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const t = norm(typed);
  if (!t) return null;
  return (
    suppliers.find((s) => {
      const n = norm(s.name);
      return n === t || n.includes(t) || t.includes(n);
    }) || null
  );
}

// Which requisitions are waiting on a particular person right now.
// Administrators can technically act on anything, but that would make their
// list meaningless — so this only counts roles they are actually assigned to.
export function pendingActionsFor(prs, profile, allProjectRoles, cancelRequests = []) {
  if (!profile) return [];
  const hasRole = (projectId, role) =>
    allProjectRoles.some(
      (r) => r.project_id === projectId && r.role === role && r.user_id === profile.id
    );

  return prs.filter((pr) => {
    // A PR with a pending cancellation request is frozen — it belongs in
    // whoever owns that decision's queue, not the normal workflow queue.
    if (isLockedByCancelRequest(cancelRequests, pr.id)) return false;

    switch (pr.status) {
      case "pending_verification":
        return hasRole(pr.project_id, "verifier");
      case "pending_approval":
        return hasRole(pr.project_id, "approver");
      case "pending_po":
      case "po_issued":
      case "partial_delivery":
        return hasRole(pr.project_id, "purchaser");
      case "rejected":
        return pr.requester_id === profile.id;
      default:
        return false;
    }
  });
}

// What the person is actually being asked to do, for display.
export function actionLabelFor(pr) {
  switch (pr.status) {
    case "pending_verification":
      return "Verify";
    case "pending_approval":
      return "Approve";
    case "pending_po":
      return "Issue PO";
    case "po_issued":
    case "partial_delivery":
      return "Log delivery";
    case "rejected":
      return "Amend and resubmit";
    default:
      return "";
  }
}

// --- Cancellation requests -------------------------------------------------
// A lightweight approval layered on top of the existing direct-cancel (which
// Admin still uses unchanged). While a request is pending, the PR is locked:
// no other workflow action can proceed, and it carries a visible badge.

export function activeCancelRequest(cancelRequests, prId) {
  return (cancelRequests || []).find(
    (r) => r.pr_id === prId && (r.status === "pending_purchaser" || r.status === "pending_admin")
  );
}

export function isLockedByCancelRequest(cancelRequests, prId) {
  return !!activeCancelRequest(cancelRequests, prId);
}

export function activeChangeRequest(changeRequests, prId) {
  return (changeRequests || []).find((r) => r.pr_id === prId && r.status === "pending");
}

// Names of whoever is actually being waited on for a PR's current status —
// shown next to the status badge so "Pending Verification" reads as
// "Pending Verification — Chee Hong" rather than leaving the reader to guess
// who that is. Covers every status that's genuinely waiting on someone
// (Verification, Approval, Issue PO, Log delivery, and Needs Revision —
// which waits on the Requester specifically, not a project role); returns ""
// for anything else (fulfilled, cancelled — nobody's holding those up).
// If nobody currently holds the relevant role on the project, returns ""
// rather than showing an empty dash.
export function assignedNamesFor(pr, allProjectRoles) {
  // Needs Revision waits on the Requester, not a project-assigned role — the
  // name comes from the PR's own requester join, not allProjectRoles.
  if (pr.status === "rejected") {
    return pr.requester?.name || "";
  }

  const roleForStatus = {
    pending_verification: "verifier",
    pending_approval: "approver",
    pending_po: "purchaser",
    po_issued: "purchaser",
    partial_delivery: "purchaser",
  }[pr.status];
  if (!roleForStatus) return "";

  const names = (allProjectRoles || [])
    .filter((r) => r.project_id === pr.project_id && r.role === roleForStatus)
    .map((r) => r.profiles?.name)
    .filter(Boolean);
  return names.join(", ");
}

// Cancellation requests waiting on a specific person, folded into the same
// shape as a normal pending action so they can sit alongside Verify/Approve/
// etc. in My Actions without a separate list.
export function pendingCancelRequestsFor(cancelRequests, prs, profile) {
  if (!profile) return [];
  return (cancelRequests || [])
    .filter((r) => {
      if (r.status === "pending_purchaser") return !!profile.is_purchasing || profile.is_admin;
      if (r.status === "pending_admin") return !!profile.is_admin;
      return false;
    })
    .map((r) => {
      const pr = prs.find((p) => p.id === r.pr_id);
      return pr ? { ...pr, _cancelRequest: r } : null;
    })
    .filter(Boolean);
}

export function cancelRequestActionLabel(request) {
  if (request.status === "pending_purchaser") return "Confirm PO can be cancelled";
  if (request.status === "pending_admin") return "Approve cancellation";
  return "";
}

// Detects text that's (mostly) ALL CAPS and converts it to simple sentence
// case: first letter of each sentence capitalised, everything else
// lowercase. Deliberately simple — it won't preserve acronyms or brand
// names correctly, which is a known, accepted limitation for the first
// version (see Parked Item 7). Only triggers on genuinely-caps input, so
// normal mixed-case typing is left completely alone.
export function autoCorrectAllCaps(text) {
  if (!text) return text;
  const letters = text.replace(/[^a-zA-Z]/g, "");
  // Nothing to judge (no letters at all, e.g. pure numbers/punctuation) —
  // leave it as-is rather than guessing.
  if (letters.length === 0) return text;
  const isAllCaps = letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  if (!isAllCaps) return text;

  const lower = text.toLowerCase();
  // Capitalise the first letter of the string and of anything following
  // sentence-ending punctuation (. ! ?) plus following whitespace.
  return lower.replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (match) => match.toUpperCase());
}
