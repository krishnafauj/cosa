"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { AlertTriangle, Clock, Inbox, LayoutGrid, Tag, UserCheck } from "lucide-react";
import Link from "next/link";
import { EmptyState, ErrorBox, PageHeader, PageLoader } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STATUS_META, STATUS_ORDER } from "@/lib/format";
import type { Dashboard } from "@/lib/types";

export default function CosaDashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["cosa-dashboard"],
    queryFn: () => api<Dashboard>("/api/cosa/dashboard/"),
    enabled: Boolean(user?.is_cosa),
  });

  if (!user?.is_cosa) return <EmptyState title="COSA only" text="This console is for COSA members." />;
  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorBox error={error} />;

  const tiles = [
    { label: "Assigned to me", value: data.assigned_to_me, href: "/board?assignee=me", icon: UserCheck, tone: "brand" },
    ...(data.my_category !== null
      ? [{ label: `${user.owned_category?.name ?? "My"} issues`, value: data.my_category, href: "/board?my_category=true", icon: Tag, tone: "brand" }]
      : []),
    { label: "Unassigned", value: data.unassigned, href: "/board?unassigned=true", icon: Inbox, tone: "slate" },
    { label: "Escalated", value: data.escalated, href: "/board?is_escalated=true", icon: AlertTriangle, tone: "amber" },
    { label: "Overdue (5+ days)", value: data.overdue, href: "/board?overdue=true", icon: Clock, tone: "rose" },
  ] as const;

  const total = STATUS_ORDER.reduce((s, k) => s + (data.by_status[k] ?? 0), 0) || 1;
  const maxCat = Math.max(1, ...data.by_category.map((c) => c.n));

  return (
    <>
      <PageHeader
        title="COSA Console"
        subtitle={`${user.role_name}${user.can_manage_issues ? " · you can assign members and faculty" : ""}`}
        actions={
          <>
            <Link href="/board" className="btn-secondary"><LayoutGrid className="h-4 w-4" /> Open board</Link>
            <Link href="/cosa" className="btn-primary">Post on COSA page</Link>
          </>
        }
      />

      <div className={clsx("grid gap-3 sm:grid-cols-2", tiles.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="card group p-4 transition hover:border-brand-300">
            <t.icon
              className={clsx(
                "h-5 w-5",
                t.tone === "amber" ? "text-amber-500" : t.tone === "rose" ? "text-rose-500" : t.tone === "slate" ? "text-slate-500" : "text-brand-600",
              )}
            />
            <p className="mt-3 text-3xl font-semibold text-slate-900 tabular-nums">{t.value}</p>
            <p className="mt-1 text-sm text-slate-500 group-hover:text-brand-800">{t.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold text-slate-900">All issues by status</h2>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
            {STATUS_ORDER.map((s) => (
              <div key={s} className={STATUS_META[s].dot} style={{ width: `${((data.by_status[s] ?? 0) / total) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {STATUS_ORDER.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <span className={clsx("h-2.5 w-2.5 rounded-full", STATUS_META[s].dot)} />
                <span className="text-slate-600">{STATUS_META[s].label}</span>
                <span className="ml-auto font-medium text-slate-900 tabular-nums">{data.by_status[s] ?? 0}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="font-semibold text-slate-900">Open issues by category</h2>
          {data.by_category.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No open issues right now.</p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {data.by_category.map((c) => (
                <li key={c.category__name} className="grid grid-cols-[140px_1fr_32px] items-center gap-3 text-sm">
                  <span className="truncate text-slate-600">{c.category__name}</span>
                  <span className="h-2 rounded-full bg-brand-500" style={{ width: `${(c.n / maxCat) * 100}%` }} />
                  <span className="text-right font-medium text-slate-900 tabular-nums">{c.n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
