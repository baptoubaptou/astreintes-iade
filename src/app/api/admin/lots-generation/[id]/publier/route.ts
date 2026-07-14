import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import { publierLotGeneration } from "@/server/lot-generation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const result = await publierLotGeneration(id, auth.user.id);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json(result);
}
