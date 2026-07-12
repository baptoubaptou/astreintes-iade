import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";

export async function requireCadre() {
  const user = await getCurrentUser();

  if (!user || user.role !== "CADRE") {
    redirect("/app");
  }

  return user;
}
