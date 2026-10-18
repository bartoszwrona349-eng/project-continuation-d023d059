import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ngoPlUrl, ngoRegistryUrl, normalizeKrs } from "@/lib/ngo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STATUS: Record<string, string> = { pending: "Oczekuje", approved: "Zaakceptowany", rejected: "Odrzucony" };

type Props = { name?: string | undefined; ownerId?: string | undefined; canEdit?: boolean };

export function NgoProfileView({ name, ownerId, canEdit }: Props) {
  const qc = useQueryClient();
  const profile = useQuery({
    queryKey: ["ngo-profile", ownerId ?? null, name ?? null],
    queryFn: async () => {
      let q = supabase.from("ngo_profiles").select("*");
      if (ownerId) q = q.eq("user_id", ownerId);
      else if (name) q = q.ilike("name", name);
      else return null;
      const { data, error } = await q.limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const orgName = profile.data?.name || name;
  const bookings = useQuery({
    queryKey: ["ngo-bookings", ownerId ?? null, orgName ?? null],
    enabled: Boolean(ownerId || orgName),
    queryFn: async () => {
      let q = supabase.from("bookings").select("id, event_name, start_at, status, venues(name)").order("start_at", { ascending: false });
      q = ownerId ? q.eq("user_id", ownerId) : q.eq("organization", orgName!);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", krs: "", emails: "", phone: "", address: "" });
  useEffect(() => {
    const p = profile.data;
    setForm({ name: p?.name ?? name ?? "", krs: p?.krs ?? "", emails: p?.emails ?? "", phone: p?.phone ?? "", address: p?.address ?? "" });
  }, [profile.data, name]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const krs = form.krs.trim() ? normalizeKrs(form.krs) : null;
    if (form.krs.trim() && !krs) { toast.error("Numer KRS musi mieć 10 cyfr."); return; }
    const userId = profile.data?.user_id ?? ownerId;
    if (!userId) { toast.error("Brak profilu do zapisania."); return; }
    const { error } = await supabase.from("ngo_profiles").upsert({
      user_id: userId, name: form.name.trim() || null, krs, emails: form.emails.trim() || null,
      phone: form.phone.trim() || null, address: form.address.trim() || null, updated_at: new Date().toISOString(),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Zapisano profil.");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["ngo-profile"] });
  }

  if (profile.isPending) return <p className="mt-8 text-muted-foreground">Wczytywanie…</p>;
  const p = profile.data;
  const link = ngoPlUrl(p?.krs);
  const registryLink = ngoRegistryUrl(p?.krs);
  const editable = canEdit || Boolean(ownerId);

  return (
    <section className="mt-8 border-t py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Building2 className="size-8 text-muted-foreground" />
          <h2 className="mt-4 break-words text-2xl font-semibold">{orgName ?? "Moja organizacja"}</h2>
          {p?.krs && <p className="mt-1 text-sm text-muted-foreground">KRS {p.krs}</p>}
        </div>
        {editable && (p || ownerId) && !editing && <Button variant="outline" onClick={() => setEditing(true)}>Edytuj dane</Button>}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-6 grid gap-4 rounded-lg border bg-card p-6">
          {([
            ["name", "Nazwa organizacji"], ["krs", "Numer KRS"], ["emails", "E-maile (oddziel przecinkami)"],
            ["phone", "Telefon"], ["address", "Adres"],
          ] as const).map(([k, label]) => (
            <div key={k} className="grid gap-2">
              <Label htmlFor={`ngo-${k}`}>{label}</Label>
              <Input id={`ngo-${k}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <div className="flex gap-2"><Button type="submit">Zapisz</Button><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Anuluj</Button></div>
        </form>
      ) : (
        <dl className="mt-6 grid gap-3 text-sm">
          <Row icon={<Mail className="size-4" />} label="E-mail">
            {p?.emails ? p.emails.split(",").map((m) => m.trim()).filter(Boolean).map((m) => <a key={m} href={`mailto:${m}`} className="mr-3 hover:underline">{m}</a>) : "—"}
          </Row>
          <Row icon={<Phone className="size-4" />} label="Telefon">{p?.phone ? <a href={`tel:${p.phone}`} className="hover:underline">{p.phone}</a> : "—"}</Row>
          <Row icon={<MapPin className="size-4" />} label="Adres">{p?.address ?? "—"}</Row>
          <Row icon={<ExternalLink className="size-4" />} label="Rejestr.io">
            {registryLink ? <a href={registryLink} target="_blank" rel="noopener noreferrer" className="hover:underline">Dane organizacji w Rejestr.io</a> : "Podaj numer KRS, aby wyświetlić link"}
          </Row>
          <Row icon={<ExternalLink className="size-4" />} label="ngo.pl">
            {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="hover:underline">Wyszukaj organizację w ngo.pl</a> : "—"}
          </Row>
        </dl>
      )}

      <h3 className="mt-10 text-lg font-semibold">Historia wniosków</h3>
      {bookings.isPending && <p className="mt-4 text-muted-foreground">Wczytywanie…</p>}
      {bookings.data && bookings.data.length === 0 && <p className="mt-4 text-muted-foreground">Brak wniosków.</p>}
      {bookings.data && bookings.data.length > 0 && (
        <ul className="mt-4 divide-y border-y">
          {bookings.data.map((b) => (
            <li key={b.id}>
              <Link to="/wniosek/$id" params={{ id: b.id }} className="flex items-center gap-4 py-4 transition-colors hover:bg-secondary/40">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{b.event_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(b.start_at).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" })} · {(b.venues as { name: string } | null)?.name ?? "—"}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">{STATUS[b.status] ?? b.status}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
