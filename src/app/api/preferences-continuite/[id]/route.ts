import { NextResponse } from "next/server";
import { assertAuthenticatedApi } from "@/server/assert-authenticated-api";
import { deletePreferenceContinuite } from "@/server/preferences-continuite";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await assertAuthenticatedApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const result = await deletePreferenceContinuite(id, auth.user.id);

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    );
  }

  return NextResponse.json({ success: true });
}
