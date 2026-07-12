import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  deleteUtilisateur,
  getUtilisateurById,
  mapUtilisateurPrismaError,
  updateUtilisateur,
  validateUpdateUtilisateurInput,
} from "@/server/utilisateurs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;

  const existing = await getUtilisateurById(id);
  if (!existing) {
    return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const validated = validateUpdateUtilisateurInput(body);

  if ("error" in validated) {
    return NextResponse.json(
      { error: validated.error, field: validated.field },
      { status: 400 },
    );
  }

  try {
    const result = await updateUtilisateur(id, validated);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const mapped = mapUtilisateurPrismaError(error);
    if (mapped) {
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const result = await deleteUtilisateur(id, auth.user.id);

  if ("error" in result) {
    const status = result.error.includes("introuvable") ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ success: true });
}
