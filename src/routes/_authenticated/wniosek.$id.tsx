import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin, useSession } from "@/lib/session";
import { weekKey } from "@/lib/week";
import { notifyApplicant } from "@/lib/mailer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/wniosek/$id")({
  head: () => ({
    meta: [
      { title: "Szczegóły wniosku" },
      { name: "description", content: "Szczegóły wniosku o rezerwację obiektu." },
      { property: "og:title", content: "Szczegóły wniosku" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "Szczegóły wniosku o rezerwację obiektu." },
    ],
  }),
  component: Detail,
});

const STATUS: Record<string, string> = { pending: "Oczekuje", approved: "Zatwierdzony", rejected: "Odrzucony" };
const FIELD: Record<string, string> = {
  status: "Status", start_at: "Początek", end_at: "Koniec", organization: "Organizacja", contact_name: "Osoba kontaktowa",
  contact_email: "E-mail", event_name: "Nazwa", participants: "Uczestnicy", description: "Opis", venue_id: "Obiekt",
  rejection_reason: "Uzasadnienie odrzucenia", kind: "Typ",
};
const ACTION: Record<string, string> = {
  created: "Utworzono wniosek", updated: "Edytowano wniosek", deleted: "Usunięto wniosek",
  "status:approved": "Zaakceptowano", "status:rejected": "Odrzucono", "status:pending": "Przywrócono do oczekujących",
};

const toLocal = (iso: string) => format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
const fmtVal = (k: string, v: unknown) => {
  if (v == null || v === "") return "—";
  if ((k === "start_at" || k === "end_at") && typeof v === "string") return format(new Date(v), "d MMM yyyy HH:mm", { locale: pl });
  if (k === "status" && typeof v === "string") return STATUS[v] ?? v;
  return String(v);
};

