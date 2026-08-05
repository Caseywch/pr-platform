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
        <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <Logo height={40} />
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-600">Purchase Requisition Platform</div>
              <h1 className="text-2xl font-bold mt-0.5">Welcome, {profile?.name || user.email}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:ml-[52px]">
            <a href="/board" className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 text-white">Go to Board</a>
            {profile?.is_admin && (
              <a href="/admin" className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 text-white">Admin Setup</a>
            )}
            <SignOutButton />
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-lg p-5">
          <div className="text-sm text-neutral-700">
            Welcome to the Federal Furniture (1982) Sdn Bhd Purchase Requisition Platform. This platform
            is proprietary to the company and intended solely for authorised personnel. Access
            credentials are issued individually and must not be shared. Should you forget your PIN,
            please contact your Administrator for assistance.
          </div>
        </div>
      </div>
    </div>
  );
}
