import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useSession } from "@/lib/session";
import { overlaps } from "@/lib/week";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type S = { start: string; end: string; venue?: string | undefined; n?: number | undefined };

export const Route = createFileRoute("/_authenticated/wniosek/nowy")({
  validateSearch: (s: Record<string, unknown>): S => ({
    start: String(s["start"] ?? ""),
    end: String(s["end"] ?? ""),
    venue: typeof s["venue"] === "string" ? s["venue"] : undefined,
    n: s["n"] ? Number(s["n"]) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Nowy wniosek o rezerwację" },
      { name: "description", content: "Złóż wniosek o rezerwację wybranego terminu." },
      { property: "og:title", content: "Nowy wniosek o rezerwację" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "Złóż wniosek o rezerwację wybranego terminu." },
    ],
  }),
  component: NewRequest,
});

function NewRequest() {
  const s = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useSession();
  const isAdmin = useIsAdmin(user?.id);
  const start = new Date(s.start);
  const end = new Date(s.end);

  const venues = useQuery({
    queryKey: ["free-venues", s.start, s.end],
    queryFn: async () => {
      const [{ data: v }, { data: busy }] = await Promise.all([
        supabase.from("venues").select("id,name,capacity").order("capacity"),
        supabase.rpc("get_busy_slots", { _from: s.start, _to: s.end }),
      ]);
      const taken = new Set((busy ?? []).filter((b) => overlaps(start, end, new Date(b.start_at), new Date(b.end_at))).map((b) => b.venue_id));
      return (v ?? []).map((x) => ({ ...x, free: !taken.has(x.id) }));
    },
  });

  const options = (venues.data ?? []).filter((v) => v.free && (s.venue ? v.id === s.venue : v.capacity >= (s.n ?? 1)));
  const [venueId, setVenueId] = useState<string | undefined>(s.venue);
  const chosen = venueId ?? options[0]?.id;
  const [form, setForm] = useState({
    organization: "",
    event_name: "",
    contact_name: "",
    contact_email: user?.email ?? "",
    participants: s.n ?? 1,
    description: "",
    kind: "request",
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen || !user) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("bookings")
      .insert({
        ...form,
        contact_email: form.contact_email || user.email || null,
        venue_id: chosen,
        user_id: user.id,
        start_at: s.start,
        end_at: s.end,
        status: form.kind === "event" ? "approved" : "pending",
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Wniosek został złożony");
    navigate({ to: "/wniosek/$id", params: { id: data.id } });
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: k === "participants" ? Number(e.target.value) : e.target.value });

  if (isNaN(start.getTime())) return <p className="p-10">Nieprawidłowy termin.</p>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-sm uppercase tracking-widest text-accent">Wniosek o rezerwację</p>
      <h1 className="text-4xl font-semibold capitalize">
        {format(start, "EEEE, d MMMM", { locale: pl })}
      </h1>
      <p className="mt-1 text-lg text-muted-foreground">
        {format(start, "HH:mm")} – {format(end, "HH:mm")}
      </p>

      <form onSubmit={submit} className="mt-8 grid gap-5 rounded-lg border bg-card p-6">
        <div className="grid gap-2">
          <Label>Obiekt</Label>
          {venues.isLoading ? (
            <p className="text-sm text-muted-foreground">Sprawdzanie dostępności…</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-destructive">Brak wolnego obiektu w tym terminie.</p>
          ) : (
            <Select value={chosen ?? ""} onValueChange={setVenueId} disabled={!!s.venue}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name} · {v.capacity} miejsc</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {isAdmin && (
          <div className="grid gap-2">
            <Label>Typ wpisu</Label>
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="request">Wniosek</SelectItem>
                <SelectItem value="event">Wydarzenie (zatwierdzone)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <Field label="Organizacja" id="org"><Input id="org" required value={form.organization} onChange={set("organization")} /></Field>
        <Field label="Nazwa wydarzenia" id="ev"><Input id="ev" required value={form.event_name} onChange={set("event_name")} /></Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Osoba kontaktowa" id="cn"><Input id="cn" value={form.contact_name} onChange={set("contact_name")} /></Field>
          <Field label="E-mail kontaktowy" id="ce"><Input id="ce" type="email" value={form.contact_email} onChange={set("contact_email")} /></Field>
        </div>
        <Field label="Liczba uczestników" id="pp"><Input id="pp" type="number" min={1} required value={form.participants} onChange={set("participants")} /></Field>
        <Field label="Opis" id="ds"><Textarea id="ds" rows={4} value={form.description} onChange={set("description")} /></Field>
        <div className="flex gap-3">
          <Button type="submit" disabled={busy || !chosen}>Wyślij wniosek</Button>
          <Button type="button" variant="outline" onClick={() => history.back()}>Wróć</Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
