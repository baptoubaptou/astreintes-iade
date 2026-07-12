import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  createAstreinte,
  listAstreintes,
  parseMoisParam,
  validateCreateAstreinteInput,
  type AstreinteServiceError,
  type AstreinteValidationError,
} from "@/server/astreintes";

function validationErrorResponse(error: AstreinteValidationError) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: error.error,
        field: error.field,
      },
    },
    { status: 400 },
  );
}

function serviceErrorResponse(error: AstreinteServiceError) {
  return NextResponse.json(error, { status: 400 });
}

export async function GET(request: Request) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const mois = parseMoisParam(searchParams.get("mois")).value;
  const ligneId = searchParams.get("ligneId") ?? undefined;
  const iadeId = searchParams.get("iadeId") ?? undefined;

  const astreintes = await listAstreintes({ mois, ligneId, iadeId });
  return NextResponse.json(astreintes);
}

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
      {
        success: false,
        error: { code: "INVALID_INPUT", message: "Corps JSON invalide." },
      },
      { status: 400 },
    );
  }

  const validated = validateCreateAstreinteInput(body);
  if ("error" in validated) {
    return validationErrorResponse(validated);
  }

  const result = await createAstreinte(validated, auth.user.id);
  if ("success" in result && result.success === false) {
    return serviceErrorResponse(result);
  }

  if ("astreintes" in result) {
    return NextResponse.json(
      {
        astreintes: result.astreintes,
        astreinte: result.astreintes[0] ?? null,
        warning: result.warning ?? null,
      },
      { status: 201 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: { code: "INVALID_INPUT", message: "Réponse inattendue." },
    },
    { status: 400 },
  );
}
