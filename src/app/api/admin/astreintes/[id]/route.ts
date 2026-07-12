import { NextResponse } from "next/server";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  cancelAstreinte,
  updateAstreinte,
  validateUpdateAstreinteInput,
  type AstreinteServiceError,
  type AstreinteValidationError,
} from "@/server/astreintes";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function validationErrorResponse(error: AstreinteValidationError) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: error.error,
      },
    },
    { status: 400 },
  );
}

function serviceErrorResponse(
  error: AstreinteServiceError,
  status = 400,
) {
  return NextResponse.json(error, { status });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;

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

  const validated = validateUpdateAstreinteInput(body);
  if ("error" in validated) {
    return validationErrorResponse(validated);
  }

  const result = await updateAstreinte(id, validated, auth.user.id);
  if ("success" in result && result.success === false) {
    const status = result.error.code === "ASTREINTE_NOT_FOUND" ? 404 : 400;
    return serviceErrorResponse(result, status);
  }

  if ("astreinte" in result) {
    return NextResponse.json({
      astreinte: result.astreinte,
      warning: result.warning ?? null,
    });
  }

  return serviceErrorResponse({
    success: false,
    error: { code: "INVALID_INPUT", message: "Réponse inattendue." },
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  const result = await cancelAstreinte(id, auth.user.id);

  if ("success" in result && result.success === false) {
    const status = result.error.code === "ASTREINTE_NOT_FOUND" ? 404 : 400;
    return serviceErrorResponse(result, status);
  }

  if ("astreinte" in result) {
    return NextResponse.json(result.astreinte);
  }

  return serviceErrorResponse({
    success: false,
    error: { code: "INVALID_INPUT", message: "Réponse inattendue." },
  });
}
