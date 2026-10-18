import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { NgoProfileView } from "@/components/ngo-profile";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/ngo/$name")({
  head: ({ params }) => ({
    meta: [
      { title: `Profil organizacji: ${params.name}` },
      { name: "description", content: "Profil organizacji składającej wnioski o rezerwację." },
      { property: "og:title", content: `Profil organizacji: ${params.name}` },
      { property: "og:description", content: "Profil organizacji składającej wnioski o rezerwację." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NgoProfile,
});

function NgoProfile() {
  const { name } = Route.useParams();
  const router = useRouter();
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Button variant="ghost" onClick={() => router.history.back()}>← Wróć</Button>
      <p className="mt-4 text-sm uppercase tracking-widest text-accent">Profil organizacji</p>
      <h1 className="text-4xl font-semibold">{name}</h1>
      <NgoProfileView name={name} canEdit />
      <Link to="/" className="mt-6 inline-block text-sm hover:underline">Kalendarz</Link>
    </div>
  );
}
