import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";

export async function assertCadreApi() {
  const user = await getCurrentUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 },
      ),
    };
  }

  if (user.role !== "CADRE") {
    return {
      response: NextResponse.json({ error: "Accès refusé" }, { status: 403 }),
    };
  }

  return { user };
}
