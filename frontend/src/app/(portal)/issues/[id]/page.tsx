"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileText,
  History,
  MessageSquare,
  Megaphone,
  Pencil,
  RotateCcw,
  EyeOff,
  Hand,
  Settings2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ReasonModal, StatusChangeModal, UserPicker } from "@/components/issues";
import { Avatar, ErrorBox, Modal, PageLoader, PriorityBadge, Spinner, StatusBadge, Tabs, UserLine } from "@/components/ui";
import { api, downloadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime, timeAgo } from "@/lib/format";
import { SupportModal, type MySupport } from "@/components/support";
import type { Attachment, IssueDetail, IssueEvent, Remark, SupportersResponse, TimelineItem, UserBrief } from "@/lib/types";

export default function IssuePage() {
  const { id } = useParams<{ id: string }>();
  const issueId = Number(id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"timeline" | "history">("timeline");
  const [modal, setModal] = useState<null | "status" | "assign" | "faculty" | "escalate" | "reopen">(null);

  const issueQ = useQuery({ queryKey: ["issue", issueId], queryFn: () => api<IssueDetail>(`/api/issues/${issueId}/`) });
  const timelineQ = useQuery({ queryKey: ["timeline", issueId], queryFn: () => api<TimelineItem[]>(`/api/issues/${issueId}/timeline/`) });
  const historyQ = useQuery({
    queryKey: ["history", issueId],
    queryFn: () => api<IssueEvent[]>(`/api/issues/${issueId}/history/`),
    enabled: tab === "history",
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["issue", issueId] });
    qc.invalidateQueries({ queryKey: ["timeline", issueId] });
    qc.invalidateQueries({ queryKey: ["history", issueId] });
    qc.invalidateQueries({ queryKey: ["remarks", issueId] });
    qc.invalidateQueries({ queryKey: ["supporters", issueId] });
    qc.invalidateQueries({ queryKey: ["board"] });
    qc.invalidateQueries({ queryKey: ["my-issues"] });
  };


  if (issueQ.isLoading) return <PageLoader />;
  if (issueQ.error || !issueQ.data) return <ErrorBox error={issueQ.error || "Issue not found"} />;
  const issue = issueQ.data;
  const p = issue.permissions;
  const isOpen = issue.status !== "COMPLETED";
  const showEscalate = p.can_remark && isOpen && !issue.is_escalated;
  const hasActions =
    (p.can_edit && isOpen) || p.can_assign || p.can_reopen || showEscalate;

  return (
    <div>
      <Link href="/board" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-800">
        <ArrowLeft className="h-4 w-4" /> Back to board
      </Link>

      {issue.is_escalated && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Escalated to the President {issue.escalated_at && `on ${formatDateTime(issue.escalated_at)}`}.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="min-w-0 space-y-6">
          <div className="card p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-400">#{issue.id}</span>
              <StatusBadge status={issue.status} />
              <PriorityBadge priority={issue.priority} />
              <span className="chip bg-brand-50 text-brand-700">{issue.category.name}</span>
              {issue.reopened_count > 0 && <span className="chip bg-violet-100 text-violet-700">Reopened ×{issue.reopened_count}</span>}
              {issue.resolution && issue.status === "COMPLETED" && (
                <span className="chip bg-emerald-50 text-emerald-700">{issue.resolution.replace("_", " ").toLowerCase()}</span>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900">{issue.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Raised by {issue.created_by.full_name || issue.created_by.email || "a student"} · {formatDateTime(issue.created_at)}
            </p>
            <p className="mt-5 whitespace-pre-wrap text-slate-700">{issue.description}</p>
            {issue.attachments.length > 0 && <Attachments items={issue.attachments} />}
          </div>

          {p.can_upvote && isOpen && <SupportBanner issueId={issueId} issueTitle={issue.title} mine={issue.my_support} />}
          <SupportersCard issueId={issueId} total={issue.upvote_count + 1} canExport={p.can_export} />

          <div>
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "timeline", label: "Updates & remarks", count: timelineQ.data?.length },
                { value: "history", label: "History" },
              ]}
            />
            {tab === "timeline" ? (
              <div className="space-y-4">
                {timelineQ.isLoading && <PageLoader />}
                {timelineQ.data?.length === 0 && <p className="text-sm text-slate-500">No updates yet.</p>}
                {timelineQ.data?.map((item) => <TimelineEntry key={`${item.kind}-${item.data.id}`} item={item} />)}
                {p.can_post_update && <UpdateComposer issueId={issueId} onDone={refresh} />}
                {p.can_remark && <RemarkComposer issueId={issueId} onDone={refresh} />}
              </div>
            ) : (
              <HistoryList events={historyQ.data} loading={historyQ.isLoading} />
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {hasActions && (
          <div className="card space-y-2 p-4">
            {p.can_edit && issue.status !== "COMPLETED" && (
              <button className="btn-primary w-full" onClick={() => setModal("status")}>
                Change status
              </button>
            )}
            {p.can_assign && (
              <>
                <button className="btn-secondary w-full" onClick={() => setModal("assign")}>Assign members</button>
                <button className="btn-secondary w-full" onClick={() => setModal("faculty")}>Assign faculty</button>
              </>
            )}
            {p.can_reopen && (
              <button className="btn-secondary w-full" onClick={() => setModal("reopen")}>
                <RotateCcw className="h-4 w-4" /> Reopen
              </button>
            )}
            {showEscalate && (
              <button
                className={clsx("w-full", p.can_escalate ? "btn bg-amber-500 text-white hover:bg-amber-600" : "btn-secondary")}
                disabled={!p.can_escalate}
                onClick={() => setModal("escalate")}
                title={p.can_escalate ? "" : `Available from ${formatDateTime(issue.escalation_available_at)}`}
              >
                <AlertTriangle className="h-4 w-4" /> Raise to President
              </button>
            )}
            {showEscalate && !p.can_escalate && (
              <p className="text-center text-xs text-slate-500">Escalation opens {formatDateTime(issue.escalation_available_at)}</p>
            )}
          </div>
          )}

          <div className="card divide-y divide-slate-100 text-sm">
            <Detail label="Raised by"><UserLine user={issue.created_by} /></Detail>
            <Detail label="Assigned to">
              {issue.assignees.length ? (
                <div className="space-y-1.5">{issue.assignees.map((a) => <UserLine key={a.id} user={a} />)}</div>
              ) : (
                <span className="text-slate-400 italic">Not assigned yet</span>
              )}
            </Detail>
            <Detail label="Faculty"><UserLine user={issue.faculty} /></Detail>
            {issue.tagged_members?.length > 0 && (
              <Detail label="Tagged">
                <div className="space-y-1.5">{issue.tagged_members.map((u) => <UserLine key={u.id} user={u} />)}</div>
              </Detail>
            )}
            <Detail label="Last updated">{timeAgo(issue.updated_at)}</Detail>
          </div>
        </aside>
      </div>

      {modal === "status" && <StatusChangeModal issueId={issueId} current={issue.status} target={null} onClose={() => { setModal(null); refresh(); }} />}
      {modal === "assign" && <AssignModal issue={issue} onClose={() => setModal(null)} onDone={refresh} />}
      {modal === "faculty" && <FacultyModal issue={issue} onClose={() => setModal(null)} onDone={refresh} />}
      {modal === "escalate" && (
        <ReasonModal
          title="Raise to President"
          description="Tell the President why this needs attention. COSA and the assigned members are notified too."
          confirmLabel="Escalate"
          onClose={() => setModal(null)}
          onSubmit={async (reason) => {
            await api(`/api/issues/${issueId}/escalate/`, { method: "POST", body: { reason } });
            refresh();
          }}
        />
      )}
      {modal === "reopen" && (
        <ReasonModal
          title="Reopen issue"
          description="Explain what is still not fixed. The issue goes back to Under Process and the 5-day escalation timer restarts."
          confirmLabel="Reopen"
          onClose={() => setModal(null)}
          onSubmit={async (reason) => {
            await api(`/api/issues/${issueId}/reopen/`, { method: "POST", body: { reason } });
            refresh();
          }}
        />
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <p className="mb-1 text-xs font-medium tracking-wide text-slate-400 uppercase">{label}</p>
      <div className="text-slate-800">{children}</div>
    </div>
  );
}

function Attachments({ items }: { items: Attachment[] }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {items.map((a) =>
        a.content_type.startsWith("image/") ? (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.original_name} className="h-24 w-24 object-cover" />
          </a>
        ) : (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="chip border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:border-brand-300">
            <FileText className="h-4 w-4" /> {a.original_name}
          </a>
        ),
      )}
    </div>
  );
}

const REMARK_LABEL: Record<Remark["type"], string> = {
  REMARK: "Remark",
  REOPEN: "Reopen reason",
  ESCALATION: "Escalation reason",
};

function TimelineEntry({ item }: { item: TimelineItem }) {
  const isUpdate = item.kind === "update";
  const d = item.data;
  return (
    <div className={clsx("rounded-xl border p-4", isUpdate ? "border-brand-200 bg-brand-50/60" : "border-slate-200 bg-white")}>
      <div className="flex flex-wrap items-center gap-2">
        <Avatar user={d.author} size="sm" />
        <span className="text-sm font-medium text-slate-900">{d.author.role_name || d.author.full_name || "Student"}</span>
        {isUpdate ? (
          <span className="chip bg-brand-800 text-white"><Megaphone className="h-3 w-3" /> Official update</span>
        ) : (
          <span className={clsx("chip", (d as Remark).type === "REMARK" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-800")}>
            <MessageSquare className="h-3 w-3" /> {REMARK_LABEL[(d as Remark).type]}
          </span>
        )}
        <span className="text-xs text-slate-400">{timeAgo(d.created_at)}{d.edited_at && " · edited"}</span>
      </div>
      <p className="mt-2 text-sm whitespace-pre-wrap text-slate-700">{d.body}</p>
      {d.attachments.length > 0 && <Attachments items={d.attachments} />}
    </div>
  );
}

function UpdateComposer({ issueId, onDone }: { issueId: number; onDone: () => void }) {
  const [body, setBody] = useState("");
  const m = useMutation({
    mutationFn: () => api(`/api/issues/${issueId}/updates/`, { method: "POST", body: { body } }),
    onSuccess: () => {
      setBody("");
      onDone();
    },
  });
  return (
    <form
      className="card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <label className="label flex items-center gap-2" htmlFor="upd-body">
        <Megaphone className="h-4 w-4 text-brand-700" /> Post an official update
      </label>
      <ErrorBox error={m.error} />
      <textarea id="upd-body" className="input min-h-20" maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What has COSA done so far?" required />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-400">{body.length}/1000 · the student is notified</span>
        <button className="btn-primary" disabled={m.isPending}>{m.isPending && <Spinner className="h-4 w-4 text-white" />} Post update</button>
      </div>
    </form>
  );
}

function RemarkComposer({ issueId, onDone }: { issueId: number; onDone: () => void }) {
  const [body, setBody] = useState("");
  const left = useQuery({
    queryKey: ["remarks", issueId],
    queryFn: () => api<{ remarks_left_today: number }>(`/api/issues/${issueId}/remarks/`),
  });
  const m = useMutation({
    mutationFn: () => api(`/api/issues/${issueId}/remarks/`, { method: "POST", body: { body } }),
    onSuccess: () => {
      setBody("");
      onDone();
    },
  });
  const remaining = left.data?.remarks_left_today ?? 0;
  return (
    <form
      className="card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <label className="label flex items-center gap-2" htmlFor="rem-body">
        <Pencil className="h-4 w-4 text-slate-500" /> Add a remark
      </label>
      <ErrorBox error={m.error} />
      <textarea
        id="rem-body"
        className="input min-h-20"
        maxLength={500}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={remaining === 0}
        placeholder={remaining === 0 ? "Daily limit reached — you can add more tomorrow." : "Any new details, or is it fixed?"}
        required
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-400">{body.length}/500 · {remaining} left today</span>
        <button className="btn-primary" disabled={m.isPending || remaining === 0}>{m.isPending && <Spinner className="h-4 w-4 text-white" />} Add remark</button>
      </div>
    </form>
  );
}

const ACTION_TEXT: Record<string, string> = {
  created: "raised the issue",
  auto_assigned: "auto-assigned",
  assigned: "assigned",
  unassigned: "unassigned",
  faculty: "set faculty",
  status: "changed status",
  edited: "edited",
  escalated: "escalated to the President",
  reopened: "reopened the issue",
  update_edited: "edited an update",
  remark_edited: "edited a remark",
};

function HistoryList({ events, loading }: { events?: IssueEvent[]; loading: boolean }) {
  if (loading) return <PageLoader />;
  if (!events?.length) return <p className="text-sm text-slate-500">No history yet.</p>;
  return (
    <ol className="card divide-y divide-slate-100">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 px-4 py-3 text-sm">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <p className="text-slate-700">
              <span className="font-medium text-slate-900">{e.actor_role || e.actor?.full_name || "System"}</span> {ACTION_TEXT[e.action] || e.action}
              {e.field && e.action !== "created" && (
                <>
                  {" "}
                  {e.old_value && <span className="text-slate-400 line-through">{e.old_value}</span>}
                  {e.old_value && e.new_value && " → "}
                  {e.new_value && <span className="font-medium">{e.new_value}</span>}
                </>
              )}
            </p>
            <p className="text-xs text-slate-400">{formatDateTime(e.created_at)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function AssignModal({ issue, onClose, onDone }: { issue: IssueDetail; onClose: () => void; onDone: () => void }) {
  const [selected, setSelected] = useState<UserBrief[]>(issue.assignees);
  const m = useMutation({
    mutationFn: () => api(`/api/issues/${issue.id}/assign/`, { method: "POST", body: { assignees: selected.map((u) => u.id) } }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title="Assign members">
      <ErrorBox error={m.error} />
      <UserPicker selected={selected} onChange={setSelected} />
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => m.mutate()} disabled={m.isPending}>Save</button>
      </div>
    </Modal>
  );
}

function FacultyModal({ issue, onClose, onDone }: { issue: IssueDetail; onClose: () => void; onDone: () => void }) {
  const [selected, setSelected] = useState<UserBrief[]>(issue.faculty ? [issue.faculty] : []);
  const m = useMutation({
    mutationFn: () => api(`/api/issues/${issue.id}/faculty/`, { method: "POST", body: { faculty: selected[0]?.id ?? null } }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title="Assign faculty">
      <ErrorBox error={m.error} />
      <UserPicker selected={selected} onChange={setSelected} userType="FACULTY" multiple={false} />
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => m.mutate()} disabled={m.isPending}>Save</button>
      </div>
    </Modal>
  );
}

function SupportBanner({ issueId, issueTitle, mine }: { issueId: number; issueTitle: string; mine: MySupport }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className={clsx("rounded-xl border p-4", mine ? "border-emerald-200 bg-emerald-50" : "border-brand-200 bg-brand-50")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          {mine === "PUBLIC" && (
            <>
              <p className="font-medium text-emerald-900">You raised this issue publicly</p>
              <p className="text-emerald-800">{user?.full_name} ({user?.roll_number}) is listed on this issue.</p>
            </>
          )}
          {mine === "PRIVATE" && (
            <>
              <p className="font-medium text-emerald-900">You raised this issue privately</p>
              <p className="text-emerald-800">You&apos;re counted, but only COSA can see your name.</p>
            </>
          )}
          {!mine && (
            <>
              <p className="font-medium text-brand-900">Facing this too?</p>
              <p className="text-brand-800">Raise it too, publicly with your name and roll number, or privately.</p>
            </>
          )}
        </div>
        <button onClick={() => setOpen(true)} className={clsx("shrink-0", mine ? "btn-secondary" : "btn-primary")}>
          {mine ? <Settings2 className="h-4 w-4" /> : <Hand className="h-4 w-4" />}
          {mine ? "Change" : "Raise this issue"}
        </button>
      </div>
      {open && <SupportModal issueId={issueId} issueTitle={issueTitle} current={mine} onClose={() => setOpen(false)} />}
    </div>
  );
}

const BRANCH_SHORT: Record<string, string> = { CSE: "CSE", MNC: "MnC", AIDS: "AI & DS" };
const PREVIEW = 12;

function SupportersCard({ issueId, total, canExport }: { issueId: number; total: number; canExport: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["supporters", issueId],
    queryFn: () => api<SupportersResponse>(`/api/issues/${issueId}/supporters/`),
  });
  const list = data?.results ?? [];
  const shown = showAll ? list : list.slice(0, PREVIEW);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      await downloadFile(`/api/issues/${issueId}/supporters/export/`, `issue-${issueId}-students.xlsx`);
    } catch (e) {
      setError(e);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <Users className="h-5 w-5 text-brand-700" /> Students on this issue
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">{data ? data.total : total}</span>
        </h2>
        {canExport && (
          <button className="btn-secondary px-3 py-1.5" onClick={download} disabled={downloading}>
            {downloading ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />} Download sheet (.xlsx)
          </button>
        )}
      </div>
      <ErrorBox error={error} />
      {isLoading ? (
        <div className="py-4"><Spinner /></div>
      ) : (
        <>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {shown.map((s) => (
              <li key={`${s.role}-${s.id}`} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2">
                <Avatar user={{ full_name: s.full_name, avatar_url: s.avatar_url, email: null }} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-900">
                    {s.full_name || "Student"} <span className="font-mono text-xs text-brand-700">({s.roll_number || "—"})</span>
                  </span>
                  <span className="block text-xs text-slate-500">
                    {[BRANCH_SHORT[s.branch] || "", s.year_of_study ? `Year ${s.year_of_study}` : ""].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {s.role === "RAISED" && <span className="chip bg-amber-100 text-amber-800">First raised</span>}
                {s.is_private && (
                  <span className="chip bg-slate-100 text-slate-600" title="Hidden from other students">
                    <EyeOff className="h-3 w-3" /> Private
                  </span>
                )}
              </li>
            ))}
          </ul>
          {data && data.private_hidden > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-500">
              <EyeOff className="h-4 w-4" /> + {data.private_hidden} student{data.private_hidden === 1 ? "" : "s"} raised it privately
            </p>
          )}
          {list.length > PREVIEW && (
            <button className="mt-3 text-sm font-medium text-brand-700 hover:underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `Show all ${list.length} students`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
