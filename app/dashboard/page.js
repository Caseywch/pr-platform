import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "./Dashboard";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profileRes, prsRes, slaRes, allProfilesRes, rolesRes] = await Promise.all([
    supabase.from("profiles").select("id, name, is_admin, is_purchasing").eq("id", user.id).single(),
    supabase
      .from("purchase_requisitions")
      .select("*, projects(name), suppliers(name), requester:profiles!requester_id(name)")
      .order("created_at", { ascending: false }),
    supabase.from("sla_settings").select("*").eq("id", 1).single(),
    // Needed for the "Group by User" view: it groups PRs by who currently
    // owes an action, which means checking every user's role assignments,
    // not just the person viewing the page.
    supabase.from("profiles").select("id, name, is_admin, is_purchasing").eq("is_active", true),
    supabase.from("project_roles").select("project_id, user_id, role"),
  ]);

  return (
    <Dashboard
      profile={profileRes.data}
      prs={prsRes.data || []}
      sla={slaRes.data || { verify_days: 0, approve_days: 0, po_days: 0 }}
      allProfiles={allProfilesRes.data || []}
      allProjectRoles={rolesRes.data || []}
    />
  );
}
