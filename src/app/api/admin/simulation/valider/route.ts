import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  parsePropositionsInput,
  validerSimulationPlanning,
} from "@/server/simulation-planning";

export async function POST(request: Request) {
  const auth = await assertCadreApi();
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

  const propositions = parsePropositionsInput(body.propositions);
  if ("error" in propositions) {
    return NextResponse.json({ error: propositions.error }, { status: 400 });
  }

  const result = await validerSimulationPlanning(propositions, auth.user.id);

  if (!result.success) {
    return NextResponse.json(result, { status: 409 });
  }

  return NextResponse.json(result);
}
