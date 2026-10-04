"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { AlertTriangle, Check, Paperclip, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STATUS_META, STATUS_ORDER, timeAgo } from "@/lib/format";
import { useCategories, useUserSearch } from "@/lib/hooks";
import type { IssueCard, IssueDetail, IssueStatus, Priority, UserBrief } from "@/lib/types";
import { canSupport, StudentCount, SupportButton } from "./support";
import { Avatar, ErrorBox, Modal, PriorityBadge, Spinner, StatusBadge } from "./ui";

// --------------------------------------------------------------------------
// Card shown on the board and in lists
// --------------------------------------------------------------------------
export function IssueCardView({
  issue,
  draggable,
  onDragStart,
  showStatus,
}: {
  issue: IssueCard;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  showStatus?: boolean;
}) {
  const { user } = useAuth();
  return (
    <Link
      href={`/issues/${issue.id}`}
      draggable={draggable}
      onDragStart={onDragStart}
      className={clsx(
        "block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-brand-300 hover:shadow",
        draggable && "cursor-grab active:cursor-grabbing",
        issue.is_escalated && "border-l-4 border-l-amber-500",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-slate-400">#{issue.id}</span>
        <div className="flex flex-wrap justify-end gap-1">
          {issue.is_escalated && (
            <span className="chip bg-amber-100 text-amber-800">
              <AlertTriangle className="h-3 w-3" /> Escalated
            </span>
          )}
          {issue.reopened_count > 0 && (
            <span className="chip bg-violet-100 text-violet-700">
              <RotateCcw className="h-3 w-3" /> Reopened ×{issue.reopened_count}
            </span>
          )}
          <PriorityBadge priority={issue.priority} />
        </div>
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-medium text-slate-900">{issue.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="chip bg-brand-50 text-brand-700">{issue.category.name}</span>
        {showStatus && <StatusBadge status={issue.status} />}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <div className="flex -space-x-1.5">
          {issue.assignees.slice(0, 3).map((a) => (
            <Avatar key={a.id} user={a} size="sm" />
          ))}
          {issue.assignees.length === 0 && <span className="text-slate-400 italic">Unassigned</span>}
        </div>
        <div className="flex items-center gap-3">
          <StudentCount count={issue.upvote_count + 1} className="font-medium text-slate-600" />
          <span>{timeAgo(issue.created_at)}</span>
        </div>
      </div>
      {canSupport(user, issue) && (
        <div className="mt-3 flex justify-end border-t border-slate-100 pt-2.5">
          <SupportButton issue={issue} />
        </div>
      )}
    </Link>
  );
}

// --------------------------------------------------------------------------
// Raise an issue (students)
// --------------------------------------------------------------------------
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function RaiseIssueModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: categories } = useCategories();
  const { data: cosa } = useUserSearch("", "COSA");
  const qc = useQueryClient();
  const router = useRouter();
  const [form, setForm] = useState({ title: "", description: "", category: "", priority: "MEDIUM", tagged_member: "" });
  const [files, setFiles] = useState<File[]>([]);

  const mutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.set("title", form.title);
      fd.set("description", form.description);
      fd.set("category", form.category);
      fd.set("priority", form.priority);
      if (form.tagged_member) fd.set("tagged_member", form.tagged_member);
      files.forEach((f) => fd.append("attachments", f));
      return api<IssueDetail>("/api/issues/", { method: "POST", body: fd });
    },
    onSuccess: (issue) => {
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["my-issues"] });
      setForm({ title: "", description: "", category: "", priority: "MEDIUM", tagged_member: "" });
      setFiles([]);
      onClose();
      router.push(`/issues/${issue.id}`);
    },
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal open={open} onClose={onClose} title="Raise an issue" wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <ErrorBox error={mutation.error} />
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" className="input" maxLength={120} required value={form.title} onChange={set("title")} placeholder="e.g. Hot water not working in Block B" />
        </div>
        <div>
          <label className="label" htmlFor="desc">Description</label>
          <textarea id="desc" className="input min-h-28" maxLength={2000} required value={form.description} onChange={set("description")} placeholder="What happened, where, and since when?" />
          <p className="mt-1 text-right text-xs text-slate-400">{form.description.length}/2000</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cat">Category</label>
            <select id="cat" className="input" required value={form.category} onChange={set("category")}>
              <option value="">Select a category</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Priority</span>
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1">
              {PRIORITIES.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setForm((f) => ({ ...f, priority: p }))}
                  className={clsx(
                    "rounded-md py-1.5 text-xs font-medium",
                    form.priority === p ? "bg-white text-brand-800 shadow-sm" : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  {p[0] + p.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="tag">Tag a COSA member <span className="font-normal text-slate-400">(optional)</span></label>
          <select id="tag" className="input" value={form.tagged_member} onChange={set("tagged_member")}>
            <option value="">No one — COSA will assign it</option>
            {cosa?.results.map((u) => (
              <option key={u.id} value={u.id}>{u.role_name || u.full_name}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">Attachments <span className="font-normal text-slate-400">(up to 3 images or PDFs, 5 MB each)</span></span>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 hover:border-brand-300">
            <Paperclip className="h-4 w-4" />
            {files.length ? files.map((f) => f.name).join(", ") : "Choose files"}
            <input
              type="file"
              className="sr-only"
              multiple
              accept="image/*,application/pdf"
              onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 3))}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending && <Spinner className="h-4 w-4 text-white" />} Submit issue
          </button>
        </div>
      </form>
    </Modal>
  );
}

