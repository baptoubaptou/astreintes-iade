import { UtilisateursView } from "@/components/utilisateurs/utilisateurs-view";
import { requireCadre } from "@/server/require-cadre";
import { listUtilisateurs } from "@/server/utilisateurs";

export default async function UtilisateursPage() {
  const currentUser = await requireCadre();
  const utilisateurs = await listUtilisateurs();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <UtilisateursView
        utilisateurs={utilisateurs}
        currentUserId={currentUser.id}
      />
    </main>
  );
}
