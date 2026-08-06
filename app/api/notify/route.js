// Single endpoint for every workflow email. Kept server-side so the Resend
// API key never reaches the browser. The client sends an event type plus
// the PR id; this route re-reads the PR from the database itself rather
// than trusting whatever the client sends, and resolves recipients here.
import { createClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/email/send";
import {
  poIssuedEmail,
  rejectedEmail,
  deliveryEmail,
  postponedEmail,
  newUserEmail,
  cancelRequestedEmail,
  cancelPurchaserDecisionEmail,
  cancelAdminDecisionEmail,
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

// The requester and verifier "on" a PR for notification purposes: the
// specific people once they've acted, falling back to everyone holding that
// role on the project while the PR is still waiting on them.
async function requesterAndVerifierEmails(supabase, pr) {
  const requester = await emailsForIds(supabase, [pr.requester_id]);
  const verifier = pr.verified_by
    ? await emailsForIds(supabase, [pr.verified_by])
    : await emailsForRole(supabase, pr.project_id, "verifier");
  return Array.from(new Set([...requester, ...verifier]));
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
    .select("*, projects(name, code)")
    .eq("id", prId)
    .single();
  if (!pr) return Response.json({ error: "PR not found" }, { status: 404 });

  // Cancellation-request events have their own recipient logic (they involve
  // Admin/Purchasing at specific steps, not the standard workflow group).
  if (event === "cancel_requested") {
    const to = body.toPurchaser
      ? await emailsForRole(supabase, pr.project_id, "purchaser")
      : await adminEmails(supabase);
    const { subject, html } = cancelRequestedEmail(pr, body.reason, body.toPurchaser);
    await sendMail({ to, subject, html });
    return Response.json({ ok: true });
  }

  if (event === "cancel_purchaser_decision") {
    const base = await requesterAndVerifierEmails(supabase, pr);
    const to = body.canCancel ? Array.from(new Set([...base, ...(await adminEmails(supabase))])) : base;
    const { subject, html } = cancelPurchaserDecisionEmail(pr, body.canCancel);
    await sendMail({ to, subject, html });
    return Response.json({ ok: true });
  }

  if (event === "cancel_admin_decision") {
    const to = await requesterAndVerifierEmails(supabase, pr);
    const { subject, html } = cancelAdminDecisionEmail(pr, body.approved);
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
