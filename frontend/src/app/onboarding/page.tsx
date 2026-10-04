"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import ProfileForm from "@/components/ProfileForm";
import { PageLoader } from "@/components/ui";
import { useAuth } from "@/lib/auth";

/** First login: students fill in their profile before using the portal. */
export default function OnboardingPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.profile_complete) router.replace("/board");
  }, [loading, user, router]);

  if (loading || !user || user.profile_complete) return <PageLoader />;

  return (
    <div className="min-h-screen bg-[#f5f6fa]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/iiitr-logo.png" alt="IIIT Raichur" className="h-10 w-auto" />
          <button onClick={logout} className="btn-ghost text-sm">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-xs font-semibold tracking-[0.2em] text-brand-600 uppercase">Welcome to the COSA Portal</p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-900">Set up your student profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          This is a one-time step. COSA uses these details when you raise issues or apply to committees.
        </p>
        <div className="card mt-6 p-6">
          <ProfileForm submitLabel="Save and continue" onSaved={() => router.replace("/board")} />
        </div>
      </main>
    </div>
  );
}
