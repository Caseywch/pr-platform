// Runs on working days (see vercel.json) and emails anyone with an overdue
// item in their queue. Reuses the exact same "what's pending, for whom,
// is it overdue" logic that drives My Actions and the Dashboard, so this
// can never disagree with what those screens show.
import { createClient } from "@supabase/supabase-js";
import { pendingActionsFor, timeliness, actionLabelFor, benchmarkDate } from "@/app/board/prHelpers";
import { sendMail } from "@/lib/email/send";
import { overdueReminderEmail } from "@/lib/email/templates";

export async function GET(request) {
  // Vercel signs cron requests with this header; reject anything else so
  // the endpoint can't be triggered by a stray outside request.
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const [prsRes, profilesRes, rolesRes, slaRes] = await Promise.all([
    supabase
      .from("purchase_requisitions")
      .select("*, projects(name, code), suppliers(name), requester:profiles!requester_id(name)"),
    supabase.from("profiles").select("id, name, email, is_admin, is_purchasing").eq("is_active", true),
    supabase.from("project_roles").select("project_id, user_id, role"),
    supabase.from("sla_settings").select("*").eq("id", 1).single(),
  ]);

  const prs = prsRes.data || [];
  const profiles = profilesRes.data || [];
  const roles = rolesRes.data || [];
  const sla = slaRes.data || { verify_days: 0, approve_days: 0, po_days: 0 };

  // Surface any query failure instead of silently treating it as "nobody to
  // notify" — a misconfigured key should be loud, not look like success.
  const queryErrors = [prsRes.error, profilesRes.error, rolesRes.error, slaRes.error]
    .filter(Boolean)
    .map((e) => e.message);
  if (queryErrors.length > 0) {
    await supabase.from("cron_run_log").insert({
      job_name: "reminders",
      checked_count: 0,
      sent_count: 0,
      error: queryErrors.join("; "),
    });
    return Response.json({ ok: false, errors: queryErrors }, { status: 500 });
  }

  let sent = 0;
  for (const person of profiles) {
    if (!person.email) continue;

    const overdue = pendingActionsFor(prs, person, roles).filter(
      (pr) => timeliness(pr, sla) === "delay"
    );
    if (overdue.length === 0) continue;

    const items = overdue.map((pr) => ({
      id: pr.id,
      pr_number: pr.pr_number,
      action: actionLabelFor(pr),
      dueLabel: benchmarkDate(pr) || pr.request_date,
      project: pr.projects?.name ? `${pr.projects.name}${pr.projects.code ? ` (${pr.projects.code})` : ""}` : null,
      supplier: pr.suppliers?.name || null,
    }));

    const { subject, html } = overdueReminderEmail(person.name, items);
    await sendMail({ to: person.email, subject, html });
    sent++;
  }

  // A visible, permanent record of this run — the only reliable way to
  // confirm the schedule is actually firing, since Vercel's own log
  // retention on the Hobby plan doesn't reach back far enough to check
  // this any other way after the fact.
  await supabase.from("cron_run_log").insert({
    job_name: "reminders",
    checked_count: profiles.length,
    sent_count: sent,
  });

  return Response.json({ ok: true, checked: profiles.length, sent });
}
