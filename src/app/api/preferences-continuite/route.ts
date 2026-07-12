import { NextResponse } from "next/server";
import { assertAuthenticatedApi } from "@/server/assert-authenticated-api";
import {
  createPreferenceContinuite,
  listPreferencesContinuite,
  validatePreferenceContinuiteInput,
} from "@/server/preferences-continuite";

export async function GET(request: Request) {
  const auth = await assertAuthenticatedApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const mois = searchParams.get("mois") ?? undefined;
  const isCadre = auth.user.role === "CADRE";
  const requestedIadeId = searchParams.get("iadeId");
  const targetIadeId =
    isCadre && requestedIadeId ? requestedIadeId : auth.user.id;

  const preferences = await listPreferencesContinuite({
    iadeId: targetIadeId,
    mois,
  });

  return NextResponse.json(preferences);
}

export async function POST(request: Request) {
  const auth = await assertAuthenticatedApi();
  if ("response" in auth) {
    return auth.response;
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Corps JSON invalide." },
      { status: 400 },
    );
  }

  const validated = validatePreferenceContinuiteInput(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const result = await createPreferenceContinuite(validated, auth.user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result.preference, { status: 201 });
}
