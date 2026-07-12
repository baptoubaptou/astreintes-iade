import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  createFenetreGeneration,
  confirmerCampagne,
  listCampagnesParLigne,
  listLignesCampagneOptions,
  updateFenetreGeneration,
} from "@/server/campagnes";
import { publierCampagne } from "@/server/publication-planning";

export async function GET() {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const [lignes, lignesOptions] = await Promise.all([
    listCampagnesParLigne(),
    listLignesCampagneOptions(),
  ]);

  return NextResponse.json({ lignes, lignesOptions });
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

  if (body.action === "confirmer") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json(
        { error: "Identifiant de campagne manquant." },
        { status: 400 },
      );
    }

    const result = await confirmerCampagne(id, auth.user.id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(result);
  }

  if (body.action === "publier") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json(
        { error: "Identifiant de campagne manquant." },
        { status: 400 },
      );
    }

    const result = await publierCampagne(id, auth.user.id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(result);
  }

  const result = await createFenetreGeneration(body);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, field: result.field },
      { status: 400 },
    );
  }

  return NextResponse.json(result, { status: 201 });
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

  const result = await updateFenetreGeneration(body);
  if ("error" in result) {
    const status = result.error.includes("confirmée") ? 409 : 400;
    return NextResponse.json(
      { error: result.error, field: result.field },
      { status },
    );
  }

  return NextResponse.json(result);
}
