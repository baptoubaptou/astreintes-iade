import { NextResponse } from "next/server";
import { ModeAttribution } from "@prisma/client";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  ensureParametreLisseSeuilEcartAberrant,
  getModeAttribution,
  listSeuilsEcartAberrantParLigne,
  setModeAttribution,
  upsertSeuilEcartAberrantLigne,
  validateUpsertSeuilEcartAberrantInput,
} from "@/server/parametre-algorithme";

export async function GET() {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  await ensureParametreLisseSeuilEcartAberrant();

  const [mode, seuilsEcartAberrant] = await Promise.all([
    getModeAttribution(),
    listSeuilsEcartAberrantParLigne(),
  ]);

  return NextResponse.json({ mode, seuilsEcartAberrant });
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

  if (body.seuilEcartAberrant !== undefined) {
    const validated = validateUpsertSeuilEcartAberrantInput(
      body.seuilEcartAberrant as Record<string, unknown>,
    );

    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const result = await upsertSeuilEcartAberrantLigne(validated);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const seuilsEcartAberrant = await listSeuilsEcartAberrantParLigne();
    return NextResponse.json({ seuilsEcartAberrant });
  }

  const mode =
    typeof body.mode === "string" ? body.mode.trim() : ModeAttribution.GLOUTON;

  if (!Object.values(ModeAttribution).includes(mode as ModeAttribution)) {
    return NextResponse.json({ error: "Mode invalide." }, { status: 400 });
  }

  const result = await setModeAttribution(mode as ModeAttribution);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ mode });
}
