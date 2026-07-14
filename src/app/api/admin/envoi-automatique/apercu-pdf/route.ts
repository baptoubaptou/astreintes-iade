import { JourSemaine } from "@prisma/client";
import { NextResponse } from "next/server";
import { calculerProchainEnvoiEtPeriode } from "@/lib/envoi-automatique-periode";
import { assertCadreApi } from "@/server/assert-cadre-api";
import { getOuCreerConfiguration } from "@/server/envoi-automatique";
import { genererPlanningPdfPeriode } from "@/server/planning-pdf";

export async function GET(request: Request) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const jourEnvoiParam = searchParams.get("jourEnvoi")?.trim();

  let jourEnvoi: JourSemaine;

  if (
    jourEnvoiParam &&
    Object.values(JourSemaine).includes(jourEnvoiParam as JourSemaine)
  ) {
    jourEnvoi = jourEnvoiParam as JourSemaine;
  } else {
    const configuration = await getOuCreerConfiguration();
    jourEnvoi = configuration.jourEnvoi;
  }

  const { periodeDebut, periodeFin } =
    calculerProchainEnvoiEtPeriode(jourEnvoi);

  try {
    const { buffer, filename } = await genererPlanningPdfPeriode({
      periodeDebut,
      periodeFin,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erreur aperçu PDF envoi automatique:", error);
    return NextResponse.json(
      { error: "Impossible de générer l'aperçu PDF." },
      { status: 500 },
    );
  }
}
