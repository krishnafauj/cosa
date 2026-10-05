"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Maximize2, Plus, Search, Table2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { IssueTableOverlay, type TableState } from "@/components/IssueTable";
import { IssueCardView, RaiseIssueModal, StatusChangeModal } from "@/components/issues";
import { ErrorBox, PageHeader, PageLoader, Spinner } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STATUS_META, STATUS_ORDER } from "@/lib/format";
import { canEditCard, useCategories } from "@/lib/hooks";
import { LoadMore, useDebounced, useInfiniteList } from "@/lib/infinite";
import type { IssueCard, IssueStatus, Me } from "@/lib/types";

const QUICK_FILTERS = [
  { key: "assignee", value: "me", label: "Assigned to me", cosaOnly: true },
  { key: "my_category", value: "true", label: "My category", cosaOnly: true },
  { key: "unassigned", value: "true", label: "Unassigned", cosaOnly: true },
  { key: "is_escalated", value: "true", label: "Escalated", cosaOnly: false },
  { key: "overdue", value: "true", label: "Overdue (5+ days)", cosaOnly: false },
] as const;

const COLUMN_PAGE_SIZE = 15;

/** One status column: fixed height, its own scrollbar, its own infinite list. */
function BoardColumnView({
  status,
  filters,
  user,
  over,
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onExpand,
}: {
  status: IssueStatus;
  filters: Record<string, string>;
  user: Me;
  over: boolean;
  dragging: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragStart: (issue: IssueCard) => void;
  onExpand: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Key starts with "board" so existing invalidateQueries(["board"]) calls refresh every column.
  const { items, count, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteList<IssueCard>(
    ["board", "column", status],
    "/api/issues/",
    { ...filters, status, ordering: "-created_at" },
    COLUMN_PAGE_SIZE,
  );
  const label = STATUS_META[status].label;

  return (
    <section
      onDragOver={(e) => {
        if (!dragging) return;
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={clsx(
        // Same fixed height for all four columns; each scrolls on its own.
        "flex h-[36rem] flex-col rounded-xl bg-slate-100/80 p-3 transition",
        over && "ring-2 ring-brand-400 ring-offset-2",
      )}
    >
      <header className="mb-3 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span className={clsx("h-2.5 w-2.5 rounded-full", STATUS_META[status].dot)} />
          {label}
        </h2>
        <div className="flex items-center gap-1">
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{count}</span>
          <button
            className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-brand-800"
            onClick={onExpand}
            title={`Open ${label} as a table`}
            aria-label={`Open ${label} as a table`}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      <div
        ref={scrollRef}
        className="-mr-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]"
      >
        <ErrorBox error={error} />
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner className="h-5 w-5" /></div>
        ) : (
          <>
            {items.map((issue) => (
              <IssueCardView
                key={issue.id}
                issue={issue}
                draggable={canEditCard(user, issue) && issue.status !== "COMPLETED"}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  onDragStart(issue);
                }}
              />
            ))}
            {items.length === 0 && <p className="px-1 py-6 text-center text-xs text-slate-400">No issues</p>}
            <LoadMore root={scrollRef} hasMore={!!hasNextPage} loading={isFetchingNextPage} onLoad={() => fetchNextPage()} />
          </>
        )}
      </div>
    </section>
  );
}

