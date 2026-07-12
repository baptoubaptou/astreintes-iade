import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  listPoidsCreneauxParLigne,
  upsertPoidsCreneau,
  validateUpsertPoidsCreneauInput,
} from "@/server/poids-creneaux";

export async function GET() {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const lignes = await listPoidsCreneauxParLigne();
  return NextResponse.json({ lignes });
}

export async function PATCH(request: Request) {
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

  const validated = validateUpsertPoidsCreneauInput(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const result = await upsertPoidsCreneau(validated);
  if ("error" in result) {
    const status = result.field === "ligneId" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result.poidsCreneau);
}
