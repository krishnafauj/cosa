"use client";

import { useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { AlertTriangle, Bell, CalendarDays, CheckCheck, ClipboardList, Megaphone, MessageSquare, RotateCcw, UserCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorBox, PageHeader, PageLoader, Tabs, Spinner } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { Notification, Paginated } from "@/lib/types";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ISSUE_CREATED: ClipboardList,
  ISSUE_ASSIGNED: UserCheck,
  ISSUE_TAGGED: UserCheck,
  ISSUE_STATUS: ClipboardList,
  ISSUE_UPDATE: Megaphone,
  ISSUE_REMARK: MessageSquare,
  ISSUE_ESCALATED: AlertTriangle,
  ISSUE_REOPENED: RotateCcw,
  ISSUE_OVERDUE: AlertTriangle,
  COSA_POST: Megaphone,
  EVENT: CalendarDays,
  COMMITTEE: Users,
};

function linkFor(n: Notification) {
  if (!n.target_id) return null;
  switch (n.target_type) {
    case "issue":
      return `/issues/${n.target_id}`;
    case "event":
      return "/events";
    case "post":
    case "committee":
      return "/cosa";
    default:
      return null;
  }
}

type Filter = "all" | "unread" | "issues" | "campus";

export default function NotificationsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  const params =
    filter === "unread" ? { is_read: "false" } : filter === "issues" ? { target_type: "issue" } : {};
    
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["notifications", filter],
    queryFn: ({ pageParam = 1 }) => api<Paginated<Notification>>(`/api/notifications/${qs({ ...params, page_size: 20, page: pageParam })}`),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.next) return undefined;
      const url = new URL(lastPage.next);
      return Number(url.searchParams.get("page") || 1);
    },
    refetchInterval: 60000,
  });

  const list = data?.pages.flatMap((p) => p.results) ?? [];
  const items = filter === "campus" ? list.filter((n) => n.target_type !== "issue") : list;

  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const readAll = useMutation({ mutationFn: () => api("/api/notifications/read-all/", { method: "POST" }), onSuccess: refresh });
  const readOne = useMutation({ mutationFn: (id: number) => api(`/api/notifications/${id}/read/`, { method: "POST" }), onSuccess: refresh });

  function open(n: Notification) {
    if (!n.is_read) readOne.mutate(n.id);
    const href = linkFor(n);
    if (href) router.push(href);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        subtitle="Updates on your issues, new events and COSA announcements."
        actions={
          <button className="btn-secondary" onClick={() => readAll.mutate()} disabled={readAll.isPending}>
            <CheckCheck className="h-4 w-4" /> Mark all as read
          </button>
        }
      />
      <Tabs
        value={filter}
        onChange={setFilter as (val: string) => void}
        tabs={[
          { value: "all", label: "All" },
          { value: "unread", label: "Unread" },
          { value: "issues", label: "Issues" },
          { value: "campus", label: "Events & COSA" },
        ]}
      />
      <ErrorBox error={error} />
      {isLoading ? (
        <PageLoader />
      ) : !items?.length ? (
        <EmptyState icon={<Bell className="h-10 w-10" />} title="You're all caught up" text="New notifications will show up here." />
      ) : (
        <div className="space-y-4">
          <ul className="card divide-y divide-slate-100 overflow-hidden">
            {items.map((n) => {
              const Icon = ICONS[n.kind] ?? Bell;
              const urgent = n.kind === "ISSUE_ESCALATED" || n.kind === "ISSUE_OVERDUE";
              return (
                <li key={n.id}>
                  <button
                    onClick={() => open(n)}
                    className={clsx("flex w-full gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50", !n.is_read && "bg-brand-50/50")}
                  >
                    <span
                      className={clsx(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        urgent ? "bg-amber-100 text-amber-700" : "bg-brand-100 text-brand-700",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={clsx("block text-sm", n.is_read ? "text-slate-700" : "font-semibold text-slate-900")}>{n.title}</span>
                      {n.message && <span className="mt-0.5 line-clamp-2 block text-sm text-slate-500">{n.message}</span>}
                      <span className="mt-1 block text-xs text-slate-400">
                        {n.actor_name && `${n.actor_name} · `}
                        {timeAgo(n.created_at)}
                      </span>
                    </span>
                    {!n.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <button
                className="btn-secondary"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? <><Spinner className="h-4 w-4" /> Loading...</> : "Load older notifications"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
