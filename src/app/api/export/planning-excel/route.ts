import { NextResponse } from "next/server";
import { assertAuthenticatedApi } from "@/server/assert-authenticated-api";
import { parseMoisParam } from "@/server/astreintes";
import { genererPlanningExcel } from "@/server/planning-excel";

export async function GET(request: Request) {
  const auth = await assertAuthenticatedApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const mois = parseMoisParam(searchParams.get("mois")).value;
  const ligneId = searchParams.get("ligneId")?.trim() || undefined;

  try {
    const { buffer, filename } = await genererPlanningExcel({ mois, ligneId });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erreur génération Excel planning:", error);
    return NextResponse.json(
      { error: "Impossible de générer le fichier Excel du planning." },
      { status: 500 },
    );
  }
}
