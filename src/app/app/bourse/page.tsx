import { BourseCadreSupervision } from "@/components/bourse/bourse-cadre-supervision";
import { BourseOffresList } from "@/components/bourse/bourse-offres-list";
import {
  getOffresBoursePourIade,
  getSupervisionBourseCadre,
} from "@/server/bourse-astreintes";
import { getCurrentUser } from "@/server/auth";
import { redirect } from "next/navigation";

export default async function BoursePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (user.role === "CADRE") {
    const offres = await getSupervisionBourseCadre();

    return (
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Bourse aux astreintes</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Suivi des offres ouvertes : postulants, favori projeté par
            l&apos;algorithme (moins-disant) et dates de clôture. L&apos;attribution
            est automatique à la clôture, sans validation cadre.
          </p>
        </div>

        <BourseCadreSupervision offres={offres} />
      </main>
    );
  }

  const offres = await getOffresBoursePourIade(user.id);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Bourse aux astreintes</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Postulez aux astreintes proposées par vos collègues qualifiés sur la
          même ligne. L&apos;attribution automatique se fait à la clôture de la
          fenêtre, au moins-disant.
        </p>
      </div>

      <BourseOffresList offres={offres} />
    </main>
  );
}
