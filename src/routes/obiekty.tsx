import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/obiekty")({
  head: () => ({
    meta: [
      { title: "Obiekty do wynajęcia" },
      { name: "description", content: "Lista sal i obiektów wraz z liczbą miejsc." },
      { property: "og:title", content: "Obiekty do wynajęcia" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:description", content: "Lista sal i obiektów wraz z liczbą miejsc." },
    ],
  }),
  component: VenuesPage,
});

function VenuesPage() {
  const { data } = useQuery({
    queryKey: ["venues-full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("venues").select("*").order("capacity");
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-sm uppercase tracking-widest text-accent">Nasze przestrzenie</p>
      <h1 className="mb-8 text-4xl font-semibold">Obiekty</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {(data ?? []).map((v) => (
          <div key={v.id} className="flex flex-col gap-3 rounded-lg border bg-card p-6">
            <h2 className="text-2xl font-semibold">{v.name}</h2>
            <p className="text-sm text-muted-foreground">{v.description}</p>
            <p className="flex items-center gap-2 text-sm"><Users className="size-4" /> do {v.capacity} osób</p>
            <Button asChild className="mt-auto w-fit">
              <Link to="/" search={{ venue: v.id }}>Zobacz dostępność</Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
