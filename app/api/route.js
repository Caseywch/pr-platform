// Single endpoint for every workflow email. Kept server-side so the Resend
// API key never reaches the browser. The client sends an event type plus
// the PR id; this route re-reads the PR from the database itself rather
// than trusting whatever the client sends, and resolves recipients here.
import { createClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/email/send";
import { buildChangeRequestDiff } from "@/app/board/prHelpers";
import {
  poIssuedEmail,
  rejectedEmail,
  deliveryEmail,
  postponedEmail,
  newUserEmail,
  cancelRequestedEmail,
  cancelPurchaserDecisionEmail,
  cancelAdminDecisionEmail,
  prEditedEmail,
  prChangeRequestedEmail,
  prChangeDecisionEmail,
} from "@/lib/email/templates";

async function emailsForRole(supabase, projectId, role) {
  const { data: roles } = await supabase
    .from("project_roles")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("role", role);
  const ids = (roles || []).map((r) => r.user_id);
  if (ids.length === 0) return [];
  const { data } = await supabase.from("profiles").select("email").in("id", ids);
  return (data || []).map((p) => p.email).filter(Boolean);
}

async function emailsForIds(supabase, ids) {
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (clean.length === 0) return [];
  const { data } = await supabase.from("profiles").select("email").in("id", clean);
  return (data || []).map((p) => p.email).filter(Boolean);
}

async function adminEmails(supabase) {
  const { data } = await supabase.from("profiles").select("email").eq("is_admin", true);
  return (data || []).map((p) => p.email).filter(Boolean);
}

async function recipientsFor(supabase, pr) {
  // Requester, Verifier, Approver and Purchasing all receive workflow
  // updates, per the agreed scope. Purchasing is now a per-project role (see
  // Role Assignments), so this looks up who actually holds it on THIS PR's
  // project rather than a company-wide flag.
  const direct = await emailsForIds(supabase, [pr.requester_id, pr.verified_by, pr.approved_by]);
  const purchasers = await emailsForRole(supabase, pr.project_id, "purchaser");
  return Array.from(new Set([...direct, ...purchasers]));
}

// For the pre-PO direct-edit notification: whoever verified and/or approved
// this PR (specific person if that stage has happened, else everyone
// currently holding that role on the project). The Requester themselves is
// NOT included here — they're the one making the edit, not a recipient.
async function verifierAndApproverEmails(supabase, pr) {
  const verifier = pr.verified_by
    ? await emailsForIds(supabase, [pr.verified_by])
    : await emailsForRole(supabase, pr.project_id, "verifier");
  const approver = pr.approved_by
    ? await emailsForIds(supabase, [pr.approved_by])
    : await emailsForRole(supabase, pr.project_id, "approver");
  return Array.from(new Set([...verifier, ...approver]));
}

// For the change-request decision: Requester (they proposed it, they need
// the outcome) plus Verifier and Approver, same specific-person-else-role
// pattern used throughout.
async function requesterVerifierApproverEmails(supabase, pr) {
  const requester = await emailsForIds(supabase, [pr.requester_id]);
  const verifierApprover = await verifierAndApproverEmails(supabase, pr);
  return Array.from(new Set([...requester, ...verifierApprover]));
}

// The 4 people named in Parked Item 14, added consistently to all 3
// cancellation-request emails: Requester, the SPECIFIC Verifier who
// verified (skipped, not role-fallback, if not yet verified), the SPECIFIC
// Approver who approved (skipped if not yet approved), and the SPECIFIC
// Purchaser who issued the PO (skipped if no PO issued yet). This is
// deliberately different from verifierAndApproverEmails, which falls back
// to "everyone with that role" — here we skip entirely instead, per the
// explicit spec ("no fallback to everyone with that role").
async function cancellationNamedRecipients(supabase, pr) {
  const ids = [pr.requester_id, pr.verified_by, pr.approved_by, pr.po_issued_by].filter(Boolean);
  return emailsForIds(supabase, ids);
}

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json();
  const { event, prId } = body;

  // New-user emails don't have a PR to look up.
  if (event === "new_user") {
    const { name, email, pin } = body;
    const { subject, html } = newUserEmail(name, email, pin);
    await sendMail({ to: email, subject, html });
    return Response.json({ ok: true });
  }

  const { data: pr } = await supabase
    .from("purchase_requisitions")
    .select("*, projects(name, code), suppliers(name)")
    .eq("id", prId)
    .single();
  if (!pr) return Response.json({ error: "PR not found" }, { status: 404 });

  // Cancellation-request events have their own recipient logic (they involve
  // Admin/Purchasing at specific steps, not the standard workflow group).
  // All three ALSO include the 4 named people from cancellationNamedRecipients
  // (Requester, specific Verifier/Approver/PO-issuer), added consistently
  // across all 3 steps per Parked Item 14 — in addition to, not instead of,
  // the existing action-recipients below.
  if (event === "cancel_requested") {
    const action = body.toPurchaser
      ? await emailsForRole(supabase, pr.project_id, "purchaser")
      : await adminEmails(supabase);
    const named = await cancellationNamedRecipients(supabase, pr);
    const to = Array.from(new Set([...action, ...named]));
    const { subject, html } = cancelRequestedEmail(pr, body.reason, body.toPurchaser);
    await sendMail({ to, subject, html });
    return Response.json({ ok: true });
  }

  if (event === "cancel_purchaser_decision") {
    const named = await cancellationNamedRecipients(supabase, pr);
    const action = body.canCancel ? await adminEmails(supabase) : [];
    const to = Array.from(new Set([...named, ...action]));
    const { subject, html } = cancelPurchaserDecisionEmail(pr, body.canCancel);
    await sendMail({ to, subject, html });
    return Response.json({ ok: true });
  }

  if (event === "cancel_admin_decision") {
    const to = await cancellationNamedRecipients(supabase, pr);
    const { subject, html } = cancelAdminDecisionEmail(pr, body.approved);
    await sendMail({ to, subject, html });
    return Response.json({ ok: true });
  }

  // Requester directly edited a pre-PO PR. Only Verifier/Approver need to
  // know (not the Requester themselves, since they're the one who acted).
  // If neither stage has happened yet, this resolves to nobody and no email
  // is sent — matches "if it had already reached that stage".
  if (event === "pr_edited") {
    const to = await verifierAndApproverEmails(supabase, pr);
    if (to.length > 0) {
      const { subject, html } = prEditedEmail(pr);
      await sendMail({ to, subject, html });
    }
    return Response.json({ ok: true });
  }

  // A Requester just proposed a change on a post-PO PR. Purchasing is the
  // one who needs to act (check with the supplier, then approve/reject),
  // same recipient shape as cancel_requested's toPurchaser branch. The
  // email needs the actual before/after values, not just field names, so
  // this fetches the change-request row itself plus the project/supplier/
  // uom names it references (old and new may differ) and hands them to
  // buildChangeRequestDiff — the same function the Purchasing review UI
  // uses, so the email and the in-app view never disagree on what changed.
  if (event === "pr_change_requested") {
    const { data: changeRequest } = await supabase
      .from("pr_change_requests")
      .select("*")
      .eq("pr_id", prId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (changeRequest) {
      const referencedProjectIds = [changeRequest.old_project_id, changeRequest.new_project_id].filter(Boolean);
      const referencedSupplierIds = [changeRequest.old_supplier_id, changeRequest.new_supplier_id].filter(Boolean);
      const referencedUomIds = Array.from(new Set(
        [...(changeRequest.old_items || []), ...(changeRequest.new_items || [])]
          .map((i) => i.uom_id)
          .filter(Boolean)
      ));
      const [{ data: projectRows }, { data: supplierRows }, { data: uomRows }] = await Promise.all([
        referencedProjectIds.length > 0
          ? supabase.from("projects").select("id, name").in("id", referencedProjectIds)
          : { data: [] },
        referencedSupplierIds.length > 0
          ? supabase.from("suppliers").select("id, name").in("id", referencedSupplierIds)
          : { data: [] },
        referencedUomIds.length > 0
          ? supabase.from("uoms").select("id, name").in("id", referencedUomIds)
          : { data: [] },
      ]);
      const lookups = {
        projects: Object.fromEntries((projectRows || []).map((p) => [p.id, p.name])),
        suppliers: Object.fromEntries((supplierRows || []).map((s) => [s.id, s.name])),
        uoms: Object.fromEntries((uomRows || []).map((u) => [u.id, u.name])),
      };
      const diff = buildChangeRequestDiff(changeRequest, lookups);
      const action = await emailsForRole(supabase, pr.project_id, "purchaser");
      if (action.length > 0) {
        const { subject, html } = prChangeRequestedEmail(pr, diff);
        await sendMail({ to: action, subject, html });
      }
    }
    return Response.json({ ok: true });
  }

  if (event === "pr_change_decision") {
    const to = await requesterVerifierApproverEmails(supabase, pr);
    const { subject, html } = prChangeDecisionEmail(pr, body.approved, body.reason);
    await sendMail({ to, subject, html });
    return Response.json({ ok: true });
  }

  const to = await recipientsFor(supabase, pr);

  let payload;
  if (event === "po_issued") {
    payload = poIssuedEmail(pr);
  } else if (event === "rejected") {
    payload = rejectedEmail(pr, body.reason || pr.rejection_reason);
  } else if (event === "delivery") {
    payload = deliveryEmail(pr, body.delivery);
  } else if (event === "postponed") {
    payload = postponedEmail(pr, body.newDate, body.reason);
  } else {
    return Response.json({ error: "Unknown event" }, { status: 400 });
  }

  await sendMail({ to, subject: payload.subject, html: payload.html });
  return Response.json({ ok: true });
}
