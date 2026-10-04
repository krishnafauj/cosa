"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RaiseIssueModal, ReasonModal } from "@/components/issues";
import { EmptyState, ErrorBox, PageHeader, PageLoader, PriorityBadge, StatusBadge, Tabs } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { MyIssue, Paginated } from "@/lib/types";

type Filter = "open" | "COMPLETED" | "all";

export default function MyIssuesPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("open");
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [action, setAction] = useState<{ kind: "escalate" | "reopen"; issue: MyIssue } | null>(null);

  const statusParam = filter === "open" ? ["NOT_STARTED", "IN_PROGRESS", "BLOCKED"] : filter === "COMPLETED" ? ["COMPLETED"] : [];
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-issues", filter],
    queryFn: () => api<Paginated<MyIssue>>(`/api/issues/mine/${qs({ status: statusParam, page_size: 100 })}`),
  });

  return (
    <>
      <PageHeader
        title="Issues by You"
        subtitle="Track what you raised. If an issue sits unresolved for 5 days, you can raise it to the President."
        actions={
          <button className="btn-primary" onClick={() => setRaiseOpen(true)}>
            <Plus className="h-4 w-4" /> Raise an issue
          </button>
        }
      />
      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: "open", label: "Open" },
          { value: "COMPLETED", label: "Completed" },
          { value: "all", label: "All" },
        ]}
      />
      <ErrorBox error={error} />
      {isLoading ? (
        <PageLoader />
      ) : data?.results.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title="Nothing here yet"
          text="Issues you raise will show up here with their status and updates."
          action={<button className="btn-primary" onClick={() => setRaiseOpen(true)}>Raise your first issue</button>}
        />
      ) : (
        <div className="space-y-3">
          {data?.results.map((issue) => (
            <div key={issue.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <Link href={`/issues/${issue.id}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400">#{issue.id}</span>
                  <StatusBadge status={issue.status} />
                  <PriorityBadge priority={issue.priority} />
                  <span className="chip bg-brand-50 text-brand-700">{issue.category.name}</span>
                  {issue.is_escalated && <span className="chip bg-amber-100 text-amber-800">Escalated</span>}
                </div>
                <p className="mt-1.5 font-medium text-slate-900 hover:text-brand-800">{issue.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Raised {timeAgo(issue.created_at)} · {issue.assignees.length ? `With ${issue.assignees.map((a) => a.role_name || a.full_name).join(", ")}` : "Waiting for assignment"}
                </p>
              </Link>
              <div className="flex shrink-0 flex-col items-stretch gap-1 sm:w-52">
                {issue.status !== "COMPLETED" && !issue.is_escalated && (
                  <>
                    <button
                      className={issue.can_escalate ? "btn bg-amber-500 text-white hover:bg-amber-600" : "btn-secondary"}
                      disabled={!issue.can_escalate}
                      onClick={() => setAction({ kind: "escalate", issue })}
                    >
                      <AlertTriangle className="h-4 w-4" /> Raise to President
                    </button>
                    {!issue.can_escalate && (
                      <span className="text-center text-xs text-slate-400">from {formatDateTime(issue.escalation_available_at)}</span>
                    )}
                  </>
                )}
                {issue.can_reopen && (
                  <button className="btn-secondary" onClick={() => setAction({ kind: "reopen", issue })}>
                    <RotateCcw className="h-4 w-4" /> Reopen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <RaiseIssueModal open={raiseOpen} onClose={() => setRaiseOpen(false)} />
      {action && (
        <ReasonModal
          title={action.kind === "escalate" ? "Raise to President" : "Reopen issue"}
          description={
            action.kind === "escalate"
              ? "Tell the President why this needs attention."
              : "Explain what is still not fixed. The 5-day escalation timer restarts."
          }
          confirmLabel={action.kind === "escalate" ? "Escalate" : "Reopen"}
          onClose={() => setAction(null)}
          onSubmit={async (reason) => {
            await api(`/api/issues/${action.issue.id}/${action.kind}/`, { method: "POST", body: { reason } });
            qc.invalidateQueries({ queryKey: ["my-issues"] });
            qc.invalidateQueries({ queryKey: ["board"] });
          }}
        />
      )}
    </>
  );
}
