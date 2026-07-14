import type { TypeCreneau } from "@prisma/client";

export function buildRechercheRemplacementHref(creneau: {
  date: string;
  ligneId: string;
  typeCreneau: TypeCreneau;
}): string {
  const params = new URLSearchParams({
    date: creneau.date,
    ligneId: creneau.ligneId,
    typeCreneau: creneau.typeCreneau,
  });
  return `/admin/recherche-remplacement?${params.toString()}`;
}
