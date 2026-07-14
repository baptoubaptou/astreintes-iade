import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import { listerCreneauxAPourvoir } from "@/server/a-pourvoir";
import { parseDateInput } from "@/server/astreintes";

export async function GET(request: Request) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const dateDebutStr = searchParams.get("dateDebut")?.trim() ?? "";
  const dateFinStr = searchParams.get("dateFin")?.trim() ?? "";

  if (!dateDebutStr || !dateFinStr) {
    return NextResponse.json(
      { error: "Les paramètres dateDebut et dateFin sont requis." },
      { status: 400 },
    );
  }

  const dateDebut = parseDateInput(dateDebutStr);
  const dateFin = parseDateInput(dateFinStr);

  if (!dateDebut || !dateFin) {
    return NextResponse.json({ error: "Dates invalides." }, { status: 400 });
  }

  if (dateFin < dateDebut) {
    return NextResponse.json(
      {
        error:
          "La date de fin doit être postérieure ou égale à la date de début.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await listerCreneauxAPourvoir(dateDebut, dateFin);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Erreur a-pourvoir:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur interne lors du calcul des créneaux à pourvoir.",
      },
      { status: 500 },
    );
  }
}
