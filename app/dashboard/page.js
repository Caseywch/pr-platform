import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "./Dashboard";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profileRes, prsRes, slaRes] = await Promise.all([
    supabase.from("profiles").select("id, name, is_admin, is_purchasing").eq("id", user.id).single(),
    supabase
      .from("purchase_requisitions")
      .select("*, projects(name), suppliers(name), requester:profiles!requester_id(name)")
      .order("created_at", { ascending: false }),
    supabase.from("sla_settings").select("*").eq("id", 1).single(),
  ]);

  return (
    <Dashboard
      profile={profileRes.data}
      prs={prsRes.data || []}
      sla={slaRes.data || { verify_days: 0, approve_days: 0, po_days: 0 }}
    />
  );
}
