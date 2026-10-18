import { normalizeKrs } from "@/lib/ngo";
import { createFileRoute, redirect as redirectTo, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function safeRedirect(r: unknown) {
  if (typeof r !== "string") return "/";
  try {
    const u = new URL(r, "http://x");
    return u.pathname.startsWith("/") && !u.pathname.startsWith("//") ? u.pathname + u.search : "/";
  } catch {
    return "/";
  }
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ redirect: safeRedirect(s["redirect"]) }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirectTo({ to: search.redirect as "/" });
  },
  head: () => ({
    meta: [
      { title: "Logowanie — Rezerwacje sal" },
      { name: "description", content: "Zaloguj się, aby rezerwować sale i śledzić swoje wnioski." },
      { property: "og:title", content: "Logowanie — Rezerwacje sal" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "Zaloguj się, aby rezerwować sale." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organization, setOrganization] = useState("");
  const [krs, setKrs] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: redirect as "/" });
      } else {
        if (krs.trim() && !normalizeKrs(krs)) throw new Error("Numer KRS musi mieć 10 cyfr.");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + redirect,
            data: { organization: organization.trim(), krs: normalizeKrs(krs) ?? "" },
          },
        });
        if (error) throw error;
        if (data.session) navigate({ to: redirect as "/" });
        else toast.success("Sprawdź skrzynkę e-mail, aby potwierdzić konto.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <div>
        <h1 className="text-4xl font-semibold">{mode === "in" ? "Zaloguj się" : "Załóż konto"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Konto jest potrzebne do składania wniosków o rezerwację.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border bg-card p-6">
        <div className="grid gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pw">Hasło</Label>
          <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {mode === "up" && (
          <>
            <div className="grid gap-2">
              <Label htmlFor="org">Nazwa organizacji (opcjonalnie)</Label>
              <Input id="org" value={organization} onChange={(e) => setOrganization(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="krs">Numer KRS (opcjonalnie)</Label>
              <Input id="krs" inputMode="numeric" placeholder="0000123456" value={krs} onChange={(e) => setKrs(e.target.value)} />
            </div>
          </>
        )}
        <Button type="submit" disabled={busy}>
          {mode === "in" ? "Zaloguj" : "Zarejestruj"}
        </Button>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "in" ? "Nie masz konta? Zarejestruj się" : "Masz konto? Zaloguj się"}
        </button>
      </form>
    </div>
  );
}
