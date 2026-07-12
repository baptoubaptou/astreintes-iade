import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import { toggleJourFerieActif } from "@/server/jours-feries";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  if (typeof body.actif !== "boolean") {
    return NextResponse.json(
      { error: "Le champ actif (boolean) est requis." },
      { status: 400 },
    );
  }

  const confirmer = body.confirmer === true;

  const result = await toggleJourFerieActif(id, body.actif, { confirmer });

  if ("requiresConfirmation" in result && result.requiresConfirmation) {
    return NextResponse.json(result);
  }

  if ("astreintesBloquantes" in result && result.astreintesBloquantes.length > 0) {
    return NextResponse.json(result, { status: 400 });
  }

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  if ("jourFerie" in result) {
    return NextResponse.json(result.jourFerie);
  }

  return NextResponse.json(
    { error: "Réponse inattendue du serveur." },
    { status: 500 },
  );
}
