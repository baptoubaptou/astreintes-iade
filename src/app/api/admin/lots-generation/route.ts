import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import { enregistrerLotFromSimulation } from "@/server/lot-generation";
import {
  parsePeriodeInput,
  parsePropositionsInput,
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
    typeof body.ligneId === "string" ? body.ligneId.trim() : "";
  if (!ligneId) {
    return NextResponse.json({ error: "ligneId requis." }, { status: 400 });
  }

  const propositions = parsePropositionsInput(body.propositions);
  if ("error" in propositions) {
    return NextResponse.json({ error: propositions.error }, { status: 400 });
  }

  const publier = body.publier === true;

  const result = await enregistrerLotFromSimulation({
    propositions,
    ligneId,
    dateDebut: periode.dateDebut,
    dateFin: periode.dateFin,
    publier,
    acteurId: auth.user.id,
  });

  if (!result.success) {
    return NextResponse.json(result, { status: 409 });
  }

  return NextResponse.json(result);
}
