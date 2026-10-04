"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus } from "lucide-react";
import { useState } from "react";
import { EventCard, EventForm } from "@/components/cosa";
import { EmptyState, ErrorBox, PageHeader, PageLoader, Tabs } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { CampusEvent, Club, Paginated } from "@/lib/types";

type When = "upcoming" | "today" | "past";

export default function EventsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [when, setWhen] = useState<When>("upcoming");
  const [club, setClub] = useState("");
  const [creating, setCreating] = useState(false);

  const clubs = useQuery({ queryKey: ["clubs"], queryFn: () => api<Paginated<Club>>("/api/cosa/clubs/?page_size=100") });
  const events = useQuery({
    queryKey: ["events", when, club],
    queryFn: () => api<Paginated<CampusEvent>>(`/api/cosa/events/${qs({ when, club, page_size: 50 })}`),
  });

  async function cancel(id: number) {
    if (!window.confirm("Cancel this event? Everyone will be notified.")) return;
    await api(`/api/cosa/events/${id}/cancel/`, { method: "POST" });
    qc.invalidateQueries({ queryKey: ["events"] });
  }

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="What's happening across every club and committee at IIIT Raichur."
        actions={
          user?.is_cosa && (
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Create event
            </button>
          )
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Tabs
          value={when}
          onChange={setWhen}
          tabs={[
            { value: "upcoming", label: "Upcoming" },
            { value: "today", label: "Today" },
            { value: "past", label: "Past" },
          ]}
        />
        <select className="input sm:w-56" value={club} onChange={(e) => setClub(e.target.value)} aria-label="Club">
          <option value="">All clubs</option>
          {clubs.data?.results.map((c) => (
            <option key={c.id} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </div>

      <ErrorBox error={events.error} />
      {events.isLoading ? (
        <PageLoader />
      ) : events.data?.results.length === 0 ? (
        <EmptyState icon={<CalendarDays className="h-10 w-10" />} title="No events here" text="Check back soon — clubs post their events here." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {events.data?.results.map((e) => <EventCard key={e.id} event={e} onCancel={() => cancel(e.id)} />)}
        </div>
      )}

      {creating && <EventForm clubs={clubs.data?.results ?? []} onClose={() => setCreating(false)} />}
    </>
  );
}
