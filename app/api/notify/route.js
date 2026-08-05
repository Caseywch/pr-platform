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
} from "@/lib/email/templates";

async function recipientsFor(supabase, pr) {
  // Requester, Verifier, Approver and Purchasing all receive workflow
  // updates, per the agreed scope. Purchasing is company-wide, so every
  // Purchasing-flagged user is included rather than one specific person.
  const ids = new Set([pr.requester_id, pr.verified_by, pr.approved_by].filter(Boolean));
  const emails = [];

  if (ids.size > 0) {
    const { data } = await supabase.from("profiles").select("email").in("id", Array.from(ids));
    (data || []).forEach((p) => p.email && emails.push(p.email));
  }

  const { data: purchasing } = await supabase.from("profiles").select("email").eq("is_purchasing", true);
  (purchasing || []).forEach((p) => p.email && emails.push(p.email));

  return Array.from(new Set(emails));
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
    .select("*")
    .eq("id", prId)
    .single();
  if (!pr) return Response.json({ error: "PR not found" }, { status: 404 });

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
