import { AuthCard, AuthBackLink } from "@/components/auth/auth-card";
import { PremiereConnexionForm } from "@/components/premiere-connexion/premiere-connexion-form";
import { listLignesAstreinte } from "@/server/lignes";

export default async function PremiereConnexionPage() {
  const lignes = await listLignesAstreinte();
  const lignesActives = lignes
    .filter((ligne) => ligne.actif)
    .map((ligne) => ({ id: ligne.id, nom: ligne.nom }));

  return (
    <AuthCard
      title="Première connexion"
      subtitle="Créez votre compte IADE et choisissez vos qualifications"
      footer={<AuthBackLink href="/login" label="Déjà un compte ? Se connecter" />}
    >
      <PremiereConnexionForm lignes={lignesActives} />
    </AuthCard>
  );
}
