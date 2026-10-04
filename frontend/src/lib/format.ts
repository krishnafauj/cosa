import type { IssueStatus, Priority } from "./types";

export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [604800, "week"],
    [2592000, "month"],
    [31536000, "year"],
  ];
  let label = "";
  for (let i = units.length - 1; i >= 0; i--) {
    const [secs, name] = units[i];
    if (diff >= secs) {
      const n = Math.floor(diff / secs);
      label = `${n} ${name}${n > 1 ? "s" : ""} ago`;
      break;
    }
  }
  return label;
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export const STATUS_META: Record<IssueStatus, { label: string; chip: string; dot: string }> = {
  NOT_STARTED: { label: "Not Started", chip: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  IN_PROGRESS: { label: "Under Process", chip: "bg-brand-100 text-brand-800", dot: "bg-brand-500" },
  BLOCKED: { label: "Blocked", chip: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  COMPLETED: { label: "Completed", chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
};

export const STATUS_ORDER: IssueStatus[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED"];

export const PRIORITY_META: Record<Priority, { label: string; chip: string }> = {
  LOW: { label: "Low", chip: "bg-slate-100 text-slate-600" },
  MEDIUM: { label: "Medium", chip: "bg-sky-100 text-sky-700" },
  HIGH: { label: "High", chip: "bg-amber-100 text-amber-800" },
  URGENT: { label: "Urgent", chip: "bg-rose-100 text-rose-700" },
};

export function initials(name: string | null | undefined, fallback = "?") {
  if (!name) return fallback;
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