// --------------------------------------------------------------------------
// Change status (with required update for Blocked / Completed)
// --------------------------------------------------------------------------
export function StatusChangeModal({
  issueId,
  current,
  target,
  onClose,
}: {
  issueId: number;
  current: IssueStatus;
  target: IssueStatus | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<IssueStatus | null>(target);
  const [update, setUpdate] = useState("");
  const [resolution, setResolution] = useState("RESOLVED");
  const chosen = status ?? target;
  const needsUpdate = chosen === "BLOCKED" || chosen === "COMPLETED";

  const mutation = useMutation({
    mutationFn: () =>
      api(`/api/issues/${issueId}/status/`, {
        method: "POST",
        body: { status: chosen, update, resolution: chosen === "COMPLETED" ? resolution : "" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["issue", issueId] });
      qc.invalidateQueries({ queryKey: ["timeline", issueId] });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title="Change status">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <ErrorBox error={mutation.error} />
        <div className="grid grid-cols-2 gap-2">
          {STATUS_ORDER.filter((s) => s !== current).map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setStatus(s)}
              className={clsx(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                chosen === s ? "border-brand-500 bg-brand-50 text-brand-900" : "border-slate-200 text-slate-600 hover:border-slate-300",
              )}
            >
              <span className={clsx("h-2 w-2 rounded-full", STATUS_META[s].dot)} />
              {STATUS_META[s].label}
              {chosen === s && <Check className="ml-auto h-4 w-4 text-brand-600" />}
            </button>
          ))}
        </div>
        {chosen === "COMPLETED" && (
          <div>
            <label className="label" htmlFor="res">Resolution</label>
            <select id="res" className="input" value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option value="RESOLVED">Resolved</option>
              <option value="DUPLICATE">Duplicate</option>
              <option value="INVALID">Invalid</option>
              <option value="WONT_FIX">Won&apos;t fix</option>
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="upd">
            Update {needsUpdate ? <span className="text-rose-600">(required)</span> : <span className="font-normal text-slate-400">(optional)</span>}
          </label>
          <textarea
            id="upd"
            className="input min-h-24"
            maxLength={1000}
            required={needsUpdate}
            value={update}
            onChange={(e) => setUpdate(e.target.value)}
            placeholder={chosen === "BLOCKED" ? "What is it waiting on?" : chosen === "COMPLETED" ? "How was it resolved?" : "Add a note for the student"}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!chosen || mutation.isPending}>
            {mutation.isPending && <Spinner className="h-4 w-4 text-white" />} Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

// --------------------------------------------------------------------------
// Reason prompt (escalate / reopen)
// --------------------------------------------------------------------------
export function ReasonModal({
  title,
  description,
  confirmLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={title}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onSubmit(reason);
            onClose();
          } catch (err) {
            setError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-sm text-slate-600">{description}</p>
        <ErrorBox error={error} />
        <textarea className="input min-h-24" maxLength={500} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy}>
            {busy && <Spinner className="h-4 w-4 text-white" />} {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// --------------------------------------------------------------------------
// People picker (assign members / faculty / committee members)
// --------------------------------------------------------------------------
export function UserPicker({
  selected,
  onChange,
  userType,
  multiple = true,
}: {
  selected: UserBrief[];
  onChange: (users: UserBrief[]) => void;
  userType?: string;
  multiple?: boolean;
}) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useUserSearch(search, userType);
  const isSelected = (u: UserBrief) => selected.some((s) => s.id === u.id);

  function toggle(u: UserBrief) {
    if (!multiple) return onChange(isSelected(u) ? [] : [u]);
    onChange(isSelected(u) ? selected.filter((s) => s.id !== u.id) : [...selected, u]);
  }

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((u) => (
            <button key={u.id} type="button" onClick={() => toggle(u)} className="chip bg-brand-100 text-brand-800 hover:bg-brand-200">
              {u.role_name || u.full_name || u.email} ×
            </button>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
        <input className="input pl-9" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-slate-200">
        {isLoading && <div className="p-3"><Spinner /></div>}
        {data?.results.length === 0 && <p className="p-3 text-sm text-slate-500">No one found.</p>}
        {data?.results.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => toggle(u)}
            className={clsx("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50", isSelected(u) && "bg-brand-50")}
          >
            <Avatar user={u} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-slate-800">{u.full_name || u.email}</span>
              <span className="block truncate text-xs text-slate-500">{u.role_name || u.email || u.user_type}</span>
            </span>
            {isSelected(u) && <Check className="h-4 w-4 text-brand-600" />}
          </button>
        ))}
      </div>
    </div>
  );
}
