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
