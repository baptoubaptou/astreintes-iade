"use client";

import { useActionState } from "react";
import { motDePasseOublieAction } from "@/app/mot-de-passe-oublie/actions";
import type { ReinitialisationState } from "@/server/reinitialisation-mot-de-passe";
import {
  AuthBackLink,
  authButtonClassName,
  authInputClassName,
  authLabelClassName,
} from "@/components/auth/auth-card";

const initialState: ReinitialisationState = {};

export function MotDePasseOublieForm() {
  const [state, formAction, isPending] = useActionState(
    motDePasseOublieAction,
    initialState,
  );

  if (state.success) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-green-700 dark:text-green-400" role="status">
          {state.message}
        </p>
        <div className="text-center">
          <AuthBackLink href="/login" label="Retour à la connexion" />
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="identifiant" className={authLabelClassName}>
          E-mail ou matricule
        </label>
        <input
          id="identifiant"
          name="identifiant"
          type="text"
          required
          autoComplete="username"
          className={authInputClassName}
          placeholder="ex. baptistemiceli@gmail.com ou 123456"
        />
      </div>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className={authButtonClassName}
      >
        {isPending ? "Envoi..." : "Recevoir le lien de réinitialisation"}
      </button>

      <div className="text-center">
        <AuthBackLink href="/login" label="Retour à la connexion" />
      </div>
    </form>
  );
}
