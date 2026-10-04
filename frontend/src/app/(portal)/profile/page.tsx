"use client";

import { useState } from "react";
import ProfileForm from "@/components/ProfileForm";
import { PageHeader } from "@/components/ui";

export default function ProfilePage() {
  const [saved, setSaved] = useState(false);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My profile" subtitle="Keep your semester and details up to date." />
      {saved && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Profile saved.</div>}
      <div className="card p-6">
        <ProfileForm submitLabel="Save changes" onSaved={() => setSaved(true)} />
      </div>
    </div>
  );
}
