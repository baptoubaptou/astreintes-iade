import { QualificationsMatrix } from "@/components/qualifications/qualifications-matrix";
import { getQualificationMatrix } from "@/server/qualifications";
import { requireCadre } from "@/server/require-cadre";

export default async function AdminQualificationsPage() {
  await requireCadre();
  const matrix = await getQualificationMatrix();

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Qualifications IADE</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Matrice des habilitations par ligne. Le retrait d&apos;une
          qualification affiche un avertissement si l&apos;IADE a des astreintes
          futures planifiées sur cette ligne.
        </p>
      </div>

      <QualificationsMatrix {...matrix} />
    </main>
  );
}
