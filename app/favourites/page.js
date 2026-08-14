import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Favourites from "./Favourites";

export default async function FavouritesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profileRes, favRes, rolesRes, slaRes, cancelRequestsRes] = await Promise.all([
    supabase.from("profiles").select("id, name, is_admin, is_purchasing").eq("id", user.id).single(),
    supabase
      .from("pr_favourites")
      .select("pr_id, created_at, purchase_requisitions(*, projects(name, code), suppliers(name), requester:profiles!requester_id(name))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("project_roles").select("project_id, user_id, role"),
    supabase.from("sla_settings").select("*").eq("id", 1).single(),
    supabase.from("pr_cancellation_requests").select("*").in("status", ["pending_purchaser", "pending_admin"]),
  ]);

  // Flatten the join and drop any favourite whose underlying PR no longer
  // exists (shouldn't happen due to the ON DELETE CASCADE, but stay safe).
  const favouritePrs = (favRes.data || [])
    .map((row) => row.purchase_requisitions)
    .filter(Boolean);

  return (
    <Favourites
      profile={profileRes.data}
      prs={favouritePrs}
      allProjectRoles={rolesRes.data || []}
      sla={slaRes.data || { verify_days: 0, approve_days: 0, po_days: 0 }}
      cancelRequests={cancelRequestsRes.data || []}
    />
  );
}
