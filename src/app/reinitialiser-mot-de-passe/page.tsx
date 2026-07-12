import { AuthCard, AuthBackLink } from "@/components/auth/auth-card";
import { ReinitialiserMotDePasseForm } from "@/components/reinitialiser-mot-de-passe/reinitialiser-form";
import { tokenReinitialisationValide } from "@/server/reinitialisation-mot-de-passe";

type ReinitialiserMotDePassePageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ReinitialiserMotDePassePage({
  searchParams,
}: ReinitialiserMotDePassePageProps) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  if (!token || !(await tokenReinitialisationValide(token))) {
    return (
      <AuthCard
        title="Lien invalide"
        subtitle="Ce lien de réinitialisation est invalide ou a expiré"
        footer={<AuthBackLink href="/mot-de-passe-oublie" label="Demander un nouveau lien" />}
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Vous pouvez relancer une demande de réinitialisation depuis la page
          mot de passe oublié.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Nouveau mot de passe"
      subtitle="Choisissez un nouveau mot de passe pour votre compte"
    >
      <ReinitialiserMotDePasseForm token={token} />
    </AuthCard>
  );
}
