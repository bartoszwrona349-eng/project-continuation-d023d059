import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { CalendarDays, ChevronRight, Inbox, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useIsAdmin } from "@/lib/session";
import { cn } from "@/lib/utils";

type ReviewFilter = "pending" | "reviewed";

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

const FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: "pending", label: "Nierozpatrzone" },
  { key: "reviewed", label: "Rozpatrzone" },
];

export const Route = createFileRoute("/_authenticated/lista-wnioskow")({
  head: () => ({
    meta: [
      { title: "Lista wniosków" },
      { name: "description", content: "Wszystkie wnioski o rezerwację — widok administratora." },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Lista wniosków" },
      { property: "og:description", content: "Wszystkie wnioski o rezerwację — widok administratora." },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AllRequests,
});

export function AllRequests() {
  const { user } = useSession();
  const isAdmin = useIsAdmin(user?.id);
  const [filter, setFilter] = useState<ReviewFilter>("pending");

  const q = useQuery({
    queryKey: ["all-bookings"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,request_id,event_name,organization,contact_email,status,kind,start_at,end_at,participants,venues(name)")
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
        contactEmail: days[0]!.contact_email,
        status: days[0]!.status,
        kind: days[0]!.kind,
        participants: days[0]!.participants,
        venue: days[0]!.venues?.name ?? "Obiekt",
        days,
      };
    });
  }, [rows]);

  const isPending = (status: string) => status === "pending";
  const count = (key: ReviewFilter) =>
    groups.filter((g) => (key === "pending" ? isPending(g.status) : !isPending(g.status))).length;
  const visible = groups.filter((g) =>
    filter === "pending" ? isPending(g.status) : !isPending(g.status),
  );

  if (isAdmin === false) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Brak dostępu</h1>
        <p className="mt-2 text-muted-foreground">Ta strona jest dostępna tylko dla administratorów.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-widest text-accent">Panel administratora</p>
        <h1 className="text-4xl font-semibold">Lista wniosków</h1>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
            <span className="ml-2 opacity-70"> {count(f.key)}</span>
          </button>
        ))}
      </div>

      {q.isLoading && <p className="text-muted-foreground">Wczytywanie…</p>}

      {!q.isLoading && visible.length === 0 && (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center">
          <Inbox className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">
            {filter === "pending" ? "Brak nierozpatrzonych wniosków" : "Brak rozpatrzonych wniosków"}
          </p>
        </div>
      )}

      {!q.isLoading && visible.length > 0 && (
        <ul className="space-y-3">
          {visible.map((g) => {
            const first = g.days[0]!;
            const last = g.days[g.days.length - 1]!;
            const multi = g.days.length > 1;
            const sameMonth =
              multi && format(new Date(first.start_at), "yyyy-MM") === format(new Date(last.start_at), "yyyy-MM");
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
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          {format(new Date(first.start_at), "MMM", { locale: pl })}
                        </div>
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
                      {multi && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{g.days.length} dni</span>}
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {g.venue} · {g.organization}
                      {g.contactEmail ? ` · ${g.contactEmail}` : ""}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="size-3.5" />
                        {multi
                          ? `${format(new Date(first.start_at), "d MMM", { locale: pl })} – ${format(new Date(last.start_at), "d MMM", { locale: pl })}, ${format(new Date(first.start_at), "HH:mm")}–${format(new Date(first.end_at), "HH:mm")}`
                          : `${format(new Date(first.start_at), "d MMM", { locale: pl })}, ${format(new Date(first.start_at), "HH:mm")}–${format(new Date(first.end_at), "HH:mm")}`}
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
      )}
    </div>
  );
}
