import { NextResponse } from "next/server";
import { assertAuthenticatedApi } from "@/server/assert-authenticated-api";
import {
  creerOffreBourse,
  getOffresBoursePourIade,
} from "@/server/bourse-astreintes";

export async function GET() {
  const auth = await assertAuthenticatedApi();
  if ("response" in auth) {
    return auth.response;
  }

  const offres = await getOffresBoursePourIade(auth.user.id);
  return NextResponse.json({ offres });
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
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const astreinteId =
    typeof body.astreinteId === "string" ? body.astreinteId.trim() : "";

  if (!astreinteId) {
    return NextResponse.json(
      { error: "L'astreinte est requise." },
      { status: 400 },
    );
  }

  const result = await creerOffreBourse(astreinteId, auth.user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    offre: {
      id: result.offre.id,
      dateFermeture: result.offre.dateFermeture.toISOString(),
      dureeFenetreHeures: result.offre.dureeFenetreHeures,
    },
  });
}