function Detail() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const isAdmin = useIsAdmin(user?.id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState({ event_name: "", organization: "", contact_name: "", contact_email: "", participants: 1, description: "", start_at: "", end_at: "" });

  const q = useQuery({
    queryKey: ["booking", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("*, venues(name, capacity)").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const requestId = q.data?.request_id;
  const siblings = useQuery({
    queryKey: ["booking-group", requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("id,start_at,end_at").eq("request_id", requestId!).order("start_at");
      if (error) throw error;
      return data;
    },
  });
  const history = useQuery({
    queryKey: ["booking-history", id],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("booking_history").select("*").eq("booking_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (q.isLoading) return <p className="p-10 text-muted-foreground">Wczytywanie…</p>;
  const b = q.data;
  if (!b) return <p className="p-10">Nie znaleziono wniosku lub brak dostępu.</p>;
  const start = new Date(b.start_at);
  const end = new Date(b.end_at);
  const group = siblings.data && siblings.data.length > 0 ? siblings.data : [{ id: b.id, start_at: b.start_at, end_at: b.end_at }];
  const fmtRange = (x: { start_at: string; end_at: string }) =>
    `${format(new Date(x.start_at), "EEEE d MMM yyyy", { locale: pl })}, ${format(new Date(x.start_at), "HH:mm")}–${format(new Date(x.end_at), "HH:mm")}`;
  const mailInfo = { wniosek: b.event_name, obiekt: b.venues?.name, termin: group.map(fmtRange).join("; ") };

  async function approve() {
    const { error } = await supabase.from("bookings").update({ status: "approved", rejection_reason: null }).eq("request_id", b.request_id);
    if (error) { toast.error(error.message); return; }
    toast.success("Wniosek zaakceptowany");
    await notifyApplicant(b!.contact_email, "approved", mailInfo);
    qc.invalidateQueries();
  }
  async function reject() {
    if (!reason.trim()) { toast.error("Podaj uzasadnienie odrzucenia"); return; }
    const { error } = await supabase.from("bookings").update({ status: "rejected", rejection_reason: reason.trim() }).eq("request_id", b.request_id);
    if (error) { toast.error(error.message); return; }
    toast.success("Wniosek odrzucony");
    await notifyApplicant(b!.contact_email, "rejected", { ...mailInfo, uzasadnienie: reason.trim() });
    setRejectOpen(false); setReason("");
    qc.invalidateQueries();
  }
  async function remove() {
    if (!confirm(group.length > 1 ? `Na pewno usunąć cały wniosek (${group.length} dni)?` : "Na pewno usunąć ten wniosek?")) return;
    const { error } = await supabase.from("bookings").delete().eq("request_id", b.request_id);
    if (error) { toast.error(error.message); return; }
    if (isAdmin && b!.user_id !== user?.id) await notifyApplicant(b!.contact_email, "deleted", mailInfo);
    qc.invalidateQueries();
    navigate({ to: "/" });
  }
  function openEdit() {
    setForm({
      event_name: b!.event_name, organization: b!.organization, contact_name: b!.contact_name ?? "", contact_email: b!.contact_email ?? "",
      participants: b!.participants, description: b!.description ?? "", start_at: toLocal(b!.start_at), end_at: toLocal(b!.end_at),
    });
    setEditOpen(true);
  }
  async function saveEdit() {
    const s = new Date(form.start_at), e = new Date(form.end_at);
    if (!form.event_name.trim() || !form.organization.trim()) { toast.error("Nazwa i organizacja są wymagane"); return; }
    if (!(e > s)) { toast.error("Koniec musi być po początku"); return; }
    const { error } = await supabase.from("bookings").update({
      event_name: form.event_name.trim(), organization: form.organization.trim(), contact_name: form.contact_name || null,
      contact_email: form.contact_email || null, participants: Math.max(1, Number(form.participants) || 1),
      description: form.description || null, start_at: s.toISOString(), end_at: e.toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Zapisano zmiany");
    await notifyApplicant(form.contact_email || b!.contact_email, "updated", mailInfo);
    setEditOpen(false);
    qc.invalidateQueries();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/" search={{ venue: b.venue_id, week: weekKey(start) }} className="text-sm text-muted-foreground hover:underline">
        ← Wróć do kalendarza
      </Link>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-widest text-accent">{b.kind === "event" ? "Wydarzenie" : "Wniosek"}</p>
          <h1 className="text-4xl font-semibold">{b.event_name}</h1>
          {isAdmin ? (
            <Link to="/ngo/$name" params={{ name: b.organization }} className="mt-1 inline-block text-muted-foreground underline-offset-4 hover:underline">
              {b.organization} → profil NGO
            </Link>
          ) : (
            <p className="mt-1 text-muted-foreground">{b.organization}</p>
          )}
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium">{STATUS[b.status] ?? b.status}</span>
      </div>
      <dl className="mt-8 grid gap-4 rounded-lg border bg-card p-6 sm:grid-cols-2">
        <Item k="Obiekt" v={b.venues?.name} />
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{group.length > 1 ? `Terminy (${group.length} dni)` : "Termin"}</dt>
          <dd className="mt-1 grid gap-0.5">
            {group.map((x) => (
              <span key={x.id} className={x.id === b.id && group.length > 1 ? "font-semibold" : undefined}>{fmtRange(x)}</span>
            ))}
          </dd>
        </div>
        <Item k="Uczestnicy" v={String(b.participants)} />
        <Item k="Kontakt" v={[b.contact_name, b.contact_email].filter(Boolean).join(" · ") || "—"} />
        <div className="sm:col-span-2"><Item k="Opis" v={b.description || "—"} /></div>
        {b.status === "rejected" && b.rejection_reason && (
          <div className="sm:col-span-2"><Item k="Uzasadnienie odrzucenia" v={b.rejection_reason} /></div>
        )}
      </dl>
      <div className="mt-6 flex flex-wrap gap-3">
        {isAdmin && b.status !== "approved" && <Button onClick={approve}>Zaakceptuj</Button>}
        {isAdmin && b.status !== "rejected" && <Button variant="outline" onClick={() => setRejectOpen(true)}>Odrzuć</Button>}
        {isAdmin && <Button variant="secondary" onClick={openEdit}>{group.length > 1 ? "Edytuj ten dzień" : "Edytuj"}</Button>}
        {(isAdmin || b.user_id === user?.id) && <Button variant="destructive" onClick={remove}>Usuń</Button>}
      </div>

      {isAdmin && (
        <section className="mt-12">
          <h2 className="text-2xl font-semibold">Historia zmian</h2>
          <ol className="mt-4 space-y-3">
            {(history.data ?? []).map((h) => {
              const changes = (h.changes ?? {}) as Record<string, unknown>;
              const isDiff = h.action !== "created" && h.action !== "deleted";
              return (
                <li key={h.id} className="rounded-lg border bg-card p-4 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{ACTION[h.action] ?? h.action}</span>
                    <span className="text-muted-foreground">{format(new Date(h.created_at), "d MMM yyyy, HH:mm:ss", { locale: pl })}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Konto: {h.actor_email ?? "system"}
                    {h.actor_id && h.actor_id === h.owner_id ? " (wnioskodawca)" : h.actor_id ? " (administrator)" : ""}
                  </p>
                  {isDiff && (
                    <ul className="mt-2 space-y-1">
                      {Object.entries(changes).map(([k, v]) => {
                        const d = v as { old: unknown; new: unknown };
                        return <li key={k}><span className="text-muted-foreground">{FIELD[k] ?? k}:</span> {fmtVal(k, d.old)} → {fmtVal(k, d.new)}</li>;
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
            {history.data?.length === 0 && <li className="text-muted-foreground">Brak zapisanych zmian.</li>}
          </ol>
        </section>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Odrzuć wniosek</DialogTitle></DialogHeader>
          <Label htmlFor="reason">Uzasadnienie (zostanie przekazane wnioskodawcy)</Label>
          <Textarea id="reason" rows={5} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Anuluj</Button>
            <Button variant="destructive" onClick={reject}>Odrzuć wniosek</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edytuj wniosek</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="Nazwa wydarzenia"><Input value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })} /></Field>
            <Field label="Organizacja"><Input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Początek"><Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} /></Field>
              <Field label="Koniec"><Input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Osoba kontaktowa"><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></Field>
              <Field label="E-mail"><Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></Field>
            </div>
            <Field label="Uczestnicy"><Input type="number" min={1} value={form.participants} onChange={(e) => setForm({ ...form, participants: Number(e.target.value) })} /></Field>
            <Field label="Opis"><Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Anuluj</Button>
            <Button onClick={saveEdit}>Zapisz i powiadom</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>;
}

function Item({ k, v }: { k: string; v?: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className="mt-1 capitalize-first">{v}</dd>
    </div>
  );
}
