import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
        .select("id,request_id,event_name,organization,status,kind,start_at,end_at,participants,venues(name)")
        .eq("user_id", user!.id)
        .order("start_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const rows = q.data ?? [];

  type Row = (typeof rows)[number];

  const groups = useMemo(() => {
    const byRequest = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.request_id ?? r.id;
      const list = byRequest.get(key);
      if (list) list.push(r);
      else byRequest.set(key, [r]);
    }
    return Array.from(byRequest.values()).map((list) => {
      const days = [...list].sort((a, b) => a.start_at.localeCompare(b.start_at));
      return {
        key: days[0]!.request_id ?? days[0]!.id,
        linkId: days[0]!.id,
        eventName: days[0]!.event_name,
        organization: days[0]!.organization,
        status: days[0]!.status,
        kind: days[0]!.kind,
        participants: days[0]!.participants,
        venue: days[0]!.venues?.name ?? "Obiekt",
        days,
      };
    });
  }, [rows]);

  const count = (key: StatusFilter) =>
    key === "all" ? groups.length : groups.filter((g) => g.status === key).length;
  const visible = groups.filter((g) => filter === "all" || g.status === filter);
  const now = new Date();
  const upcoming = visible.filter((g) => new Date(g.days[g.days.length - 1]!.end_at) >= now);
  const past = visible.filter((g) => new Date(g.days[g.days.length - 1]!.end_at) < now);

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
          {upcoming.length > 0 && <Section title="Nadchodzące" groups={upcoming} />}
          {past.length > 0 && <Section title="Minione" groups={past} />}
        </div>
      )}
    </div>
  );
}

type Group = {
  key: string;
  linkId: string;
  eventName: string;
  organization: string;
  status: string;
  kind: string;
  participants: number;
  venue: string;
  days: { start_at: string; end_at: string }[];
};

function dayCountLabel(n: number) {
  return n === 1 ? "1 dzień" : `${n} dni`;
}

function Section({ title, groups }: { title: string; groups: Group[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">{title}</h2>
      <ul className="space-y-3">
        {groups.map((g) => {
          const first = g.days[0]!;
          const last = g.days[g.days.length - 1]!;
          const multi = g.days.length > 1;
          const sameMonth = multi && format(new Date(first.start_at), "yyyy-MM") === format(new Date(last.start_at), "yyyy-MM");
          return (
            <li key={g.key}>
              <Link
                to="/wniosek/$id"
                params={{ id: g.linkId }}
                className="flex items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-secondary/40"
              >
                <div className="w-16 shrink-0 text-center">
                  {multi ? (
                    <>
                      <div className="font-display text-xl leading-none">
                        {format(new Date(first.start_at), "d")}
                        {sameMonth ? `–${format(new Date(last.start_at), "d")}` : ""}
                      </div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        {format(new Date(first.start_at), "MMM", { locale: pl })}
                        {!sameMonth && `–${format(new Date(last.start_at), "MMM", { locale: pl })}`}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-display text-2xl leading-none">{format(new Date(first.start_at), "d")}</div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{format(new Date(first.start_at), "MMM", { locale: pl })}</div>
                    </>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{g.eventName}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[g.status] ?? "bg-secondary")}>
                      {STATUS_LABEL[g.status] ?? g.status}
                    </span>
                    {g.kind === "event" && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">Wydarzenie</span>}
                    {multi && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{dayCountLabel(g.days.length)}</span>}
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {g.venue} · {g.organization}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="size-3.5" />
                      {multi
                        ? `${format(new Date(first.start_at), "d MMM", { locale: pl })} – ${format(new Date(last.start_at), "d MMM", { locale: pl })}, ${format(new Date(first.start_at), "HH:mm")}–${format(new Date(first.end_at), "HH:mm")}`
                        : `${format(new Date(first.start_at), "HH:mm")}–${format(new Date(first.end_at), "HH:mm")}`}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5" />
                      {g.participants}
                    </span>
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
