import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { getCurrentUser } from "@/server/auth";

export default async function AppPage() {
  const user = await getCurrentUser();

  if (user?.role === Role.CADRE) {
    redirect("/admin/dashboard");
  }

  return <PageShell title="Tableau de bord" />;
}
