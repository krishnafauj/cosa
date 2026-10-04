"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AppShell from "@/components/AppShell";
import { PageLoader } from "@/components/ui";
import { useAuth } from "@/lib/auth";

/** Every page in this folder needs a logged-in user. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const needsProfile = Boolean(user && !user.profile_complete);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (needsProfile) router.replace("/onboarding");
  }, [loading, user, needsProfile, router]);

  if (loading || !user || needsProfile) return <PageLoader />;
  return <AppShell>{children}</AppShell>;
}
