import { NextResponse } from "next/server";
import { assertAuthenticatedApi } from "@/server/assert-authenticated-api";
import { postulerOffreBourse } from "@/server/bourse-astreintes";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const auth = await assertAuthenticatedApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const result = await postulerOffreBourse(id, auth.user.id);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
