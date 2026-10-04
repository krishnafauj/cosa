"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Bell, ChevronDown, LogOut, Mail, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Me } from "@/lib/types";
import { Avatar } from "./ui";

function navFor(user: Me) {
  const items = [{ href: "/board", label: "Issue Board" }];
  if (user.can_raise_issues) items.push({ href: "/my-issues", label: "Issues by You" });
  if (user.is_cosa) items.push({ href: "/cosa/dashboard", label: "COSA Console" });
  items.push({ href: "/events", label: "Events" }, { href: "/clubs", label: "Clubs" }, { href: "/cosa", label: "COSA" });
  return items;
}

function isActive(pathname: string, href: string) {
  if (href === "/cosa") return pathname === "/cosa" || (pathname.startsWith("/cosa/") && !pathname.startsWith("/cosa/dashboard"));
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: unread } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => api<{ unread: number }>("/api/notifications/unread-count/"),
    refetchInterval: 60_000,
    enabled: Boolean(user),
  });

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!user) return null;
  const nav = navFor(user);
  const unreadCount = unread?.unread ?? 0;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Utility bar, like iiitr.ac.in */}
      <div className="bg-brand-950 text-xs text-brand-100">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-1.5 sm:px-6">
          <span className="truncate">Council of Student Affairs · IIIT Raichur</span>
          <div className="hidden items-center gap-4 sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Raichur, Karnataka
            </span>
            <a href="mailto:gensec_1@students.iiitr.ac.in" className="inline-flex items-center gap-1.5 hover:text-white">
              <Mail className="h-3.5 w-3.5" /> Contact COSA
            </a>
            <a href="https://iiitr.ac.in" target="_blank" rel="noreferrer" className="hover:text-white">
              iiitr.ac.in ↗
            </a>
          </div>
        </div>
      </div>

      {/* Logo row */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/board" className="flex min-w-0 items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/iiitr-logo.png" alt="IIIT Raichur" className="h-10 w-auto sm:h-12" />
            <span className="hidden h-10 w-px bg-slate-200 md:block" />
            <span className="hidden flex-col md:flex">
              <span className="text-base font-semibold text-brand-900">COSA Portal</span>
              <span className="text-xs text-slate-500">Issues · Updates · Events</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/notifications"
              className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100"
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] rounded-full bg-amber-500 px-1 text-center text-[10px] leading-[18px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>

            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-slate-100">
                <Avatar user={user} />
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[160px] truncate text-sm font-medium text-slate-800">{user.full_name || user.email}</span>
                  <span className="block text-xs text-slate-500">
                    {user.role_name || (user.roll_number ? `${user.roll_number} · ${user.branch}` : user.user_type.toLowerCase())}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-medium text-slate-900">{user.full_name || "—"}</p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                    {user.role_name && <p className="mt-1 text-xs font-medium text-brand-700">{user.role_name}</p>}
                    {user.branch_label && (
                      <p className="mt-1 text-xs text-slate-500">
                        {user.roll_number} · {user.branch} · Sem {user.semester}
                      </p>
                    )}
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <UserRound className="h-4 w-4" /> My profile
                  </Link>
                  <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation bar */}
      <nav className="sticky top-0 z-30 bg-brand-800 shadow-sm">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 sm:px-4">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                isActive(pathname, item.href)
                  ? "border-amber-400 text-white"
                  : "border-transparent text-brand-100 hover:bg-brand-700 hover:text-white",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>

      <footer className="bg-brand-950 text-brand-200">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 text-sm sm:grid-cols-3 sm:px-6">
          <div>
            <p className="font-semibold text-white">COSA Portal</p>
            <p className="mt-2 text-brand-300">Council of Student Affairs, Indian Institute of Information Technology Raichur.</p>
          </div>
          <div>
            <p className="font-semibold text-white">Quick links</p>
            <ul className="mt-2 space-y-1">
              <li><Link href="/board" className="hover:text-white">Issue Board</Link></li>
              <li><Link href="/events" className="hover:text-white">Upcoming events</Link></li>
              <li><Link href="/cosa" className="hover:text-white">COSA updates</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">Institute</p>
            <ul className="mt-2 space-y-1">
              <li><a href="https://iiitr.ac.in" target="_blank" rel="noreferrer" className="hover:text-white">iiitr.ac.in</a></li>
              <li>Raichur, Karnataka</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-3 text-center text-xs text-brand-300">
          © {new Date().getFullYear()} IIIT Raichur · COSA
        </div>
      </footer>
    </div>
  );
}
