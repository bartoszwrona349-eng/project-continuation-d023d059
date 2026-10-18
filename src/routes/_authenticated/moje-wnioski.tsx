import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { CalendarDays, ChevronRight, Inbox, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const STATUS_LABEL: Record<string, string> = {
  pending: "Oczekuje",
  approved: "Zatwierdzony",
  rejected: "Odrzucony",
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-slot-pending text-slot-pending-foreground",
  approved: "bg-slot-admin text-slot-admin-foreground",
  rejected: "bg-destructive/10 text-destructive",
};

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Wszystkie" },
  { key: "pending", label: "Oczekujące" },
  { key: "approved", label: "Zatwierdzone" },
  { key: "rejected", label: "Odrzucone" },
];

export const Route = createFileRoute("/_authenticated/moje-wnioski")({
  head: () => ({
    meta: [
      { title: "Moje wnioski" },
      { name: "description", content: "Lista wniosków o rezerwację złożonych przez Ciebie wraz z ich statusem." },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Moje wnioski" },
      { property: "og:description", content: "Sprawdź status swoich wniosków o rezerwację." },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyRequests,
});

export function MyRequests() {
  const { user } = useSession();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const q = useQuery({
    queryKey: ["my-bookings", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,event_name,organization,status,kind,start_at,end_at,participants,venues(name)")
        .eq("user_id", user!.id)
        .order("start_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const rows = q.data ?? [];
  const count = (key: StatusFilter) => (key === "all" ? rows.length : rows.filter((r) => r.status === key).length);
  const visible = rows.filter((r) => filter === "all" || r.status === filter);
  const now = new Date();
  const upcoming = visible.filter((r) => new Date(r.end_at) >= now);
  const past = visible.filter((r) => new Date(r.end_at) < now);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-widest text-accent">Twoje sprawy</p>
          <h1 className="text-4xl font-semibold">Moje wnioski</h1>
        </div>
        <Button asChild>
          <Link to="/">Nowy wniosek</Link>
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              filter === f.key ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
            <span className="ml-2 opacity-70">{" "}{count(f.key)}</span>
          </button>
        ))}
      </div>

      {q.isLoading && <p className="text-muted-foreground">Wczytywanie…</p>}

      {!q.isLoading && rows.length === 0 && (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <Inbox className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Nie złożyłeś jeszcze żadnego wniosku</p>
          <p className="mt-1 text-sm text-muted-foreground">Wybierz wolne godziny w kalendarzu i prześlij wniosek o rezerwację.</p>
          <Button asChild className="mt-5">
            <Link to="/">Przejdź do kalendarza</Link>
          </Button>
        </div>
      )}

      {!q.isLoading && rows.length > 0 && visible.length === 0 && (
        <p className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          Brak wniosków o tym statusie.
        </p>
      )}

      {!q.isLoading && visible.length > 0 && (
        <div className="space-y-8">
          {upcoming.length > 0 && <Section title="Nadchodzące" rows={upcoming} />}
          {past.length > 0 && <Section title="Minione" rows={past} />}
        </div>
      )}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: { id: string; event_name: string; organization: string; status: string; kind: string; start_at: string; end_at: string; participants: number; venues: { name: string } | null }[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">{title}</h2>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              to="/wniosek/$id"
              params={{ id: r.id }}
              className="flex items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-secondary/40"
            >
              <div className="w-16 shrink-0 text-center">
                <div className="font-display text-2xl leading-none">{format(new Date(r.start_at), "d")}</div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{format(new Date(r.start_at), "MMM", { locale: pl })}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{r.event_name}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[r.status] ?? "bg-secondary")}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  {r.kind === "event" && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">Wydarzenie</span>}
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {r.venues?.name ?? "Obiekt"} · {r.organization}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3.5" />
                    {format(new Date(r.start_at), "HH:mm")}–{format(new Date(r.end_at), "HH:mm")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" />
                    {r.participants}
                  </span>
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
