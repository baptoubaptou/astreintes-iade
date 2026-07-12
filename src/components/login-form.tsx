"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/login/actions";
import {
  authButtonClassName,
  authInputClassName,
  authLabelClassName,
} from "@/components/auth/auth-card";

const initialState: LoginState = {};

type LoginFormProps = {
  callbackUrl?: string;
};

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {callbackUrl ? (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      ) : null}

      <div>
        <label htmlFor="identifiant" className={authLabelClassName}>
          E-mail ou matricule
        </label>
        <input
          id="identifiant"
          name="identifiant"
          type="text"
          autoComplete="username"
          required
          className={authInputClassName}
          placeholder="ex. baptistemiceli@gmail.com ou 123456"
        />
      </div>

      <div>
        <label htmlFor="password" className={authLabelClassName}>
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={authInputClassName}
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
        {isPending ? "Connexion..." : "Se connecter"}
      </button>

      <div className="flex flex-col gap-2 pt-2 text-center text-sm">
        <Link
          href="/premiere-connexion"
          className="text-zinc-600 underline-offset-4 hover:text-foreground hover:underline dark:text-zinc-400"
        >
          Première connexion
        </Link>
        <Link
          href="/mot-de-passe-oublie"
          className="text-zinc-600 underline-offset-4 hover:text-foreground hover:underline dark:text-zinc-400"
        >
          Mot de passe oublié
        </Link>
      </div>
    </form>
  );
}
