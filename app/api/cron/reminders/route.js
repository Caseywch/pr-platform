// Runs once a day (see vercel.json) and emails anyone with an overdue
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
    }));

    const { subject, html } = overdueReminderEmail(person.name, items);
    await sendMail({ to: person.email, subject, html });
    sent++;
  }

  return Response.json({ ok: true, checked: profiles.length, sent });
}
