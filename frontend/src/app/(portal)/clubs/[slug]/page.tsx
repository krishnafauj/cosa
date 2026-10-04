"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mail, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { EventCard, EventForm } from "@/components/cosa";
import { UserPicker } from "@/components/issues";
import { ErrorBox, Modal, PageLoader, UserLine } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { CampusEvent, Club, Paginated, UserBrief } from "@/lib/types";

export default function ClubPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);

  const clubQ = useQuery({ queryKey: ["clubs", slug], queryFn: () => api<Club>(`/api/cosa/clubs/${slug}/`) });
  const eventsQ = useQuery({
    queryKey: ["events", "club", slug],
    queryFn: () => api<Paginated<CampusEvent>>(`/api/cosa/events/?club=${slug}&when=upcoming`),
  });

  if (clubQ.isLoading) return <PageLoader />;
  if (!clubQ.data) return <ErrorBox error={clubQ.error || "Club not found"} />;
  const club = clubQ.data;
  const myPosition = club.memberships?.find((m) => m.user.id === user?.id)?.position;
  const canManage = Boolean(user?.is_cosa || myPosition === "HEAD" || myPosition === "COORDINATOR");

  return (
    <div>
      <Link href="/clubs" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-800">
        <ArrowLeft className="h-4 w-4" /> All clubs
      </Link>
      <div className="card mb-6 overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-brand-900 to-brand-600" />
        <div className="px-6 pb-6">
          <div className="-mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white bg-brand-100 text-2xl font-semibold text-brand-800">{club.name[0]}</span>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">{club.name}</h1>
                <p className="text-sm text-slate-500">{club.kind.toLowerCase()} club{club.secretary_role_name && ` · reports to ${club.secretary_role_name}`}</p>
              </div>
            </div>
            {canManage && (
              <div className="flex gap-2">
                <button className="btn-secondary" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> Add member</button>
                <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New event</button>
              </div>
            )}
          </div>
          {club.description && <p className="mt-4 max-w-3xl text-slate-600">{club.description}</p>}
          {club.contact_email && (
            <a href={`mailto:${club.contact_email}`} className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
              <Mail className="h-4 w-4" /> {club.contact_email}
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section>
          <h2 className="mb-3 font-semibold text-slate-900">Upcoming events</h2>
          {eventsQ.data?.results.length ? (
            <div className="space-y-3">{eventsQ.data.results.map((e) => <EventCard key={e.id} event={e} />)}</div>
          ) : (
            <p className="text-sm text-slate-500">No upcoming events.</p>
          )}
        </section>
        <aside className="card p-4">
          <h2 className="mb-3 font-semibold text-slate-900">Members ({club.member_count})</h2>
          <ul className="space-y-2">
            {club.memberships?.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2">
                <UserLine user={m.user} />
                <span className="text-xs text-slate-500">{m.position.toLowerCase()}</span>
              </li>
            ))}
            {!club.memberships?.length && <li className="text-sm text-slate-500">No members listed yet.</li>}
          </ul>
        </aside>
      </div>

      {creating && <EventForm clubs={[club]} defaultClub={club.id} onClose={() => setCreating(false)} />}
      {adding && <AddMemberModal slug={club.slug} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddMemberModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<UserBrief[]>([]);
  const [position, setPosition] = useState("MEMBER");
  const m = useMutation({
    mutationFn: () => api(`/api/cosa/clubs/${slug}/members/`, { method: "POST", body: { user_id: selected[0]?.id, position } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clubs"] });
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title="Add club member">
      <ErrorBox error={m.error} />
      <UserPicker selected={selected} onChange={setSelected} multiple={false} />
      <select className="input mt-3" value={position} onChange={(e) => setPosition(e.target.value)} aria-label="Position">
        <option value="MEMBER">Member</option>
        <option value="COORDINATOR">Coordinator</option>
        <option value="HEAD">Head</option>
      </select>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!selected.length || m.isPending} onClick={() => m.mutate()}>Add</button>
      </div>
    </Modal>
  );
}
