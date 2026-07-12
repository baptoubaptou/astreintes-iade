import { AuthCard } from "@/components/auth/auth-card";
import { MotDePasseOublieForm } from "@/components/mot-de-passe-oublie/mot-de-passe-oublie-form";

export default function MotDePasseOubliePage() {
  return (
    <AuthCard
      title="Mot de passe oublié"
      subtitle="Saisissez votre e-mail ou matricule pour recevoir un lien de réinitialisation"
    >
      <MotDePasseOublieForm />
    </AuthCard>
  );
}
