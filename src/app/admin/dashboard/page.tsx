import Link from "next/link";
import { CampagnesResumePanel } from "@/components/campagnes/campagnes-resume-panel";
import { getCampagnesResume } from "@/server/campagnes";
import { requireCadre } from "@/server/require-cadre";

export default async function AdminDashboardPage() {
  await requireCadre();
  const campagnes = await getCampagnesResume();

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Tableau de bord</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Vue d&apos;ensemble des campagnes de planification à venir ou en cours.
        </p>
      </header>

      <CampagnesResumePanel campagnes={campagnes} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardLink
          href="/admin/generation-automatique"
          title="Génération automatique"
          description="Simuler et valider un planning sur une période."
        />
        <DashboardLink
          href="/admin/planning"
          title="Gestion du planning"
          description="Créer, modifier ou annuler des astreintes."
        />
        <DashboardLink
          href="/admin/campagnes"
          title="Campagnes"
          description="Programmer les fenêtres de génération par ligne."
        />
      </section>
    </main>
  );
}

function DashboardLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded border border-zinc-200 p-4 hover:bg-zinc-50"
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-zinc-600">{description}</p>
    </Link>
  );
}
