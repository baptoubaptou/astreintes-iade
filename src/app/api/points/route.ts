import { NextResponse } from "next/server";
import { assertAuthenticatedApi } from "@/server/assert-authenticated-api";
import { getPointsOverview, parseAnneeParam } from "@/server/points";

export async function GET(request: Request) {
  const auth = await assertAuthenticatedApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const annee = parseAnneeParam(searchParams.get("annee"));
  const overview = await getPointsOverview(annee);

  return NextResponse.json(overview);
}
