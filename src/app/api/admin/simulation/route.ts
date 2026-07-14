import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import { getErreurDateDebutCalendrierPublie } from "@/server/calendrier-publie";
import { getErreurVerrouSimulationParAstreinte } from "@/server/lot-generation";
import {
  executerSimulationPlanning,
  parsePeriodeInput,
} from "@/server/simulation-planning";

export async function POST(request: Request) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Corps JSON invalide." },
      { status: 400 },
    );
  }

  const periode = parsePeriodeInput(body);
  if ("error" in periode) {
    return NextResponse.json({ error: periode.error }, { status: 400 });
  }

  const ligneId =
    typeof body.ligneId === "string" && body.ligneId.trim()
      ? body.ligneId.trim()
      : undefined;

  const erreurVerrou = await getErreurVerrouSimulationParAstreinte(ligneId);
  if (erreurVerrou) {
    return NextResponse.json({ error: erreurVerrou }, { status: 409 });
  }

  const erreurCalendrier = await getErreurDateDebutCalendrierPublie(
    periode.dateDebut,
    ligneId,
  );
  if (erreurCalendrier) {
    return NextResponse.json({ error: erreurCalendrier }, { status: 400 });
  }

  try {
    const result = await executerSimulationPlanning(
      periode.dateDebut,
      periode.dateFin,
      ligneId,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Erreur simulation:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur interne lors de la simulation.",
      },
      { status: 500 },
    );
  }
}
