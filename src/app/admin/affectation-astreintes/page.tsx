import { AffectationAstreintesPanel } from "@/components/affectation-astreintes/affectation-astreintes-panel";
import {
  ajusterPeriodeApresCalendrierPublie,
  getBorneCalendrierPublie,
  getBornesCalendrierPublieParLigne,
} from "@/server/calendrier-publie";
import { listLignesCampagneOptions } from "@/server/campagnes";
import { getContexteAffectationParAstreinte } from "@/server/lot-generation";
import { getDefaultNextMonthRange } from "@/server/simulation-planning";
import { requireCadre } from "@/server/require-cadre";

type PageProps = {
  searchParams: Promise<{ mode?: string }>;
};

export default async function AffectationAstreintesPage({ searchParams }: PageProps) {
  await requireCadre();
  const params = await searchParams;
  const { dateDebut, dateFin } = getDefaultNextMonthRange();

  const [lignes, contexte, borneGlobale, bornesParLigne] = await Promise.all([
    listLignesCampagneOptions(),
    getContexteAffectationParAstreinte(),
    getBorneCalendrierPublie(),
    getBornesCalendrierPublieParLigne(),
  ]);

  const periodeParDefaut = ajusterPeriodeApresCalendrierPublie(
    dateDebut,
    dateFin,
    borneGlobale.dateDebutMin,
  );

  const initialMode =
    params.mode === "par-ligne" || params.mode === "par-astreinte"
      ? "par-ligne"
      : "global";

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Affectation des astreintes</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Simulation obligatoire avant enregistrement (cahier des charges §3.2).
          Choisissez le mode « Tout en même temps » (historique) ou « Par
          astreinte » (une ligne, avec lots et publication différée).
        </p>
      </div>

      <AffectationAstreintesPanel
        defaultDateDebut={periodeParDefaut.dateDebut}
        defaultDateFin={periodeParDefaut.dateFin}
        borneCalendrierGlobal={borneGlobale}
        bornesCalendrierParLigne={bornesParLigne}
        lignes={lignes}
        campagneProchaine={contexte.campagneProchaine}
        lotEnAttente={contexte.lotEnAttente}
        initialMode={initialMode}
      />
    </main>
  );
}
