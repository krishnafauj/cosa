"use client";

import clsx from "clsx";
import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { BRANCHES, type Me } from "@/lib/types";
import { Avatar, ErrorBox, Spinner } from "./ui";

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];
const thisYear = new Date().getFullYear();
const BATCH_YEARS = Array.from({ length: 6 }, (_, i) => thisYear - i);

/** Student profile: used for first-login onboarding and the "My profile" page. */
export default function ProfileForm({ submitLabel, onSaved }: { submitLabel: string; onSaved?: (me: Me) => void }) {
  const { user, reload } = useAuth();
  const [form, setForm] = useState({
    full_name: user?.full_name ?? "",
    roll_number: user?.roll_number ?? "",
    branch: user?.branch ?? "",
    batch_year: user?.batch_year ? String(user.batch_year) : "",
    semester: user?.semester ? String(user.semester) : "",
    about: user?.about ?? "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  if (!user) return null;
  const isStudent = user.user_type === "STUDENT";
  const rollLocked = Boolean(user.roll_number) && /^[a-z]{2}\d{2}[a-z]\d+@iiitr\.ac\.in$/i.test(user.email);
  const hasPhoto = user.has_photo || (!isStudent && Boolean(user.avatar_url));
  const photoMissing = isStudent && !photo && !user.has_photo;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (photoMissing) {
      setError(new Error("Please add a profile photo."));
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("full_name", form.full_name);
      if (!rollLocked) fd.set("roll_number", form.roll_number);
      if (isStudent) {
        fd.set("branch", form.branch);
        fd.set("batch_year", form.batch_year);
        fd.set("semester", form.semester);
      }
      fd.set("about", form.about);
      if (photo) fd.set("photo", photo);
      const me = await api<Me>("/api/auth/me/", { method: "PATCH", body: fd });
      await reload();
      onSaved?.(me);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  const sem = Number(form.semester);
  return (
    <form onSubmit={submit} className="space-y-6">
      <ErrorBox error={error} />

      {/* Photo */}
      <div className="flex items-center gap-5">
        <label className="group relative cursor-pointer">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="New profile photo" className="h-24 w-24 rounded-full object-cover ring-4 ring-brand-100" />
          ) : hasPhoto ? (
            <span className="block [&>*]:!h-24 [&>*]:!w-24 [&>*]:!text-2xl">
              <Avatar user={user} size="lg" />
            </span>
          ) : (
            <span
              className={clsx(
                "flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed bg-slate-50 text-slate-400",
                photoMissing && error ? "border-rose-400" : "border-slate-300",
              )}
            >
              <Camera className="h-7 w-7" />
            </span>
          )}
          <span className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full bg-brand-800 text-white shadow ring-2 ring-white group-hover:bg-brand-900">
            <Camera className="h-4 w-4" />
          </span>
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
        <div className="text-sm">
          <p className="font-medium text-slate-900">Profile photo {isStudent && <span className="text-rose-600">*</span>}</p>
          <p className="text-slate-500">A clear photo of your face, JPG or PNG, under 2 MB.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="pf-name">Full name <span className="text-rose-600">*</span></label>
          <input id="pf-name" className="input" required maxLength={150} value={form.full_name} onChange={set("full_name")} />
        </div>
        <div>
          <label className="label" htmlFor="pf-email">College email</label>
          <input id="pf-email" className="input bg-slate-50 text-slate-500" value={user.email} disabled />
        </div>
        {isStudent && (
          <div>
            <label className="label" htmlFor="pf-roll">Roll number <span className="text-rose-600">*</span></label>
            <input
              id="pf-roll"
              className={clsx("input uppercase", rollLocked && "bg-slate-50 text-slate-500")}
              required
              disabled={rollLocked}
              value={form.roll_number}
              onChange={set("roll_number")}
            />
          </div>
        )}
      </div>

      {isStudent && (
        <div className="space-y-4">
          <div>
            <span className="label">Branch <span className="text-rose-600">*</span></span>
            <div className="grid gap-2 sm:grid-cols-3">
              {BRANCHES.map((b) => (
                <label
                  key={b.value}
                  className={clsx(
                    "flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition",
                    form.branch === b.value ? "border-brand-500 bg-brand-50 text-brand-900" : "border-slate-200 text-slate-700 hover:border-slate-300",
                  )}
                >
                  <input
                    type="radio"
                    name="branch"
                    value={b.value}
                    required
                    checked={form.branch === b.value}
                    onChange={set("branch")}
                    className="mt-0.5 accent-brand-800"
                  />
                  {b.label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pf-batch">Batch (year of joining) <span className="text-rose-600">*</span></label>
              <select id="pf-batch" className="input" required value={form.batch_year} onChange={set("batch_year")}>
                <option value="">Select batch</option>
                {BATCH_YEARS.map((y) => (
                  <option key={y} value={y}>{y} – {y + 4}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="pf-sem">Current semester <span className="text-rose-600">*</span></label>
              <select id="pf-sem" className="input" required value={form.semester} onChange={set("semester")}>
                <option value="">Select semester</option>
                {Array.from({ length: 8 }, (_, i) => i + 1).map((s) => (
                  <option key={s} value={s}>Semester {s}</option>
                ))}
              </select>
              {sem > 0 && <p className="mt-1 text-xs text-slate-500">{ORDINAL[Math.ceil(sem / 2)]} year</p>}
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="pf-about">About you <span className="font-normal text-slate-400">(optional)</span></label>
        <textarea
          id="pf-about"
          className="input min-h-24"
          maxLength={500}
          value={form.about}
          onChange={set("about")}
          placeholder="Clubs you're part of, interests, what you'd like to help with…"
        />
        <p className="mt-1 text-right text-xs text-slate-400">{form.about.length}/500</p>
      </div>

      <button className="btn-primary w-full sm:w-auto" disabled={saving}>
        {saving && <Spinner className="h-4 w-4 text-white" />} {submitLabel}
      </button>
    </form>
  );
}
