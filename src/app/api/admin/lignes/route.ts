import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  createLigneAstreinte,
  listLignesAstreinte,
  validateCreateLigneInput,
} from "@/server/lignes";

export async function GET() {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const lignes = await listLignesAstreinte();
  return NextResponse.json(lignes);
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

  const validated = validateCreateLigneInput(body);

  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const ligne = await createLigneAstreinte(validated);
    return NextResponse.json(ligne, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Une ligne avec ce nom existe déjà." },
        { status: 409 },
      );
    }

    throw error;
  }
}
