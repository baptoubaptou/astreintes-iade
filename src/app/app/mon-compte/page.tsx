import { MonCompteView } from "@/components/mon-compte/mon-compte-view";
import { getCurrentUser } from "@/server/auth";
import { getMonCompteProfil } from "@/server/mon-compte";
import { redirect } from "next/navigation";

export default async function MonComptePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const profil = await getMonCompteProfil(user.id);

  if (!profil) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Mon compte</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Consultez vos informations et modifiez votre mot de passe ou votre
          adresse e-mail.
        </p>
      </div>

      <MonCompteView profil={profil} />
    </main>
  );
}
