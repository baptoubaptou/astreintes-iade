import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  createUtilisateur,
  listUtilisateurs,
  mapUtilisateurPrismaError,
  validateCreateUtilisateurInput,
} from "@/server/utilisateurs";

export async function GET() {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const utilisateurs = await listUtilisateurs();
  return NextResponse.json(utilisateurs);
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

  const validated = validateCreateUtilisateurInput(body);

  if ("error" in validated) {
    return NextResponse.json(
      { error: validated.error, field: validated.field },
      { status: 400 },
    );
  }

  try {
    const utilisateur = await createUtilisateur(validated, validated.role);
    return NextResponse.json(utilisateur, { status: 201 });
  } catch (error) {
    const mapped = mapUtilisateurPrismaError(error);
    if (mapped) {
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    throw error;
  }
}
