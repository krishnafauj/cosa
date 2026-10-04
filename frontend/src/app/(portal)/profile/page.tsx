"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import ProfileForm from "@/components/ProfileForm";

/** Same look as the first-login form, inside the portal. */
export default function ProfilePage() {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold tracking-[0.2em] text-brand-600 uppercase">Your account</p>
      <h1 className="mt-2 text-2xl font-semibold text-brand-900">My profile</h1>
      <p className="mt-1 text-sm text-slate-500">
        Keep your semester and details up to date. COSA sees these when you raise issues or apply to committees.
      </p>
      {savedAt && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Profile saved at {savedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}.
        </div>
      )}
      <div className="card mt-6 p-6">
        <ProfileForm submitLabel="Save changes" onSaved={() => setSavedAt(new Date())} />
      </div>
    </div>
  );
}
