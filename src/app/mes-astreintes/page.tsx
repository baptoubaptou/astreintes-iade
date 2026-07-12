import Link from "next/link";
import { MesAstreintesList } from "@/components/mes-astreintes/mes-astreintes-list";
import { getMesAstreintesOverview } from "@/server/mes-astreintes";
import { getCurrentUser } from "@/server/auth";
import { redirect } from "next/navigation";

export default async function MesAstreintesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { annee, pointsCumules, futures, passees } =
    await getMesAstreintesOverview(user.id);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Mes astreintes</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Vos astreintes publiées par le cadre. Les affectations en cours de
          finalisation n&apos;apparaissent pas tant qu&apos;elles ne sont pas
          publiées.{" "}
          <Link href="/planning" className="underline">
            Voir le planning collectif
          </Link>
        </p>
      </div>

      <section className="rounded border border-zinc-200 bg-zinc-50 p-6">
        <p className="text-sm text-zinc-600">
          Points cumulés — année civile {annee}
        </p>
        <p className="mt-1 text-4xl font-semibold tracking-tight">
          {pointsCumules}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Somme des points attribués sur vos astreintes non annulées de
          l&apos;année en cours.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">Astreintes à venir</h2>
        <MesAstreintesList
          astreintes={futures}
          showActions
          emptyMessage="Aucune astreinte future planifiée."
        />
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">
          Astreintes passées ({annee})
        </h2>
        <MesAstreintesList
          astreintes={passees}
          emptyMessage="Aucune astreinte passée cette année."
        />
      </section>
    </main>
  );
}
