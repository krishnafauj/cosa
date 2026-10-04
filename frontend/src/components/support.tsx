"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, EyeOff, Hand, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { IssueCard, Me } from "@/lib/types";
import { ErrorBox, Modal, Spinner } from "./ui";

export type MySupport = "PUBLIC" | "PRIVATE" | null;

/** Students other than the raiser can support an open issue once their profile is complete. */
export function canSupport(user: Me | null, issue: Pick<IssueCard, "created_by" | "status">) {
  return Boolean(user && user.user_type === "STUDENT" && user.profile_complete && issue.created_by.id !== user.id && issue.status !== "COMPLETED");
}

/** Number of students on an issue: the raiser + everyone supporting it (public and private). */
export function StudentCount({ count, className }: { count: number; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1", className)} title={`${count} student${count === 1 ? "" : "s"} facing this`}>
      <Users className="h-3.5 w-3.5" /> {count}
    </span>
  );
}

/** Choose public / private support, or withdraw it. */
export function SupportModal({
  issueId,
  issueTitle,
  current,
  onClose,
}: {
  issueId: number;
  issueTitle: string;
  current: MySupport;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [choice, setChoice] = useState<"PUBLIC" | "PRIVATE">(current ?? "PUBLIC");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["board"] });
    qc.invalidateQueries({ queryKey: ["issue", issueId] });
    qc.invalidateQueries({ queryKey: ["supporters", issueId] });
  };
  const save = useMutation({
    mutationFn: () => api(`/api/issues/${issueId}/support/`, { method: "POST", body: { private: choice === "PRIVATE" } }),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });
  const withdraw = useMutation({
    mutationFn: () => api(`/api/issues/${issueId}/unsupport/`, { method: "POST" }),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  const options = [
    {
      value: "PUBLIC" as const,
      icon: UserRound,
      title: "Raise publicly",
      text: `Your name and roll number (${user?.roll_number || "—"}) appear on this issue for everyone.`,
    },
    {
      value: "PRIVATE" as const,
      icon: EyeOff,
      title: "Raise privately",
      text: "Only the number of students goes up. Your name is visible to COSA only.",
    },
  ];

  return (
    <Modal open onClose={onClose} title="Raise this issue too">
      <p className="text-sm text-slate-600">
        <span className="font-medium text-slate-900">{issueTitle}</span>
        <br />
        Facing this too? Raising it with others tells COSA how many students are affected.
      </p>
      <div className="mt-4 space-y-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setChoice(o.value)}
            className={clsx(
              "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition",
              choice === o.value ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300",
            )}
          >
            <o.icon className={clsx("mt-0.5 h-5 w-5 shrink-0", choice === o.value ? "text-brand-700" : "text-slate-400")} />
            <span className="flex-1">
              <span className="block text-sm font-medium text-slate-900">{o.title}</span>
              <span className="block text-sm text-slate-500">{o.text}</span>
            </span>
            {choice === o.value && <Check className="h-5 w-5 text-brand-700" />}
          </button>
        ))}
      </div>
      <div className="mt-3"><ErrorBox error={save.error || withdraw.error} /></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {current ? (
          <button className="btn-ghost text-rose-600 hover:bg-rose-50" onClick={() => withdraw.mutate()} disabled={withdraw.isPending}>
            Withdraw my raise
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending || choice === current}>
            {save.isPending && <Spinner className="h-4 w-4 text-white" />}
            {current ? "Save" : "Raise it"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Small button for board cards. It lives inside a <Link>, so it stops the click from navigating. */
export function SupportButton({ issue }: { issue: IssueCard }) {
  const [open, setOpen] = useState(false);
  const mine = issue.my_support;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        draggable={false}
        className={clsx(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition",
          mine ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-brand-200 bg-white text-brand-800 hover:bg-brand-50",
        )}
      >
        {mine ? <Check className="h-3.5 w-3.5" /> : <Hand className="h-3.5 w-3.5" />}
        {mine === "PRIVATE" ? "Raised privately" : mine ? "Raised" : "Raise"}
      </button>
      {open &&
        // Rendered outside the card's <a> so clicks in the dialog never open the issue.
        createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <SupportModal issueId={issue.id} issueTitle={issue.title} current={mine} onClose={() => setOpen(false)} />
          </div>,
          document.body,
        )}
    </>
  );
}
