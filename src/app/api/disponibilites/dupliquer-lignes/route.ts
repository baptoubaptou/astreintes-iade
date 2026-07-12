import { NextResponse } from "next/server";
import { assertAuthenticatedApi } from "@/server/assert-authenticated-api";
import {
  appliquerDupliquerDisponibilitesLignes,
  previewDupliquerDisponibilitesLignes,
} from "@/server/disponibilites";

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

  const moisSource =
    typeof body.moisSource === "string" ? body.moisSource.trim() : "";
  const ligneSourceId =
    typeof body.ligneSourceId === "string" ? body.ligneSourceId.trim() : "";
  const lignesCibles = Array.isArray(body.lignesCibles)
    ? body.lignesCibles.filter((value): value is string => typeof value === "string")
    : [];
  const dryRun = body.dryRun === true;

  if (!moisSource || !ligneSourceId) {
    return NextResponse.json(
      { error: "moisSource et ligneSourceId sont requis." },
      { status: 400 },
    );
  }

  const options = {
    iadeId: auth.user.id,
    mois: moisSource,
    ligneSourceId,
    lignesCibles,
  };

  if (dryRun) {
    const preview = await previewDupliquerDisponibilitesLignes(options);
    if ("error" in preview) {
      return NextResponse.json({ error: preview.error }, { status: 400 });
    }
    return NextResponse.json(preview);
  }

  const result = await appliquerDupliquerDisponibilitesLignes({
    ...options,
    acteurId: auth.user.id,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const data = await previewDupliquerDisponibilitesLignes(options);
  return NextResponse.json({
    created: result.created,
    preview: "error" in data ? null : data,
  });
}
