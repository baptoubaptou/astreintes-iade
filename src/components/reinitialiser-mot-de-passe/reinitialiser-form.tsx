"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { reinitialiserMotDePasseAction } from "@/app/mot-de-passe-oublie/actions";
import type { ReinitialisationState } from "@/server/reinitialisation-mot-de-passe";
import {
  AuthBackLink,
  authButtonClassName,
  authInputClassName,
  authLabelClassName,
} from "@/components/auth/auth-card";
import {
  motsDePasseConcordent,
  validateConfirmationMotDePasse,
  validateMotDePasse,
} from "@/lib/mot-de-passe-validation";

const initialState: ReinitialisationState = {};

type ReinitialiserMotDePasseFormProps = {
  token: string;
};

export function ReinitialiserMotDePasseForm({
  token,
}: ReinitialiserMotDePasseFormProps) {
  const [mounted, setMounted] = useState(false);
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmationMotDePasse, setConfirmationMotDePasse] = useState("");

  const [state, formAction, isPending] = useActionState(
    reinitialiserMotDePasseAction,
    initialState,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const concordanceErreur = useMemo(() => {
    if (!confirmationMotDePasse) {
      return null;
    }

    if (!motsDePasseConcordent(motDePasse, confirmationMotDePasse)) {
      return "Les mots de passe ne correspondent pas.";
    }

    return validateMotDePasse(motDePasse);
  }, [motDePasse, confirmationMotDePasse]);

  const formulaireValide =
    validateConfirmationMotDePasse(motDePasse, confirmationMotDePasse) === null;

  if (!mounted) {
    return (
      <div className="space-y-4" aria-hidden="true">
        <p className="text-sm italic text-zinc-500">
          Tous les champs sont obligatoires.
        </p>
        <div className="h-20 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-20 rounded-lg bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-10 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <p className="text-sm italic text-zinc-500">
        Tous les champs sont obligatoires.
      </p>

      <div>
        <label htmlFor="motDePasse" className={authLabelClassName}>
          Nouveau mot de passe
        </label>
        <input
          id="motDePasse"
          name="motDePasse"
          type="password"
          required
          value={motDePasse}
          onChange={(event) => setMotDePasse(event.target.value)}
          autoComplete="new-password"
          minLength={6}
          className={authInputClassName}
          suppressHydrationWarning
        />
        <p className="mt-1 text-xs text-zinc-500">
          6 caractères minimum, dont au moins 1 chiffre.
        </p>
      </div>

      <div>
        <label htmlFor="confirmationMotDePasse" className={authLabelClassName}>
          Confirmer le mot de passe
        </label>
        <input
          id="confirmationMotDePasse"
          name="confirmationMotDePasse"
          type="password"
          required
          value={confirmationMotDePasse}
          onChange={(event) => setConfirmationMotDePasse(event.target.value)}
          autoComplete="new-password"
          minLength={6}
          className={authInputClassName}
          suppressHydrationWarning
        />
        {concordanceErreur ? (
          <p className="mt-1 text-sm text-red-600" role="alert">
            {concordanceErreur}
          </p>
        ) : null}
      </div>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending || !formulaireValide}
        className={authButtonClassName}
      >
        {isPending ? "Validation..." : "Valider et se connecter"}
      </button>

      <div className="text-center">
        <AuthBackLink href="/login" label="Retour à la connexion" />
      </div>
    </form>
  );
}
