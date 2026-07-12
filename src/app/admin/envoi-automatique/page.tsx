import { AdminEnvoiAutomatiquePanel } from "@/components/envoi-automatique/admin-envoi-automatique-panel";
import { getOuCreerConfiguration } from "@/server/envoi-automatique";
import { requireCadre } from "@/server/require-cadre";

export default async function AdminEnvoiAutomatiquePage() {
  await requireCadre();
  const configuration = await getOuCreerConfiguration();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Envoi automatique du planning</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Configuration de l&apos;envoi périodique du planning publié par
          e-mail. La période couverte est la semaine suivante (lundi au
          dimanche) par rapport au jour d&apos;envoi choisi.
        </p>
      </header>
      <AdminEnvoiAutomatiquePanel configurationInitiale={configuration} />
    </main>
  );
}