function BoardInner() {
  const { user } = useAuth();
  const params = useSearchParams();
  const qc = useQueryClient();
  const { data: categories } = useCategories();

  // Every filter starts from the URL so a refresh (or a shared link) shows the same view.
  const initialQuick = QUICK_FILTERS.find((f) => params.get(f.key) === f.value)?.key ?? "";
  const [quick, setQuick] = useState<string>(initialQuick);
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [priority, setPriority] = useState(params.get("priority") ?? "");
  const [searchInput, setSearchInput] = useState(params.get("q") ?? "");
  const search = useDebounced(searchInput.trim());
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [dragged, setDragged] = useState<IssueCard | null>(null);
  const [overColumn, setOverColumn] = useState<IssueStatus | null>(null);
  const [pending, setPending] = useState<{ issue: IssueCard; target: IssueStatus } | null>(null);
  // null = board; "" = table of all statuses; a status = table opened from that column.
  const [table, setTable] = useState<IssueStatus | "" | null>(() => {
    if (params.get("view") !== "table") return null;
    const st = params.get("status") as IssueStatus | null;
    return st && STATUS_ORDER.includes(st) ? st : "";
  });
  // Table tab / search / sort, reported by the table so they can go in the URL too.
  const [tableState, setTableState] = useState<TableState>({
    status: table ?? "",
    search: params.get("tq") ?? "",
    sort: params.get("sort") ?? "-updated_at",
  });
  const [tableInitial, setTableInitial] = useState<Partial<TableState>>(() => ({
    status: table ?? "",
    search: params.get("tq") ?? undefined,
    sort: params.get("sort") ?? undefined,
  }));

  const quickFilter = QUICK_FILTERS.find((f) => f.key === quick);
  const filters: Record<string, string> = {
    category,
    priority,
    search,
    ...(quickFilter ? { [quickFilter.key]: quickFilter.value } : {}),
  };

  function openTable(st: IssueStatus | "") {
    setTableInitial({ status: st });
    setTableState({ status: st, search: "", sort: "-updated_at" });
    setTable(st);
  }

  // Mirror the current view in the URL (replace, not push, so Back still leaves the page).
  const urlQuery = qs({
    q: search,
    category,
    priority,
    ...(quickFilter ? { [quickFilter.key]: quickFilter.value } : {}),
    ...(table !== null
      ? {
          view: "table",
          status: tableState.status,
          tq: tableState.search,
          sort: tableState.sort === "-updated_at" ? "" : tableState.sort,
        }
      : {}),
  });
  useEffect(() => {
    if (window.location.search !== urlQuery) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${urlQuery}`);
    }
  }, [urlQuery]);


  const quickStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: IssueStatus }) =>
      api(`/api/issues/${id}/status/`, { method: "POST", body: { status } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["board"] }),
  });

  if (!user) return null;

  function onDrop(target: IssueStatus) {
    setOverColumn(null);
    const issue = dragged;
    setDragged(null);
    if (!issue || issue.status === target) return;
    if (target === "BLOCKED" || target === "COMPLETED") setPending({ issue, target });
    else quickStatus.mutate({ id: issue.id, status: target });
  }

  return (
    <>
      <PageHeader
        title="Issue Board"
        subtitle={user.is_cosa ? "Drag a card to change its status. Blocked and Completed ask for an update." : "Every issue raised on campus and where it stands."}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => openTable("")} title="Show every issue in a table">
              <Table2 className="h-4 w-4" /> Table view
            </button>
            {user.can_raise_issues && (
              <button className="btn-primary" onClick={() => setRaiseOpen(true)}>
                <Plus className="h-4 w-4" /> Raise an issue
              </button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="card mb-5 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Search issues" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <select className="input lg:w-48" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="input lg:w-40" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          <option value="">Any priority</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {QUICK_FILTERS.filter((f) => !f.cosaOnly || user.is_cosa).map((f) => (
          <button
            key={f.key}
            onClick={() => setQuick(quick === f.key ? "" : f.key)}
            className={clsx(
              "chip border px-3 py-1 text-sm",
              quick === f.key ? "border-brand-700 bg-brand-800 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-brand-300",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ErrorBox error={quickStatus.error} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUS_ORDER.map((st) => (
            <BoardColumnView
              key={st}
              status={st}
              filters={filters}
              user={user}
              over={overColumn === st}
              dragging={!!dragged}
              onDragOver={() => setOverColumn(st)}
              onDragLeave={() => setOverColumn(null)}
              onDrop={() => onDrop(st)}
              onDragStart={setDragged}
              onExpand={() => openTable(st)}
            />
          ))}
        </div>

      {table !== null && (
        <IssueTableOverlay
          filters={filters}
          initial={tableInitial}
          onChange={setTableState}
          onClose={() => setTable(null)}
        />
      )}
      <RaiseIssueModal open={raiseOpen} onClose={() => setRaiseOpen(false)} />
      {pending && (
        <StatusChangeModal issueId={pending.issue.id} current={pending.issue.status} target={pending.target} onClose={() => setPending(null)} />
      )}
    </>
  );
}

export default function BoardPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <BoardInner />
    </Suspense>
  );
}
