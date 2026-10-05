"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, EyeOff, Minimize2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, downloadFile, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STATUS_META, STATUS_ORDER, formatDateTime, timeAgo } from "@/lib/format";
import type { IssueRow, IssueStatus, LatestNote, Paginated, UserBrief } from "@/lib/types";
import { StudentCount } from "./support";
import { Avatar, ErrorBox, PriorityBadge, Spinner, StatusBadge } from "./ui";

const PAGE_SIZE = 25;

type SortKey = "id" | "title" | "status" | "priority" | "upvote_count" | "created_at" | "updated_at";

function People({ users, empty }: { users: UserBrief[]; empty: string }) {
  if (!users.length) return <span className="text-slate-400 italic">{empty}</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {users.map((u) => (
        <span key={u.id} className="truncate" title={u.email || u.full_name}>
          {u.role_name || u.full_name}
        </span>
      ))}
    </div>
  );
}

function Note({ note, kind }: { note: LatestNote | null; kind: "update" | "remark" }) {
  if (!note) return <span className="text-slate-400 italic">{kind === "update" ? "No updates yet" : "No remarks"}</span>;
  const tag = note.type && note.type !== "REMARK" ? (note.type === "REOPEN" ? "Reopen" : "Escalation") : null;
  return (
    <div className="max-w-64">
      <p className="line-clamp-2 text-slate-700" title={note.body}>
        {tag && <span className="mr-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800 uppercase">{tag}</span>}
        {note.body}
      </p>
      <p className="mt-0.5 text-xs text-slate-400" title={formatDateTime(note.created_at)}>
        {note.author} · {timeAgo(note.created_at)}
      </p>
    </div>
  );
}

/**
 * Full-screen table of every issue. Opened from the expand icon on the board
 * (optionally pre-filtered to one status column). Uses the board's filters.
 */
export function IssueTableOverlay({
  filters,
  initialStatus,
  onClose,
}: {
  filters: Record<string, string>;
  initialStatus: IssueStatus | "";
  onClose: () => void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<IssueStatus | "">(initialStatus);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "updated_at", desc: true });
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);

  const params = { ...filters, status, ordering: `${sort.desc ? "-" : ""}${sort.key}` };
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["issue-table", params, page],
    queryFn: () => api<Paginated<IssueRow>>(`/api/issues/table/${qs({ ...params, page, page_size: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  });

  // Close on Escape and stop the page behind from scrolling.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => setPage(1), [status, sort.key, sort.desc]);

  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  function Th({ k, children, className }: { k?: SortKey; children: React.ReactNode; className?: string }) {
    const active = k && sort.key === k;
    return (
      <th className={clsx("sticky top-0 z-10 bg-slate-50 px-3 py-2.5 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase", className)}>
        {k ? (
          <button
            className={clsx("inline-flex items-center gap-1 uppercase hover:text-slate-800", active && "text-brand-800")}
            onClick={() => setSort((s) => (s.key === k ? { key: k, desc: !s.desc } : { key: k, desc: k !== "title" }))}
          >
            {children}
            {active && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
          </button>
        ) : (
          children
        )}
      </th>
    );
  }

  const content = (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="All issues table">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-900">All issues</h2>
        <span className="text-sm text-slate-500">{data ? `${data.count} total` : ""}</span>
        {isFetching && !isLoading && <Spinner className="h-4 w-4" />}
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {(["", ...STATUS_ORDER] as const).map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatus(s)}
              className={clsx(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
                status === s ? "bg-white text-brand-800 shadow-sm" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {s && <span className={clsx("h-2 w-2 rounded-full", STATUS_META[s].dot)} />}
              {s ? STATUS_META[s].label : "All"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {user?.is_cosa && (
            <button
              className="btn-secondary"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                setExportError(null);
                try {
                  await downloadFile(`/api/issues/export/${qs({ ...filters, status })}`, "issues.xlsx");
                } catch (e) {
                  setExportError(e);
                } finally {
                  setExporting(false);
                }
              }}
            >
              {exporting ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />} Export .xlsx
            </button>
          )}
          <button className="btn-secondary" onClick={onClose} title="Back to board (Esc)">
            <Minimize2 className="h-4 w-4" /> Board
          </button>
        </div>
      </div>

      <div className="px-4 pt-2"><ErrorBox error={error || exportError} /></div>

      {/* Table: scrolls both ways, header sticks */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center"><Spinner className="h-6 w-6" /></div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <Th k="id">#</Th>
                <Th k="title" className="min-w-64">Issue</Th>
                <Th className="min-w-48">Raised by</Th>
                <Th k="status">Status</Th>
                <Th k="priority">Priority</Th>
                <Th>Assigned to</Th>
                <Th>Tagged</Th>
                <Th>Faculty</Th>
                <Th k="upvote_count">Students</Th>
                <Th className="min-w-56">Last update (COSA)</Th>
                <Th className="min-w-56">Last remark (student)</Th>
                <Th k="created_at">Raised</Th>
                <Th k="updated_at">Updated</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.results.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer align-top hover:bg-brand-50/40"
                  onClick={() => router.push(`/issues/${r.id}`)}
                >
                  <td className="px-3 py-3 font-mono text-xs text-slate-500">#{r.id}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-900">{r.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      {r.category.name}
                      {r.is_escalated && <span className="rounded bg-rose-100 px-1 font-semibold text-rose-700">Escalated</span>}
                      {r.reopened_count > 0 && <span className="rounded bg-amber-100 px-1 font-semibold text-amber-800">Reopened ×{r.reopened_count}</span>}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar user={r.created_by} size="sm" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">{r.created_by.full_name}</p>
                        <p className="font-mono text-xs text-slate-500">{r.created_by.roll_number || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-3 whitespace-nowrap"><PriorityBadge priority={r.priority} /></td>
                  <td className="px-3 py-3 whitespace-nowrap"><People users={r.assignees} empty="Unassigned" /></td>
                  <td className="px-3 py-3 whitespace-nowrap"><People users={r.tagged_members} empty="—" /></td>
                  <td className="px-3 py-3 whitespace-nowrap"><People users={r.faculty ? [r.faculty] : []} empty="—" /></td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <StudentCount count={r.upvote_count + 1} className="text-slate-600" />
                    {r.my_support === "PRIVATE" && <EyeOff className="ml-1 inline h-3 w-3 text-slate-400" />}
                  </td>
                  <td className="px-3 py-3"><Note note={r.last_update} kind="update" /></td>
                  <td className="px-3 py-3"><Note note={r.last_remark} kind="remark" /></td>
                  <td className="px-3 py-3 text-xs whitespace-nowrap text-slate-500" title={formatDateTime(r.created_at)}>{timeAgo(r.created_at)}</td>
                  <td className="px-3 py-3 text-xs whitespace-nowrap text-slate-500" title={formatDateTime(r.updated_at)}>{timeAgo(r.updated_at)}</td>
                </tr>
              ))}
              {data && data.results.length === 0 && (
                <tr><td colSpan={13} className="px-3 py-12 text-center text-slate-400">No issues match these filters.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm text-slate-600">
        <span>Page {page} of {pages}</span>
        <div className="flex gap-1">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <button className="btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
