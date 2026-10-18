import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { addDays, addWeeks, format, isSameDay } from "date-fns";
import { pl } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useSession } from "@/lib/session";
import { HOUR_END, HOUR_START, overlaps, parseWeek, slotStart, weekDays, weekKey } from "@/lib/week";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Search = { venue?: string | undefined; n?: number | undefined; week?: string | undefined };

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { redirect: location.href } });
  },
  validateSearch: (s: Record<string, unknown>): Search => ({
    venue: typeof s["venue"] === "string" ? s["venue"] : undefined,
    n: s["n"] ? Math.max(1, Number(s["n"])) || undefined : undefined,
    week: typeof s["week"] === "string" ? s["week"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Kalendarz dostępności sal" },
      { name: "description", content: "Sprawdź wolne godziny w obiektach i zarezerwuj termin w kilka kliknięć." },
      { property: "og:title", content: "Kalendarz dostępności sal" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "Sprawdź wolne godziny i zarezerwuj termin." },
    ],
  }),
  component: CalendarPage,
});

type Venue = { id: string; name: string; capacity: number };
type Busy = { id: string; venue_id: string; start_at: string; end_at: string; is_mine: boolean };
type AdminBooking = Busy & { organization: string; event_name: string; kind: string; status: string };

const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

function CalendarPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const { user } = useSession();
  const isAdmin = useIsAdmin(user?.id);
  const weekStart = parseWeek(search.week);
  const days = weekDays(weekStart);
  const from = slotStart(days[0]!, 0);
  const to = addDays(from, 7);

  const venues = useQuery({
    queryKey: ["venues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("venues").select("id,name,capacity").order("capacity");
      if (error) throw error;
      return data as Venue[];
    },
  });

  const busy = useQuery({
    queryKey: ["busy", from.toISOString(), user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_busy_slots", { _from: from.toISOString(), _to: to.toISOString() });
      if (error) throw error;
      return data as Busy[];
    },
  });

  const adminBookings = useQuery({
    queryKey: ["admin-bookings", from.toISOString()],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,venue_id,start_at,end_at,organization,event_name,kind,status")
        .neq("status", "rejected")
        .lt("start_at", to.toISOString())
        .gt("end_at", from.toISOString());
      if (error) throw error;
      return data.map((b) => ({ ...b, is_mine: false })) as AdminBooking[];
    },
  });

  // Default mode: first venue
  const mode: "venue" | "people" | "all" = search.n ? "people" : search.venue === "all" ? "all" : "venue";
  const venueId = mode === "venue" ? search.venue ?? venues.data?.[0]?.id : undefined;
  const venueById = useMemo(() => new Map((venues.data ?? []).map((v) => [v.id, v])), [venues.data]);
  const candidates = useMemo(
    () => (mode === "people" ? (venues.data ?? []).filter((v) => v.capacity >= (search.n ?? 1)) : []),
    [mode, venues.data, search.n],
  );

  const source: (Busy | AdminBooking)[] = isAdmin && adminBookings.data ? adminBookings.data : busy.data ?? [];
  const mineIds = new Set((busy.data ?? []).filter((b) => b.is_mine).map((b) => b.id));

  function cellInfo(day: Date, hour: number) {
    const s = slotStart(day, hour);
    const e = slotStart(day, hour + 1);
    const hits = source.filter((b) => overlaps(s, e, new Date(b.start_at), new Date(b.end_at)));
    const past = e <= new Date();
    if (mode === "all") return { selectable: false, hits, past, unavailable: false };
    if (mode === "venue") {
      const vh = hits.filter((b) => b.venue_id === venueId);
      return { selectable: !past && vh.length === 0, hits: vh, past, unavailable: vh.length > 0 };
    }
    const busyVenues = new Set(hits.map((b) => b.venue_id));
    const unavailable = candidates.length === 0 || candidates.every((v) => busyVenues.has(v.id));
    const relevant = hits.filter((b) => mineIds.has(b.id) || (isAdmin && candidates.some((c) => c.id === b.venue_id)));
    return { selectable: !past && !unavailable, hits: unavailable ? relevant : relevant.filter((b) => mineIds.has(b.id)), past, unavailable };
  }

  // Selection: one contiguous range per day, any number of days (also across weeks)
  type DaySel = { day: Date; a: number; b: number };
  const [sels, setSels] = useState<Record<string, DaySel>>({});
  const [dragging, setDragging] = useState(false);
  useEffect(() => setSels({}), [search.venue, search.n]);
  useEffect(() => {
    const up = () => setDragging(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);
  const dk = (d: Date) => format(d, "yyyy-MM-dd");

  function extendTo(dayIdx: number, hour: number) {
    const day = days[dayIdx]!;
    const cur = sels[dk(day)];
    if (!cur) return;
    const dir = hour >= cur.a ? 1 : -1;
    let b = cur.a;
    while (b !== hour) {
      const next = b + dir;
      if (!cellInfo(day, next).selectable) break;
      b = next;
    }
    setSels((p) => ({ ...p, [dk(day)]: { ...cur, b } }));
  }

  function onCellDown(dayIdx: number, hour: number) {
    const day = days[dayIdx]!;
    const key = dk(day);
    const cur = sels[key];
    if (cur && !dragging && hour !== cur.a) {
      extendTo(dayIdx, hour);
      return;
    }
    if (cur && cur.a === hour && cur.b === hour) {
      removeDay(key);
      return;
    }
    setSels((p) => ({ ...p, [key]: { day, a: hour, b: hour } }));
    setDragging(true);
  }

  function removeDay(key: string) {
    setSels((p) => {
      const n = { ...p };
      delete n[key];
      return n;
    });
  }

  const ranges = Object.entries(sels)
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([key, s]) => ({
      key,
      start: slotStart(s.day, Math.min(s.a, s.b)),
      end: slotStart(s.day, Math.max(s.a, s.b) + 1),
    }));

  function setSearch(patch: Partial<Search>) {
    navigate({ search: (prev) => ({ ...prev, ...patch }) });
  }

  function goToRequest() {
    if (ranges.length === 0) return;
    navigate({
      to: "/wniosek/nowy",
      search: {
        slots: ranges.map((r) => `${r.start.toISOString()}_${r.end.toISOString()}`).join(","),
        venue: mode === "venue" ? venueId : undefined,
        n: mode === "people" ? search.n : undefined,
      },
    });
  }

  const today = new Date();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-widest text-accent">Dostępność</p>
          <h1 className="text-4xl font-semibold capitalize">
            {format(days[0]!, "d MMM", { locale: pl })} – {format(days[6]!, "d MMM yyyy", { locale: pl })}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Poprzedni tydzień" onClick={() => setSearch({ week: weekKey(addWeeks(weekStart, -1)) })}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" onClick={() => setSearch({ week: undefined })}>Dziś</Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" aria-label="Wybierz tydzień">
                <CalendarIcon /> Wybierz tydzień
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                locale={pl}
                weekStartsOn={1}
                selected={weekStart}
                defaultMonth={weekStart}
                onSelect={(d) => d && setSearch({ week: weekKey(d) })}
                className="pointer-events-auto p-3"
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" aria-label="Następny tydzień" onClick={() => setSearch({ week: weekKey(addWeeks(weekStart, 1)) })}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <Select
          value={mode === "people" ? "__people" : mode === "all" ? "all" : venueId ?? ""}
          onValueChange={(v) => {
            if (v === "__people") setSearch({ venue: undefined, n: search.n ?? 10 });
            else setSearch({ venue: v, n: undefined });
          }}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Wybierz obiekt" />
          </SelectTrigger>
          <SelectContent>
            {(venues.data ?? []).map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name} · {v.capacity} miejsc
              </SelectItem>
            ))}
            <SelectItem value="__people">Dowolny obiekt (wg liczby osób)</SelectItem>
            {isAdmin && <SelectItem value="all">Wszystkie obiekty</SelectItem>}
          </SelectContent>
        </Select>
        {mode === "people" && (
          <label className="flex items-center gap-2 text-sm">
            <Users className="size-4 text-muted-foreground" />
            Uczestnicy:
            <Input
              type="number"
              min={1}
              className="w-24"
              value={search.n ?? 1}
              onChange={(e) => setSearch({ n: Math.max(1, Number(e.target.value) || 1) })}
            />
            <span className="text-muted-foreground">
              {candidates.length} {candidates.length === 1 ? "obiekt pasuje" : "obiektów pasuje"}
            </span>
          </label>
        )}
        <div className="ml-auto flex flex-wrap gap-3 text-xs text-muted-foreground">
          <Legend className="bg-slot-free border">Wolne</Legend>
          <Legend className="bg-slot-busy slot-busy-pattern">Niedostępne</Legend>
          <Legend className="bg-slot-mine">Twój wniosek</Legend>
          <Legend className="bg-slot-selected">Zaznaczenie</Legend>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card select-none">
        <div className="grid min-w-[900px]" style={{ gridTemplateColumns: "4rem repeat(7, minmax(0, 1fr))" }}>
          <div className="border-b" />
          {days.map((d) => (
            <div key={d.toISOString()} className={cn("border-b border-l px-2 py-3 text-center", isSameDay(d, today) && "bg-secondary")}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{format(d, "EEE", { locale: pl })}</div>
              <div className="font-display text-2xl">{format(d, "d")}</div>
            </div>
          ))}
          {HOURS.map((h) => (
            <Row key={h}>
              <div className="border-b pr-2 pt-1 text-right text-xs text-muted-foreground">{String(h).padStart(2, "0")}:00</div>
              {days.map((d, di) => {
                const info = cellInfo(d, h);
                const inSel = sel && sel.day === di && h >= Math.min(sel.a, sel.b) && h <= Math.max(sel.a, sel.b);
                const mine = info.hits.filter((b) => mineIds.has(b.id));
                const showDetails = isAdmin ? info.hits : mine;
                return (
                  <div
                    key={di}
                    onMouseDown={() => info.selectable && onCellDown(di, h)}
                    onMouseEnter={() => dragging && extendTo(di, h)}
                    className={cn(
                      "relative h-12 border-b border-l p-0.5 transition-colors",
                      info.selectable && "cursor-pointer bg-slot-free hover:bg-slot-free-hover",
                      !info.selectable && "bg-slot-busy",
                      (info.unavailable || info.past) && showDetails.length === 0 && "slot-busy-pattern",
                      inSel && "bg-slot-selected hover:bg-slot-selected",
                    )}
                  >
                    <div className="flex h-full flex-col gap-0.5 overflow-hidden">
                      {showDetails.map((b) => (
                        <SlotChip key={b.id} b={b} mine={mineIds.has(b.id)} venueName={mode !== "venue" ? venueById.get(b.venue_id)?.name : undefined} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </Row>
          ))}
        </div>
      </div>

      {selRange && (
        <div className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-4 rounded-full border bg-primary px-6 py-3 text-primary-foreground shadow-xl">
          <span className="text-sm">
            {format(selRange.start, "EEEE d MMM", { locale: pl })}, {format(selRange.start, "HH:mm")}–{format(selRange.end, "HH:mm")}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setSel(null)}>Anuluj</Button>
          <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={goToRequest}>
            Złóż wniosek
          </Button>
        </div>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        Zaznacz wolne godziny przeciągając myszką w obrębie jednego dnia (lub kliknij początek, a potem koniec).
      </p>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-block size-3 rounded-sm", className)} />
      {children}
    </span>
  );
}

function SlotChip({ b, mine, venueName }: { b: Busy | AdminBooking; mine: boolean; venueName?: string | undefined }) {
  const admin = "organization" in b;
  const tone = mine
    ? "bg-slot-mine text-slot-mine-foreground"
    : admin && b.kind === "event"
      ? "bg-slot-event text-slot-event-foreground"
      : admin && b.status === "pending"
        ? "bg-slot-pending text-slot-pending-foreground"
        : "bg-slot-admin text-slot-admin-foreground";
  return (
    <Link
      to="/wniosek/$id"
      params={{ id: b.id }}
      onMouseDown={(e) => e.stopPropagation()}
      className={cn("block min-h-0 flex-1 truncate rounded px-1.5 text-[11px] leading-5 font-medium hover:brightness-95", tone)}
      title={admin ? `${b.organization} — ${b.event_name}` : "Twój wniosek"}
    >
      {admin ? b.organization : "Twój wniosek"}
      {venueName && <span className="opacity-70"> · {venueName}</span>}
    </Link>
  );
}
