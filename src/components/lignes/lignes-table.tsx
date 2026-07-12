import type { LigneAstreinte } from "@prisma/client";
import { LigneRow } from "@/components/lignes/ligne-row";

type LignesTableProps = {
  lignes: LigneAstreinte[];
};

export function LignesTable({ lignes }: LignesTableProps) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-medium">Lignes existantes</h2>
      {lignes.length === 0 ? (
        <p className="text-sm text-zinc-600">Aucune ligne enregistrée.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left">
              <th className="border border-zinc-200 px-3 py-2">Nom</th>
              <th className="border border-zinc-200 px-3 py-2">
                Ordre de priorité
              </th>
              <th className="border border-zinc-200 px-3 py-2">Active</th>
              <th className="border border-zinc-200 px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne) => (
              <LigneRow key={ligne.id} ligne={ligne} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
