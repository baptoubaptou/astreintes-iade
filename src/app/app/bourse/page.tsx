import { BourseOffresList } from "@/components/bourse/bourse-offres-list";
import { getOffresBoursePourIade } from "@/server/bourse-astreintes";
import { getCurrentUser } from "@/server/auth";
import { redirect } from "next/navigation";

export default async function BoursePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const offres = await getOffresBoursePourIade(user.id);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Bourse aux astreintes</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Postulez aux astreintes proposées par vos collègues. L&apos;attribution
          automatique se fait à la clôture de la fenêtre, au moins-disant.
        </p>
      </div>

      <BourseOffresList offres={offres} />
    </main>
  );
}
