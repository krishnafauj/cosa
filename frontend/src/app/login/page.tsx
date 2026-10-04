"use client";

import { GoogleLogin } from "@react-oauth/google";
import { ClipboardList, Megaphone, CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorBox, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";

const GOOGLE_ENABLED = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
const DEV_LOGIN = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true";

const QUICK_ACCOUNTS = [
  { label: "New student (first login)", email: "cs25b1001@iiitr.ac.in" },
  { label: "Student", email: "student1@students.iiitr.ac.in" },
  { label: "Gen Sec 1", email: "gensec_1@students.iiitr.ac.in" },
  { label: "President", email: "president@iiitr.ac.in" },
  { label: "Mess Secretary", email: "messsecretary@iiitr.ac.in" },
];

export default function LoginPage() {
  const { user, loading, loginWithGoogle, devLogin } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/board");
  }, [loading, user, router]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.replace("/board");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white lg:flex-row">
      {/* Left: brand panel */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-brand-900 px-8 py-10 text-white lg:w-[46%] lg:px-14 lg:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="relative">
          <p className="text-xs font-semibold tracking-[0.2em] text-brand-200 uppercase">Council of Student Affairs</p>
          <h1 className="mt-4 text-3xl leading-tight font-semibold lg:text-4xl">
            One place for every
            <br />
            campus matter.
          </h1>
          <p className="mt-4 max-w-md text-brand-100/90">
            Raise issues, follow their progress, and stay on top of COSA updates, club events and committees at IIIT Raichur.
          </p>
        </div>
        <ul className="relative mt-10 space-y-4 text-sm text-brand-100">
          <li className="flex items-center gap-3">
            <ClipboardList className="h-5 w-5 text-amber-300" /> Track issues from raised to resolved
          </li>
          <li className="flex items-center gap-3">
            <Megaphone className="h-5 w-5 text-amber-300" /> Official COSA updates in one feed
          </li>
          <li className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-amber-300" /> Upcoming events from every club
          </li>
        </ul>
      </div>

      {/* Right: sign in */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/iiitr-logo.png" alt="Indian Institute of Information Technology Raichur" className="mb-10 h-auto w-full max-w-[340px]" />
          <h2 className="text-xl font-semibold text-slate-900">Sign in to the COSA Portal</h2>
          <p className="mt-1 text-sm text-slate-500">Use your IIITR email, e.g. cs23b1036@iiitr.ac.in.</p>

          <div className="mt-6 space-y-4">
            <ErrorBox error={error} />

            {GOOGLE_ENABLED ? (
              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={(res) => res.credential && run(() => loginWithGoogle(res.credential!))}
                  onError={() => setError(new Error("Google sign-in was cancelled or failed."))}
                  width="320"
                  text="signin_with"
                  shape="pill"
                />
              </div>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Google sign-in isn&apos;t configured yet. Set <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> in <code>.env.local</code>.
              </p>
            )}

            {DEV_LOGIN && (
              <div className="rounded-xl border border-dashed border-slate-300 p-4">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Development login</p>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (email) run(() => devLogin(email));
                  }}
                >
                  <input className="input" type="email" placeholder="cs23b1036@iiitr.ac.in" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <button className="btn-primary shrink-0" disabled={busy || !email}>
                    {busy ? <Spinner className="h-4 w-4 text-white" /> : "Go"}
                  </button>
                </form>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {QUICK_ACCOUNTS.map((a) => (
                    <button
                      key={a.email}
                      type="button"
                      onClick={() => run(() => devLogin(a.email))}
                      className="chip border border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-800"
                      disabled={busy}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
