import { NextResponse } from "next/server";
import { assertAuthenticatedApi } from "@/server/assert-authenticated-api";
import { parseAnneeParam } from "@/server/points";
import { genererPointsPdf } from "@/server/points-pdf";

export async function GET(request: Request) {
  const auth = await assertAuthenticatedApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const annee = parseAnneeParam(searchParams.get("annee"));

  try {
    const { buffer, filename } = await genererPointsPdf(annee);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erreur génération PDF points:", error);
    return NextResponse.json(
      { error: "Impossible de générer le PDF des points." },
      { status: 500 },
    );
  }
}
