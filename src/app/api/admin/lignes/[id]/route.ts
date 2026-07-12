import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  getLigneAstreinteById,
  updateLigneAstreinte,
  validateUpdateLigneInput,
} from "@/server/lignes";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;

  const existing = await getLigneAstreinteById(id);
  if (!existing) {
    return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 });
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const validated = validateUpdateLigneInput(body);

  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const ligne = await updateLigneAstreinte(id, validated);
    return NextResponse.json(ligne);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 });
    }

    throw error;
  }
}
