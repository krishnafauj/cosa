"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { CalendarDays, Clock, ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { CampusEvent, Club } from "@/lib/types";
import { ErrorBox, Modal, Spinner } from "./ui";

const PHASE_CHIP: Record<CampusEvent["phase"], string> = {
  UPCOMING: "bg-brand-100 text-brand-800",
  ONGOING: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-slate-100 text-slate-600",
  CANCELLED: "bg-rose-100 text-rose-700",
};

export function EventCard({ event, onCancel }: { event: CampusEvent; onCancel?: () => void }) {
  const start = new Date(event.starts_at);
  return (
    <article className={clsx("card flex overflow-hidden", event.phase === "CANCELLED" && "opacity-70")}>
      <div className="flex w-20 shrink-0 flex-col items-center justify-center bg-brand-800 py-4 text-white">
        <span className="text-xs font-medium tracking-wide text-brand-200 uppercase">{start.toLocaleDateString("en-IN", { month: "short" })}</span>
        <span className="text-3xl leading-none font-semibold">{start.getDate()}</span>
        <span className="mt-1 text-xs text-brand-200">{start.toLocaleDateString("en-IN", { weekday: "short" })}</span>
      </div>
      <div className="min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx("chip", PHASE_CHIP[event.phase])}>{event.phase.toLowerCase()}</span>
          <span className="text-xs font-medium text-brand-700">{event.club_name || event.organising_body}</span>
        </div>
        <h3 className="mt-1.5 font-semibold text-slate-900">{event.title}</h3>
        {event.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{event.description}</p>}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDateTime(event.starts_at)}</span>
          {event.venue && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {event.venue}</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {event.registration_url && event.phase !== "CANCELLED" && (
            <a href={event.registration_url} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-1.5 text-xs">
              Register <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {event.can_edit && onCancel && event.phase === "UPCOMING" && (
            <button onClick={onCancel} className="btn-ghost px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50">Cancel event</button>
          )}
        </div>
      </div>
      {event.poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.poster} alt="" className="hidden w-32 object-cover sm:block" />
      )}
    </article>
  );
}

export function EventForm({ clubs, onClose, defaultClub }: { clubs: Club[]; onClose: () => void; defaultClub?: number }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "",
    club: defaultClub ? String(defaultClub) : "",
    organising_body: "",
    description: "",
    venue: "",
    starts_at: "",
    ends_at: "",
    registration_url: "",
  });
  const [poster, setPoster] = useState<File | null>(null);

  const m = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (!v) return;
        fd.set(k, k === "starts_at" || k === "ends_at" ? new Date(v).toISOString() : v);
      });
      if (poster) fd.set("poster", poster);
      return api("/api/cosa/events/", { method: "POST", body: fd });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["clubs"] });
      onClose();
    },
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal open onClose={onClose} title="Create an event" wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <ErrorBox error={m.error} />
        <div>
          <label className="label" htmlFor="ev-title">Title</label>
          <input id="ev-title" className="input" required maxLength={150} value={form.title} onChange={set("title")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ev-club">Club</label>
            <select id="ev-club" className="input" value={form.club} onChange={set("club")}>
              <option value="">Not a club event</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ev-org">Organising body</label>
            <input id="ev-org" className="input" placeholder="e.g. COSA" value={form.organising_body} onChange={set("organising_body")} disabled={Boolean(form.club)} />
          </div>
          <div>
            <label className="label" htmlFor="ev-start">Starts</label>
            <input id="ev-start" type="datetime-local" className="input" required value={form.starts_at} onChange={set("starts_at")} />
          </div>
          <div>
            <label className="label" htmlFor="ev-end">Ends</label>
            <input id="ev-end" type="datetime-local" className="input" value={form.ends_at} onChange={set("ends_at")} />
          </div>
          <div>
            <label className="label" htmlFor="ev-venue">Venue</label>
            <input id="ev-venue" className="input" value={form.venue} onChange={set("venue")} />
          </div>
          <div>
            <label className="label" htmlFor="ev-reg">Registration link</label>
            <input id="ev-reg" type="url" className="input" placeholder="https://" value={form.registration_url} onChange={set("registration_url")} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ev-desc">Description</label>
          <textarea id="ev-desc" className="input min-h-24" maxLength={4000} value={form.description} onChange={set("description")} />
        </div>
        <div>
          <label className="label" htmlFor="ev-poster">Poster</label>
          <input id="ev-poster" type="file" accept="image/*" className="text-sm" onChange={(e) => setPoster(e.target.files?.[0] ?? null)} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={m.isPending}>{m.isPending && <Spinner className="h-4 w-4 text-white" />} Create event</button>
        </div>
      </form>
    </Modal>
  );
}

export function ClubCard({ club }: { club: Club }) {
  return (
    <Link href={`/clubs/${club.slug}`} className="card group flex flex-col p-5 transition hover:border-brand-300">
      <div className="flex items-center gap-3">
        {club.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.logo} alt="" className="h-12 w-12 rounded-xl object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-lg font-semibold text-brand-800">{club.name[0]}</span>
        )}
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-900 group-hover:text-brand-800">{club.name}</h3>
          <p className="text-xs text-slate-500">{club.kind.toLowerCase()} club</p>
        </div>
      </div>
      {club.description && <p className="mt-3 line-clamp-2 text-sm text-slate-600">{club.description}</p>}
      <div className="mt-auto flex gap-4 pt-4 text-xs text-slate-500">
        <span>{club.member_count} members</span>
        <span className="inline-flex items-center gap-1 text-brand-700"><CalendarDays className="h-3.5 w-3.5" /> {club.upcoming_event_count} upcoming</span>
      </div>
    </Link>
  );
}
