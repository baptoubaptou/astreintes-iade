import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  createJourFerieManuel,
  listJoursFeries,
  parseAnneeJoursFeries,
  synchroniserJoursFeries,
  validateCreateJourFerieInput,
} from "@/server/jours-feries";

export async function GET(request: Request) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const annee = parseAnneeJoursFeries(searchParams.get("annee"));
  const joursFeries = await listJoursFeries(annee);

  return NextResponse.json({ annee, joursFeries });
}

export async function POST(request: Request) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  if (body.action === "synchroniser") {
    const annee =
      typeof body.annee === "number"
        ? body.annee
        : parseAnneeJoursFeries(
            typeof body.annee === "string" ? body.annee : null,
          );

    const result = await synchroniserJoursFeries(annee);
    const joursFeries = await listJoursFeries(annee);

    return NextResponse.json({ ...result, joursFeries });
  }

  const validated = validateCreateJourFerieInput(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const result = await createJourFerieManuel(validated);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json(result.jourFerie, { status: 201 });
}
