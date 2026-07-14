import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import { setCampagneArchivee } from "@/server/campagnes";

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

  const archivee =
    body.archivee === true ||
    body.archivee === "true" ||
    body.action === "archiver";

  const desarchiver =
    body.archivee === false ||
    body.archivee === "false" ||
    body.action === "desarchiver";

  if (archivee === desarchiver) {
    return NextResponse.json(
      {
        error:
          "Indiquez archivee=true (ou action=archiver) ou archivee=false (ou action=desarchiver).",
      },
      { status: 400 },
    );
  }

  const result = await setCampagneArchivee(id, archivee);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result);
}
