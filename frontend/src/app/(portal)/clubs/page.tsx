"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { ClubCard } from "@/components/cosa";
import { EmptyState, ErrorBox, Modal, PageHeader, PageLoader, Spinner } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Club, Paginated } from "@/lib/types";

const KINDS = ["CULTURAL", "TECHNICAL", "SPORTS", "LITERARY", "SOCIAL", "OTHER"];

export default function ClubsPage() {
  const { user } = useAuth();
  const [kind, setKind] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["clubs", kind],
    queryFn: () => api<Paginated<Club>>(`/api/cosa/clubs/${qs({ kind, page_size: 100 })}`),
  });

  return (
    <>
      <PageHeader
        title="Clubs"
        subtitle="Every student club at IIIT Raichur, with its members and upcoming events."
        actions={
          user?.is_cosa && (
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Add club
            </button>
          )
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {["", ...KINDS].map((k) => (
          <button
            key={k || "all"}
            onClick={() => setKind(k)}
            className={`chip border px-3 py-1 text-sm ${kind === k ? "border-brand-700 bg-brand-800 text-white" : "border-slate-300 bg-white text-slate-600"}`}
          >
            {k ? k[0] + k.slice(1).toLowerCase() : "All"}
          </button>
        ))}
      </div>
      <ErrorBox error={error} />
      {isLoading ? (
        <PageLoader />
      ) : data?.results.length === 0 ? (
        <EmptyState icon={<Users className="h-10 w-10" />} title="No clubs yet" text="COSA adds clubs here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.results.map((c) => <ClubCard key={c.id} club={c} />)}
        </div>
      )}
      {creating && <ClubForm onClose={() => setCreating(false)} />}
    </>
  );
}

function ClubForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", kind: "CULTURAL", description: "", contact_email: "" });
  const m = useMutation({
    mutationFn: () => api("/api/cosa/clubs/", { method: "POST", body: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clubs"] });
      onClose();
    },
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Modal open onClose={onClose} title="Add a club">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <ErrorBox error={m.error} />
        <div><label className="label" htmlFor="cl-name">Name</label><input id="cl-name" className="input" required value={form.name} onChange={set("name")} /></div>
        <div>
          <label className="label" htmlFor="cl-kind">Type</label>
          <select id="cl-kind" className="input" value={form.kind} onChange={set("kind")}>
            {KINDS.map((k) => <option key={k} value={k}>{k[0] + k.slice(1).toLowerCase()}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="cl-email">Contact email</label><input id="cl-email" type="email" className="input" value={form.contact_email} onChange={set("contact_email")} /></div>
        <div><label className="label" htmlFor="cl-desc">Description</label><textarea id="cl-desc" className="input min-h-24" value={form.description} onChange={set("description")} /></div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={m.isPending}>{m.isPending && <Spinner className="h-4 w-4 text-white" />} Add club</button>
        </div>
      </form>
    </Modal>
  );
}
