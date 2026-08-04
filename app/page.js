import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";
import Logo from "./Logo";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, is_admin, is_purchasing")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-neutral-50 px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <Logo height={40} />
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-600">Purchase Requisition Platform</div>
              <h1 className="text-2xl font-bold mt-0.5">Welcome, {profile?.name || user.email}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <a href="/board" className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 text-white">Go to Board</a>
            {profile?.is_admin && (
              <a href="/admin" className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 text-white">Admin Setup</a>
            )}
            <SignOutButton />
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-lg p-5">
          <div className="text-sm text-neutral-600 mb-2">
            You're signed in and connected to the real database. This confirms:
          </div>
          <ul className="text-sm text-neutral-700 list-disc pl-5 space-y-1">
            <li>Authentication works (Supabase Auth)</li>
            <li>Your profile row was created automatically on sign-up</li>
            <li>The app can read from the real Postgres database</li>
          </ul>
          {profile?.is_admin && (
            <div className="mt-4 text-xs px-3 py-2 rounded-md bg-emerald-50 text-emerald-700">
              You're marked as Administrator.
            </div>
          )}
          {!profile?.is_admin && (
            <div className="mt-4 text-xs px-3 py-2 rounded-md bg-amber-50 text-amber-700">
              You're not an Administrator yet. In Supabase → Table Editor → profiles, set is_admin to true on your row.
            </div>
          )}
        </div>

        <div className="text-xs text-neutral-600 mt-6">
          {profile?.is_admin
            ? "Head to Admin Setup above to configure Projects, Suppliers, UOMs, roles, and SLA."
            : "Next: the Purchase Requisition workflow gets built here."}
        </div>
      </div>
    </div>
  );
}
