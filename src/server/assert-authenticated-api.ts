import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";

export async function assertAuthenticatedApi() {
  const user = await getCurrentUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { error: "Non authentifié" },
        { status: 401 },
      ),
    };
  }

  return { user };
}
