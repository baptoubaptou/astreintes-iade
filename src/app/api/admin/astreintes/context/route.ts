import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import { getAstreinteFormContext } from "@/server/astreinte-creneaux";

export async function GET(request: Request) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const ligneId = searchParams.get("ligneId");

  if (!date || !ligneId) {
    return NextResponse.json(
      { error: "date et ligneId sont requis." },
      { status: 400 },
    );
  }

  const context = await getAstreinteFormContext(date, ligneId);
  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: 400 });
  }

  return NextResponse.json(context);
}
