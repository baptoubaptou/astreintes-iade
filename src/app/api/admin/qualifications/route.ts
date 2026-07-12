import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { assertCadreApi } from "@/server/assert-cadre-api";
import {
  createQualification,
  deleteQualification,
  getQualificationMatrix,
  getUncheckWarning,
  validateQualificationInput,
} from "@/server/qualifications";

export async function GET(request: Request) {
  const auth = await assertCadreApi();
  if ("response" in auth) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const iadeId = searchParams.get("iadeId");
  const ligneId = searchParams.get("ligneId");

  if (iadeId && ligneId) {
    const warning = await getUncheckWarning(iadeId, ligneId);
    return NextResponse.json(warning);
  }

  const matrix = await getQualificationMatrix();
  return NextResponse.json(matrix);
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
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const validated = validateQualificationInput(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const result = await createQualification(validated);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.qualification, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Cette qualification existe déjà." },
        { status: 409 },
      );
    }

    throw error;
  }
}

export async function DELETE(request: Request) {
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

  const validated = validateQualificationInput(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const result = await deleteQualification(validated);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
