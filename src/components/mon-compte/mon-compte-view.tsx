"use client";

import { Role } from "@prisma/client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  changerMotDePasseAction,
  demanderChangementEmailAction,
  verifierChangementEmailAction,
} from "@/app/app/mon-compte/actions";
import type { MonCompteProfil, MonCompteState } from "@/server/mon-compte";
import {
  motsDePasseConcordent,
  validateConfirmationMotDePasse,
  validateMotDePasse,
} from "@/lib/mot-de-passe-validation";

const initialState: MonCompteState = {};

const readOnlyInputClassName =
  "w-full rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-600 cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400";

const editableInputClassName =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

const labelClassName = "mb-1 block text-sm font-medium text-foreground";

const buttonClassName =
  "rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

function roleLabel(role: Role): string {
  return role === Role.CADRE ? "Cadre de santé" : "IADE";
}

type MonCompteViewProps = {
  profil: MonCompteProfil;
};

export function MonCompteView({ profil }: MonCompteViewProps) {
  const router = useRouter();
  const [email, setEmail] = useState(profil.email);
  const [emailStep, setEmailStep] = useState<"form" | "verify">("form");

  const [motDePasseActuel, setMotDePasseActuel] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmationMotDePasse, setConfirmationMotDePasse] = useState("");

  const [nouvelEmail, setNouvelEmail] = useState("");
  const [code, setCode] = useState("");

  const [passwordState, passwordAction, passwordPending] = useActionState(
    changerMotDePasseAction,
    initialState,
  );

  const [emailRequestState, emailRequestAction, emailRequestPending] =
    useActionState(demanderChangementEmailAction, initialState);

  const [emailVerifyState, emailVerifyAction, emailVerifyPending] =
    useActionState(verifierChangementEmailAction, initialState);

  useEffect(() => {
    setEmail(profil.email);
  }, [profil.email]);

  useEffect(() => {
    if (passwordState.success) {
      setMotDePasseActuel("");
      setMotDePasse("");
      setConfirmationMotDePasse("");
    }
  }, [passwordState.success]);

  useEffect(() => {
    if (emailRequestState.success && emailRequestState.demandeId) {
      setEmailStep("verify");
      setCode("");
    }
  }, [emailRequestState]);

  useEffect(() => {
    if (emailVerifyState.success && emailVerifyState.nouvelEmail) {
      setEmail(emailVerifyState.nouvelEmail);
      setEmailStep("form");
      setNouvelEmail("");
      setCode("");
      router.refresh();
    }
  }, [emailVerifyState, router]);

  const motDePasseErreur = useMemo(() => {
    if (!confirmationMotDePasse) {
      return null;
    }

    if (!motsDePasseConcordent(motDePasse, confirmationMotDePasse)) {
      return "Les mots de passe ne correspondent pas.";
    }

    return validateMotDePasse(motDePasse);
  }, [motDePasse, confirmationMotDePasse]);

  const motDePasseValide =
    motDePasseActuel.length > 0 &&
    validateConfirmationMotDePasse(motDePasse, confirmationMotDePasse) === null;

  const nouvelEmailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    nouvelEmail.trim(),
  );

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-lg font-medium">Informations personnelles</h2>
        <p className="text-sm italic text-zinc-500">
          Seuls le mot de passe et l&apos;adresse e-mail sont modifiables.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="prenom" className={labelClassName}>
              Prénom
            </label>
            <input
              id="prenom"
              type="text"
              value={profil.prenom}
              readOnly
              disabled
              className={readOnlyInputClassName}
            />
          </div>
          <div>
            <label htmlFor="nom" className={labelClassName}>
              Nom
            </label>
            <input
              id="nom"
              type="text"
              value={profil.nom}
              readOnly
              disabled
              className={readOnlyInputClassName}
            />
          </div>
        </div>

        <div>
          <label htmlFor="matricule" className={labelClassName}>
            Matricule
          </label>
          <input
            id="matricule"
            type="text"
            value={profil.matricule}
            readOnly
            disabled
            className={readOnlyInputClassName}
          />
        </div>

        <div>
          <label htmlFor="role" className={labelClassName}>
            Rôle
          </label>
          <input
            id="role"
            type="text"
            value={roleLabel(profil.role)}
            readOnly
            disabled
            className={readOnlyInputClassName}
          />
        </div>

        <div>
          <label className={labelClassName}>Qualifications</label>
          <div className="rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            {profil.qualifications.length > 0 ? (
              <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                {profil.qualifications.map((qualification) => (
                  <li key={qualification}>{qualification}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">Aucune qualification</p>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-lg font-medium">Adresse e-mail</h2>

        <div>
          <label htmlFor="emailActuel" className={labelClassName}>
            E-mail actuel
          </label>
          <input
            id="emailActuel"
            type="email"
            value={email}
            readOnly
            disabled
            className={readOnlyInputClassName}
          />
        </div>

        {emailStep === "verify" && emailRequestState.demandeId ? (
          <form action={emailVerifyAction} className="space-y-4">
            <input
              type="hidden"
              name="demandeId"
              value={emailRequestState.demandeId}
            />

            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Un code à 5 chiffres a été envoyé à{" "}
              <span className="font-medium text-foreground">
                {emailRequestState.nouvelEmail}
              </span>
              .
            </p>

            <div>
              <label htmlFor="code" className={labelClassName}>
                Code de vérification
              </label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                pattern="\d{5}"
                maxLength={5}
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="off"
                className={editableInputClassName}
              />
            </div>

            {emailVerifyState.error ? (
              <p className="text-sm text-red-600" role="alert">
                {emailVerifyState.error}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={emailVerifyPending || code.length !== 5}
                className={buttonClassName}
              >
                {emailVerifyPending ? "Validation..." : "Confirmer l'e-mail"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmailStep("form");
                  setCode("");
                }}
                className="text-sm text-zinc-600 underline-offset-4 hover:text-foreground hover:underline dark:text-zinc-400"
              >
                Annuler
              </button>
            </div>
          </form>
        ) : (
          <form action={emailRequestAction} className="space-y-4">
            <div>
              <label htmlFor="nouvelEmail" className={labelClassName}>
                Nouvelle adresse e-mail
              </label>
              <input
                id="nouvelEmail"
                name="nouvelEmail"
                type="email"
                required
                value={nouvelEmail}
                onChange={(event) => setNouvelEmail(event.target.value)}
                autoComplete="email"
                className={editableInputClassName}
              />
            </div>

            {emailRequestState.error ? (
              <p className="text-sm text-red-600" role="alert">
                {emailRequestState.error}
              </p>
            ) : null}

            {emailRequestState.success ? (
              <p className="text-sm text-green-700 dark:text-green-400" role="status">
                {emailRequestState.message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={
                emailRequestPending ||
                !nouvelEmailValide ||
                normalizeEmailLocal(nouvelEmail) === email
              }
              className={buttonClassName}
            >
              {emailRequestPending
                ? "Envoi du code..."
                : "Recevoir un code de vérification"}
            </button>
          </form>
        )}
      </section>

      <section className="space-y-4 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-lg font-medium">Mot de passe</h2>

        <form action={passwordAction} className="space-y-4">
          <div>
            <label htmlFor="motDePasseActuel" className={labelClassName}>
              Mot de passe actuel
            </label>
            <input
              id="motDePasseActuel"
              name="motDePasseActuel"
              type="password"
              required
              value={motDePasseActuel}
              onChange={(event) => setMotDePasseActuel(event.target.value)}
              autoComplete="current-password"
              className={editableInputClassName}
              suppressHydrationWarning
            />
          </div>

          <div>
            <label htmlFor="motDePasse" className={labelClassName}>
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
              className={editableInputClassName}
              suppressHydrationWarning
            />
            <p className="mt-1 text-xs text-zinc-500">
              6 caractères minimum, dont au moins 1 chiffre.
            </p>
          </div>

          <div>
            <label htmlFor="confirmationMotDePasse" className={labelClassName}>
              Confirmer le nouveau mot de passe
            </label>
            <input
              id="confirmationMotDePasse"
              name="confirmationMotDePasse"
              type="password"
              required
              value={confirmationMotDePasse}
              onChange={(event) =>
                setConfirmationMotDePasse(event.target.value)
              }
              autoComplete="new-password"
              minLength={6}
              className={editableInputClassName}
              suppressHydrationWarning
            />
            {motDePasseErreur ? (
              <p className="mt-1 text-sm text-red-600" role="alert">
                {motDePasseErreur}
              </p>
            ) : null}
          </div>

          {passwordState.error ? (
            <p className="text-sm text-red-600" role="alert">
              {passwordState.error}
            </p>
          ) : null}

          {passwordState.success ? (
            <p className="text-sm text-green-700 dark:text-green-400" role="status">
              {passwordState.message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={passwordPending || !motDePasseValide}
            className={buttonClassName}
          >
            {passwordPending ? "Mise à jour..." : "Modifier le mot de passe"}
          </button>
        </form>
      </section>
    </div>
  );
}

function normalizeEmailLocal(email: string): string {
  return email.trim().toLowerCase();
}
