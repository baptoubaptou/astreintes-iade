import type { TypeCreneau } from "@prisma/client";
import { getLigneColorClass } from "@/lib/ligne-colors";
import type { PropositionAffectation } from "@/server/algorithme-affectation";
import {
  creneauJourAssocie,
  creneauNuitAssocie,
  estCreneauJour,
  estCreneauNuit,
  libelleTypeCreneau,
} from "@/server/astreinte-creneaux";

type SimulationCreneauDisplayProps = {
  propositions: PropositionAffectation[];
  ligneId: string;
  ligneNom: string;
};

type CreneauGroupe =
  | { kind: "simple"; proposition: PropositionAffectation }
  | {
      kind: "split";
      jour?: PropositionAffectation;
      nuit?: PropositionAffectation;
      labelJour: string;
      labelNuit: string;
    };

function libellePourProposition(proposition: PropositionAffectation): string {
  return libelleTypeCreneau(proposition.typeCreneau);
}

function libelleSlotManquant(
  typeCreneau: TypeCreneau | null,
  fallback: string,
): string {
  return typeCreneau ? libelleTypeCreneau(typeCreneau) : fallback;
}

function grouperPropositions(
  propositions: PropositionAffectation[],
): CreneauGroupe[] {
  if (propositions.length === 0) {
    return [];
  }

  if (
    propositions.length === 1 &&
    propositions[0]!.typeCreneau === "NUIT_SEMAINE"
  ) {
    return [{ kind: "simple", proposition: propositions[0]! }];
  }

  const jour = propositions.find((p) => estCreneauJour(p.typeCreneau));
  const nuit = propositions.find((p) => estCreneauNuit(p.typeCreneau));

  if (jour || nuit) {
    const typeJourInfer =
      jour?.typeCreneau ??
      (nuit ? creneauJourAssocie(nuit.typeCreneau) : null);
    const typeNuitInfer =
      nuit?.typeCreneau ??
      (jour ? creneauNuitAssocie(jour.typeCreneau) : null);

    return [
      {
        kind: "split",
        jour,
        nuit,
        labelJour: libelleSlotManquant(typeJourInfer, "Jour"),
        labelNuit: libelleSlotManquant(typeNuitInfer, "Nuit"),
      },
    ];
  }

  return propositions.map((proposition) => ({
    kind: "simple" as const,
    proposition,
  }));
}

function PropositionStatut({
  proposition,
  creneauLabel,
}: {
  proposition: PropositionAffectation;
  creneauLabel?: string;
}) {
  const prefix = creneauLabel ? `${creneauLabel} · ` : "";

  if (proposition.dejaPlanifie) {
    return (
      <span
        className="inline-block rounded border border-zinc-300 bg-zinc-100 px-2 py-1 text-xs text-zinc-700"
        title={`${proposition.pointsAttribues} pt`}
      >
        {prefix}
        {proposition.iadeNom} (déjà planifié)
      </span>
    );
  }

  if (proposition.nonPourvu) {
    return (
      <span className="inline-block rounded border border-orange-300 bg-orange-100 px-2 py-1 text-xs font-medium text-orange-900">
        {prefix}Non pourvu
      </span>
    );
  }

  return (
    <span title={`${proposition.pointsAttribues} pt`}>
      {prefix}
      {proposition.iadeNom}
      {proposition.tirageAuSort ? " 🎲" : ""}
    </span>
  );
}

function BlocUnifie({
  proposition,
  creneauLabel,
  colorClass,
}: {
  proposition: PropositionAffectation;
  creneauLabel: string;
  colorClass: string;
}) {
  if (proposition.dejaPlanifie || proposition.nonPourvu) {
    return (
      <PropositionStatut
        proposition={proposition}
        creneauLabel={creneauLabel}
      />
    );
  }

  return (
    <span
      className={`inline-block rounded border px-2 py-1 text-xs ${colorClass}`}
      title={`${proposition.pointsAttribues} pt`}
    >
      <PropositionStatut
        proposition={proposition}
        creneauLabel={creneauLabel}
      />
    </span>
  );
}

function DemiBloc({
  label,
  proposition,
}: {
  label: string;
  proposition?: PropositionAffectation;
}) {
  if (!proposition) {
    return (
      <div className="px-1.5 py-1">
        <span className="font-medium">{label}</span>
        <span className="mx-1">·</span>
        <span className="opacity-60">—</span>
      </div>
    );
  }

  if (proposition.dejaPlanifie) {
    return (
      <div className="border-t border-zinc-200 bg-zinc-100 px-1.5 py-1 first:border-t-0">
        <span className="font-medium">{label}</span>
        <span className="mx-1">·</span>
        <span className="text-zinc-700">
          {proposition.iadeNom} (déjà planifié)
        </span>
      </div>
    );
  }

  if (proposition.nonPourvu) {
    return (
      <div className="border-t border-orange-200 bg-orange-100 px-1.5 py-1 first:border-t-0">
        <span className="font-medium text-orange-900">{label}</span>
        <span className="mx-1 text-orange-900">·</span>
        <span className="font-medium text-orange-900">Non pourvu</span>
      </div>
    );
  }

  return (
    <div className="border-t border-current/15 px-1.5 py-1 first:border-t-0">
      <span className="font-medium">{label}</span>
      <span className="mx-1">·</span>
      <span title={`${proposition.pointsAttribues} pt`}>
        {proposition.iadeNom}
        {proposition.tirageAuSort ? " 🎲" : ""}
      </span>
    </div>
  );
}

function BlocSplit({
  jour,
  nuit,
  labelJour,
  labelNuit,
  colorClass,
}: {
  jour?: PropositionAffectation;
  nuit?: PropositionAffectation;
  labelJour: string;
  labelNuit: string;
  colorClass: string;
}) {
  const hasFilled =
    (jour && !jour.nonPourvu && !jour.dejaPlanifie) ||
    (nuit && !nuit.nonPourvu && !nuit.dejaPlanifie);
  const allSpecial =
    (!jour || jour.nonPourvu || jour.dejaPlanifie) &&
    (!nuit || nuit.nonPourvu || nuit.dejaPlanifie);

  if (!hasFilled || allSpecial) {
    return (
      <div className="overflow-hidden rounded border border-zinc-200 text-xs">
        <DemiBloc label={labelJour} proposition={jour} />
        <DemiBloc label={labelNuit} proposition={nuit} />
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded border text-xs ${colorClass}`}>
      <DemiBloc label={labelJour} proposition={jour} />
      <DemiBloc label={labelNuit} proposition={nuit} />
    </div>
  );
}

export function SimulationCreneauDisplay({
  propositions,
  ligneId,
  ligneNom,
}: SimulationCreneauDisplayProps) {
  const groupes = grouperPropositions(propositions);
  const colorClass = getLigneColorClass(ligneId, ligneNom);

  if (groupes.length === 0) {
    return <span className="text-zinc-400">—</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      {groupes.map((groupe, index) => {
        switch (groupe.kind) {
          case "simple":
            return (
              <BlocUnifie
                key={`simple-${groupe.proposition.typeCreneau}-${index}`}
                proposition={groupe.proposition}
                creneauLabel={libellePourProposition(groupe.proposition)}
                colorClass={colorClass}
              />
            );
          case "split":
            return (
              <BlocSplit
                key={`split-${index}`}
                jour={groupe.jour}
                nuit={groupe.nuit}
                labelJour={groupe.labelJour}
                labelNuit={groupe.labelNuit}
                colorClass={colorClass}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
