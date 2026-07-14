"use client";

import type { BorneCalendrierPublie } from "@/server/calendrier-publie";
import { useState } from "react";
import type { LigneCampagneOption } from "@/server/campagnes";
import type { LotEnAttenteSummary } from "@/server/lot-generation";
import { ModeParAstreintePanel } from "@/components/affectation-astreintes/mode-par-astreinte-panel";
import { ModeToutEnMemeTempsPanel } from "@/components/affectation-astreintes/mode-tout-en-meme-temps-panel";

type ModeAffectation = "global" | "par-ligne";

type CampagneProchaine = {
  id: string;
  ligneId: string;
  ligneNom: string;
  periodeDebut: string;
  periodeFin: string;
  dateGenerationPrevue: string;
};

type AffectationAstreintesPanelProps = {
  defaultDateDebut: string;
  defaultDateFin: string;
  borneCalendrierGlobal: BorneCalendrierPublie;
  bornesCalendrierParLigne: Record<string, BorneCalendrierPublie>;
  lignes: LigneCampagneOption[];
  campagneProchaine: CampagneProchaine | null;
  lotEnAttente: LotEnAttenteSummary | null;
  initialMode?: ModeAffectation;
};

export function AffectationAstreintesPanel({
  defaultDateDebut,
  defaultDateFin,
  borneCalendrierGlobal,
  bornesCalendrierParLigne,
  lignes,
  campagneProchaine,
  lotEnAttente,
  initialMode = "global",
}: AffectationAstreintesPanelProps) {
  const [mode, setMode] = useState<ModeAffectation>(initialMode);

  return (
    <div className="space-y-6">
      <section className="rounded border border-zinc-200 p-4">
        <p className="mb-3 text-sm font-medium text-zinc-700">Mode de génération</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode-affectation"
              checked={mode === "global"}
              onChange={() => setMode("global")}
              className="size-4"
            />
            Tout en même temps
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode-affectation"
              checked={mode === "par-ligne"}
              onChange={() => setMode("par-ligne")}
              className="size-4"
            />
            Par astreinte
          </label>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {mode === "global"
            ? "Simulation sur toutes les lignes actives dans l'ordre de priorité, en une exécution."
            : "Une ligne à la fois, avec verrou inter-lignes jusqu'à publication ou annulation du lot."}
        </p>
      </section>

      {mode === "global" ? (
        <ModeToutEnMemeTempsPanel
          defaultDateDebut={defaultDateDebut}
          defaultDateFin={defaultDateFin}
          borneCalendrier={borneCalendrierGlobal}
        />
      ) : (
        <ModeParAstreintePanel
          lignes={lignes}
          campagneProchaine={campagneProchaine}
          lotEnAttenteInitial={lotEnAttente}
          defaultDateDebut={defaultDateDebut}
          defaultDateFin={defaultDateFin}
          bornesCalendrierParLigne={bornesCalendrierParLigne}
        />
      )}
    </div>
  );
}
