import { NextResponse } from "next/server";
import { assertAuthenticatedApi } from "@/server/assert-authenticated-api";
import {
  createDisponibilite,
  getMesDisponibilitesMoisData,
  listDisponibilites,
  validateDisponibiliteInput,
} from "@/server/disponibilites";

export async function GET(request: Request) {
  const auth = await assertAuthenticatedApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const mois = searchParams.get("mois");
  const isCadre = auth.user.role === "CADRE";

  if (mois) {
    const requestedIadeId = searchParams.get("iadeId");
    const targetIadeId =
      isCadre && requestedIadeId ? requestedIadeId : auth.user.id;

    const data = await getMesDisponibilitesMoisData({
      iadeId: targetIadeId,
      mois,
    });
    return NextResponse.json(data);
  }

  const periodeDebut = searchParams.get("periodeDebut") ?? undefined;
  const periodeFin = searchParams.get("periodeFin") ?? undefined;
  const iadeId = isCadre
    ? (searchParams.get("iadeId") ?? undefined)
    : auth.user.id;

  const disponibilites = await listDisponibilites({
    iadeId,
    periodeDebut,
    periodeFin,
    includeIade: isCadre,
  });

  return NextResponse.json(disponibilites);
}

export async function POST(request: Request) {
  const auth = await assertAuthenticatedApi();
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

  const validated = validateDisponibiliteInput(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const result = await createDisponibilite(validated, auth.user.id, auth.user.id);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result.disponibilite, { status: 201 });
}
