"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Mail, Megaphone, Pin, PinOff, Plus, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { UserPicker } from "@/components/issues";
import { EmptyState, ErrorBox, Modal, PageHeader, PageLoader, Spinner, Tabs, UserLine } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime, timeAgo } from "@/lib/format";
import { useCategories } from "@/lib/hooks";
import type { Committee, CommitteeApplication, CosaPost, Paginated, RoleMailbox, UserBrief } from "@/lib/types";

type Tab = "updates" | "committees" | "directory";

export default function CosaPage() {
  const [tab, setTab] = useState<Tab>("updates");
  return (
    <>
      <PageHeader title="Council of Student Affairs" subtitle="Official updates, committees and the people behind COSA." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "updates", label: "COSA Updates" },
          { value: "committees", label: "Committees" },
          { value: "directory", label: "Directory" },
        ]}
      />
      {tab === "updates" && <UpdatesTab />}
      {tab === "committees" && <CommitteesTab />}
      {tab === "directory" && <DirectoryTab />}
    </>
  );
}

// ---------------------------------------------------------------- updates
function UpdatesTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [composing, setComposing] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["posts"],
    queryFn: () => api<Paginated<CosaPost>>("/api/cosa/posts/?page_size=50"),
  });
  const flag = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) => api(`/api/cosa/posts/${id}/${action}/`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["posts"] }),
  });

  return (
    <div className="mx-auto max-w-3xl">
      {user?.is_cosa && (
        <button onClick={() => setComposing(true)} className="card mb-5 flex w-full items-center gap-3 p-4 text-left text-slate-500 hover:border-brand-300">
          <Megaphone className="h-5 w-5 text-brand-700" /> Post an announcement for all students…
        </button>
      )}
      <ErrorBox error={error || flag.error} />
      {isLoading ? (
        <PageLoader />
      ) : data?.results.length === 0 ? (
        <EmptyState icon={<Megaphone className="h-10 w-10" />} title="No updates yet" text="Official COSA announcements will appear here." />
      ) : (
        <div className="space-y-4">
          {data?.results.map((post) => (
            <article key={post.id} className={`card p-5 ${post.is_pinned ? "border-amber-300 ring-1 ring-amber-200" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {post.is_pinned && <span className="chip bg-amber-100 text-amber-800"><Pin className="h-3 w-3" /> Pinned</span>}
                  <span className="font-medium text-brand-800">{post.author_role || post.author.full_name}</span>
                  {post.category_name && <span className="chip bg-brand-50 text-brand-700">{post.category_name}</span>}
                  <span className="text-xs text-slate-400">{timeAgo(post.created_at)}</span>
                </div>
                {user?.can_manage_issues && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      className="btn-ghost p-1.5"
                      title={post.is_pinned ? "Unpin" : "Pin"}
                      onClick={() => flag.mutate({ id: post.id, action: post.is_pinned ? "unpin" : "pin" })}
                    >
                      {post.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </button>
                    <button className="btn-ghost p-1.5" title="Archive" onClick={() => flag.mutate({ id: post.id, action: "archive" })}>
                      <Archive className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">{post.title}</h3>
              <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">{post.body}</p>
              {post.attachment && (
                <a href={post.attachment} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-brand-700 hover:underline">
                  View attachment
                </a>
              )}
              {post.linked_issues.length > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  Related issues:{" "}
                  {post.linked_issues.map((id, i) => (
                    <a key={id} href={`/issues/${id}`} className="text-brand-700 hover:underline">
                      #{id}{i < post.linked_issues.length - 1 ? ", " : ""}
                    </a>
                  ))}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
      {composing && <PostForm onClose={() => setComposing(false)} />}
    </div>
  );
}

function PostForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: categories } = useCategories();
  const [form, setForm] = useState({ title: "", body: "", category: "", linked: "" });
  const m = useMutation({
    mutationFn: () => {
      const linked = form.linked
        .split(/[\s,#]+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => !Number.isNaN(n));
      return api("/api/cosa/posts/", {
        method: "POST",
        body: { title: form.title, body: form.body, category: form.category || null, linked_issues: linked },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posts"] });
      onClose();
    },
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Modal open onClose={onClose} title="New COSA update" wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <ErrorBox error={m.error} />
        <div><label className="label" htmlFor="p-title">Title</label><input id="p-title" className="input" required maxLength={150} value={form.title} onChange={set("title")} /></div>
        <div>
          <label className="label" htmlFor="p-body">Message</label>
          <textarea id="p-body" className="input min-h-32" required maxLength={2000} value={form.body} onChange={set("body")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="p-cat">Category</label>
            <select id="p-cat" className="input" value={form.category} onChange={set("category")}>
              <option value="">General</option>
              {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="p-linked">Related issue numbers</label>
            <input id="p-linked" className="input" placeholder="e.g. 142, 156" value={form.linked} onChange={set("linked")} />
          </div>
        </div>
        <p className="text-xs text-slate-500">Every student gets a notification.</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={m.isPending}>{m.isPending && <Spinner className="h-4 w-4 text-white" />} Publish</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- committees
function CommitteesTab() {
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["committees"],
    queryFn: () => api<Paginated<Committee>>("/api/cosa/committees/?page_size=50&is_active=true"),
  });

  return (
    <div>
      {user?.is_cosa && (
        <div className="mb-4 flex justify-end">
          <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Form a committee</button>
        </div>
      )}
      <ErrorBox error={error} />
      {isLoading ? (
        <PageLoader />
      ) : data?.results.length === 0 ? (
        <EmptyState icon={<Users className="h-10 w-10" />} title="No committees yet" text="Committees formed for events and issues will be listed here." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data?.results.map((c) => <CommitteeCard key={c.id} committee={c} />)}
        </div>
      )}
      {creating && <CommitteeForm onClose={() => setCreating(false)} />}
    </div>
  );
}

function CommitteeCard({ committee: c }: { committee: Committee }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [applying, setApplying] = useState(false);
  const [adding, setAdding] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const isMember = c.members.some((m) => m.user.id === user?.id);

  return (
    <article className="card flex flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        {c.applications_open && <span className="chip bg-emerald-100 text-emerald-700">Applications open</span>}
        {c.event_title && <span className="chip bg-brand-50 text-brand-700">Event: {c.event_title}</span>}
        {c.issue_title && <a href={`/issues/${c.issue}`} className="chip bg-slate-100 text-slate-600 hover:underline">Issue #{c.issue}</a>}
      </div>
      <h3 className="mt-2 text-lg font-semibold text-slate-900">{c.name}</h3>
      {c.purpose && <p className="mt-1 text-sm text-slate-600">{c.purpose}</p>}
      <p className="mt-2 text-xs text-slate-400">
        Formed {formatDate(c.formed_on)}
        {c.applications_open_until && ` · apply by ${formatDateTime(c.applications_open_until)}`}
      </p>
      <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
        {c.members.length === 0 && <li className="text-sm text-slate-400">No members yet.</li>}
        {c.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2">
            <UserLine user={m.user} />
            <span className="text-xs text-slate-500">{m.position.toLowerCase()}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        {c.applications_open && !user?.is_cosa && !isMember && (
          c.my_application_status ? (
            <span className="chip bg-slate-100 px-3 py-1.5 text-slate-600">Application {c.my_application_status.toLowerCase()}</span>
          ) : (
            <button className="btn-primary" onClick={() => setApplying(true)}>Apply to join</button>
          )
        )}
        {user?.is_cosa && (
          <>
            <button className="btn-secondary" onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> Add member</button>
            <button className="btn-secondary" onClick={() => setReviewing(true)}>Review applications</button>
          </>
        )}
      </div>

      {applying && (
        <ApplyModal
          committee={c}
          onClose={() => setApplying(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ["committees"] })}
        />
      )}
      {adding && <AddCommitteeMember committee={c} onClose={() => setAdding(false)} />}
      {reviewing && <ReviewApplications committee={c} onClose={() => setReviewing(false)} />}
    </article>
  );
}

function ApplyModal({ committee, onClose, onDone }: { committee: Committee; onClose: () => void; onDone: () => void }) {
  const [statement, setStatement] = useState("");
  const m = useMutation({
    mutationFn: () => api(`/api/cosa/committees/${committee.id}/apply/`, { method: "POST", body: { statement } }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={`Apply to ${committee.name}`}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <ErrorBox error={m.error} />
        <label className="label" htmlFor="stmt">Why do you want to join?</label>
        <textarea id="stmt" className="input min-h-28" required maxLength={1000} value={statement} onChange={(e) => setStatement(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={m.isPending}>Submit application</button>
        </div>
      </form>
    </Modal>
  );
}

function AddCommitteeMember({ committee, onClose }: { committee: Committee; onClose: () => void }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<UserBrief[]>([]);
  const [position, setPosition] = useState("MEMBER");
  const m = useMutation({
    mutationFn: async () => {
      for (const u of selected) {
        await api(`/api/cosa/committees/${committee.id}/members/`, { method: "POST", body: { user_id: u.id, position } });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["committees"] });
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title={`Add members to ${committee.name}`}>
      <ErrorBox error={m.error} />
      <UserPicker selected={selected} onChange={setSelected} />
      <select className="input mt-3" value={position} onChange={(e) => setPosition(e.target.value)} aria-label="Position">
        <option value="MEMBER">Member</option>
        <option value="COORDINATOR">Coordinator</option>
        <option value="HEAD">Head</option>
      </select>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!selected.length || m.isPending} onClick={() => m.mutate()}>Add {selected.length || ""}</button>
      </div>
    </Modal>
  );
}

function ReviewApplications({ committee, onClose }: { committee: Committee; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["applications", committee.id],
    queryFn: () => api<Paginated<CommitteeApplication>>(`/api/cosa/committees/${committee.id}/applications/?status=PENDING`),
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: "ACCEPTED" | "REJECTED" }) =>
      api(`/api/cosa/committees/${committee.id}/applications/${id}/decide/`, { method: "POST", body: { decision } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications", committee.id] });
      qc.invalidateQueries({ queryKey: ["committees"] });
    },
  });
  return (
    <Modal open onClose={onClose} title={`Applications · ${committee.name}`} wide>
      <ErrorBox error={error || decide.error} />
      {isLoading && <PageLoader />}
      {data?.results.length === 0 && <p className="text-sm text-slate-500">No pending applications.</p>}
      <ul className="space-y-3">
        {data?.results.map((a) => (
          <li key={a.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <UserLine user={a.applicant} />
              <span className="text-xs text-slate-400">{timeAgo(a.created_at)}</span>
            </div>
            <p className="mt-2 text-sm text-slate-700">{a.statement}</p>
            <div className="mt-3 flex gap-2">
              <button className="btn-primary px-3 py-1.5" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, decision: "ACCEPTED" })}>Accept</button>
              <button className="btn-secondary px-3 py-1.5" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, decision: "REJECTED" })}>Reject</button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function CommitteeForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const events = useQuery({ queryKey: ["events", "upcoming", ""], queryFn: () => api<Paginated<{ id: number; title: string }>>("/api/cosa/events/?when=upcoming&page_size=50") });
  const [form, setForm] = useState({ name: "", purpose: "", event: "", issue: "", applications_open_until: "" });
  const m = useMutation({
    mutationFn: () =>
      api("/api/cosa/committees/", {
        method: "POST",
        body: {
          name: form.name,
          purpose: form.purpose,
          event: form.event || null,
          issue: form.issue || null,
          applications_open_until: form.applications_open_until ? new Date(form.applications_open_until).toISOString() : null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["committees"] });
      onClose();
    },
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Modal open onClose={onClose} title="Form a committee" wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <ErrorBox error={m.error} />
        <div><label className="label" htmlFor="c-name">Name</label><input id="c-name" className="input" required value={form.name} onChange={set("name")} placeholder="e.g. Fest 2026 Organising Committee" /></div>
        <div><label className="label" htmlFor="c-purpose">Purpose</label><textarea id="c-purpose" className="input min-h-20" value={form.purpose} onChange={set("purpose")} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="c-event">For event</label>
            <select id="c-event" className="input" value={form.event} onChange={set("event")}>
              <option value="">None</option>
              {events.data?.results.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="c-issue">For issue number</label>
            <input id="c-issue" type="number" min={1} className="input" value={form.issue} onChange={set("issue")} placeholder="optional" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="c-open">Accept student applications until <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="c-open" type="datetime-local" className="input" value={form.applications_open_until} onChange={set("applications_open_until")} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={m.isPending}>{m.isPending && <Spinner className="h-4 w-4 text-white" />} Create</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- directory
const LEVEL_LABEL = { GEN_SEC: "General Secretary", PRESIDENT: "President", SECRETARY: "Secretary" } as const;

function DirectoryTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["directory"],
    queryFn: () => api<RoleMailbox[]>("/api/auth/directory/"),
  });
  if (isLoading) return <PageLoader />;
  return (
    <>
      <ErrorBox error={error} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((r) => (
          <div key={r.id} className={`card p-5 ${r.level !== "SECRETARY" ? "border-brand-300" : ""}`}>
            <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase">{LEVEL_LABEL[r.level]}</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{r.role_name}</h3>
            {r.held_by_name && <p className="text-sm text-slate-600">{r.held_by_name}{r.academic_year && ` · ${r.academic_year}`}</p>}
            {r.category_name && <span className="chip mt-2 bg-brand-50 text-brand-700">Handles {r.category_name}</span>}
            <a href={`mailto:${r.email}`} className="mt-3 flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
              <Mail className="h-4 w-4" /> {r.email}
            </a>
          </div>
        ))}
      </div>
    </>
  );
}
