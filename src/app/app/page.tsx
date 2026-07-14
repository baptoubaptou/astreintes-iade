import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { CampagnesIadePanel } from "@/components/campagnes/campagnes-iade-panel";
import { getCampagnesIadeParLigneQualifiee } from "@/server/campagne-saisie-dispos";
import { getCurrentUser } from "@/server/auth";

export default async function AppPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role === Role.CADRE) {
    redirect("/admin/dashboard");
  }

  const campagnesParLigne = await getCampagnesIadeParLigneQualifiee(user.id);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Tableau de bord</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Vue d&apos;ensemble de vos campagnes de planification à venir.
        </p>
      </header>
      <CampagnesIadePanel lignes={campagnesParLigne} />
    </main>
  );
}
