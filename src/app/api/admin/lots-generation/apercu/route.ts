import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import { construireApercuDepuisLot } from "@/server/lot-generation";

export async function GET(request: Request) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const lotId = searchParams.get("lotId")?.trim() ?? "";

  if (!lotId) {
    return NextResponse.json({ error: "lotId requis." }, { status: 400 });
  }

  const result = await construireApercuDepuisLot(lotId);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result);
}
