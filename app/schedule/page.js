import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Schedule from "./Schedule";

export default async function SchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profileRes, prsRes, slaRes] = await Promise.all([
    supabase.from("profiles").select("id, name, is_admin, is_purchasing").eq("id", user.id).single(),
    // Only requisitions actually awaiting goods belong on a delivery schedule.
    supabase
      .from("purchase_requisitions")
      .select("*, projects(name), suppliers(name)")
      .in("status", ["po_issued", "partial_delivery"]),
    supabase.from("sla_settings").select("*").eq("id", 1).single(),
  ]);

  return (
    <Schedule
      profile={profileRes.data}
      prs={prsRes.data || []}
      sla={slaRes.data || { verify_days: 0, approve_days: 0, po_days: 0 }}
    />
  );
}
