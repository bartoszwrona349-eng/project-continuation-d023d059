import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, ChevronRight, Search } from "lucide-react";
import { useSession } from "@/lib/session";
import { filterNgoNames, loadNgoAccess } from "@/lib/ngo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NgoProfileView } from "@/components/ngo-profile";

export const Route = createFileRoute("/_authenticated/profil-ngo")({
  head: () => ({ meta: [
    { title: "Profil NGO — Sale." },
    { name: "description", content: "Profil Twojej organizacji i lista organizacji dla administratora rezerwacji sal." },
    { property: "og:title", content: "Profil NGO — Sale." },
    { property: "og:description", content: "Organizacje korzystające z rezerwacji sal." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: NgoPage,
});

function NgoPage() {
  const { user } = useSession();
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["ngo-access", user?.id],
    enabled: Boolean(user),
    queryFn: () => {
      if (!user) throw new Error("Zaloguj się, aby zobaczyć profil NGO.");
      return loadNgoAccess(user.id);
    },
  });
  const names = filterNgoNames(query.data?.names ?? [], search);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-4xl font-semibold">Profil NGO</h1>
      {query.isPending && <p className="mt-8 text-muted-foreground">Wczytywanie…</p>}
      {query.isError && <div className="mt-8"><p role="alert" className="text-destructive">Nie udało się wczytać organizacji.</p><Button variant="outline" className="mt-4" onClick={() => query.refetch()}>Spróbuj ponownie</Button></div>}
      {query.data && (query.data.isAdmin ? <>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Organizacje NGO <span className="text-muted-foreground">({query.data.names.length})</span></h2>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input aria-label="Szukaj NGO" placeholder="Szukaj NGO…" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
          </div>
        </div>
        <ul className="mt-6 divide-y border-y">
          {names.map((name) => <li key={name}><Link to="/ngo/$name" params={{ name }} className="flex items-center gap-4 py-5 transition-colors hover:bg-secondary/40">
            <Building2 className="size-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 break-words font-medium">{name}</span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link></li>)}
        </ul>
        {names.length === 0 && <p className="py-10 text-muted-foreground">{query.data.names.length ? "Brak organizacji pasujących do wyszukiwania." : "Brak organizacji NGO."}</p>}
      </> : <NgoProfileView ownerId={user?.id} name={query.data.names[0]} />)}
    </div>
  );
}