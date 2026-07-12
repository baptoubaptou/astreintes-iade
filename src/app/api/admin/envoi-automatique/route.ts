import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  getOuCreerConfiguration,
  updateConfigurationEnvoiAutomatique,
  validateUpdateConfigurationEnvoiAutomatique,
} from "@/server/envoi-automatique";

export async function GET() {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const configuration = await getOuCreerConfiguration();
  return NextResponse.json(configuration);
}

export async function PATCH(request: Request) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const validated = validateUpdateConfigurationEnvoiAutomatique(body);

  if ("error" in validated) {
    return NextResponse.json(
      { error: validated.error, field: validated.field },
      { status: 400 },
    );
  }

  const configuration = await updateConfigurationEnvoiAutomatique(validated);
  return NextResponse.json(configuration);
}
