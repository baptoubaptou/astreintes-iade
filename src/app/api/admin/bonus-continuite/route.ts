import { NextResponse } from "next/server";
import { TypeBonusContinuite } from "@prisma/client";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  getBonusContinuiteMatrix,
  TYPES_BONUS_CONTINUITE,
  upsertBonusContinuite,
} from "@/server/bonus-continuite";

export async function GET() {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const lignes = await getBonusContinuiteMatrix();
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

  const ligneId = typeof body.ligneId === "string" ? body.ligneId.trim() : "";
  const type = typeof body.type === "string" ? body.type : "";
  const bonus = Number(body.bonus);

  if (!ligneId) {
    return NextResponse.json({ error: "La ligne est requise." }, { status: 400 });
  }

  if (!TYPES_BONUS_CONTINUITE.includes(type as TypeBonusContinuite)) {
    return NextResponse.json({ error: "Type de bonus invalide." }, { status: 400 });
  }

  const result = await upsertBonusContinuite({
    ligneId,
    type: type as TypeBonusContinuite,
    bonus,
  });

  if ("error" in result) {
    const status = result.field === "ligneId" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result.bonusContinuite);
}
