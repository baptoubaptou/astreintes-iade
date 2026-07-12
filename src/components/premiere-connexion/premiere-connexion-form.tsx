"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  inscriptionAction,
  verificationInscriptionAction,
} from "@/app/premiere-connexion/actions";
import type { InscriptionState } from "@/server/inscription";
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

const initialState: InscriptionState = {};

type LigneOption = {
  id: string;
  nom: string;
};

type PremiereConnexionFormProps = {
  lignes: LigneOption[];
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function PremiereConnexionForm({ lignes }: PremiereConnexionFormProps) {
  const [step, setStep] = useState<"form" | "verify">("form");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [matricule, setMatricule] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmationMotDePasse, setConfirmationMotDePasse] = useState("");
  const [ligneIdsSelectionnees, setLigneIdsSelectionnees] = useState<string[]>(
    [],
  );

  const [formState, formAction, formPending] = useActionState(
    inscriptionAction,
    initialState,
  );

  const [verifyState, verifyAction, verifyPending] = useActionState(
    verificationInscriptionAction,
    initialState,
  );

  const concordanceErreur = useMemo(() => {
    if (!confirmationMotDePasse) {
      return null;
    }

    if (!motsDePasseConcordent(motDePasse, confirmationMotDePasse)) {
      return "Les mots de passe ne correspondent pas.";
    }

    return validateMotDePasse(motDePasse);
  }, [motDePasse, confirmationMotDePasse]);

  const formulaireValide = useMemo(() => {
    if (!prenom.trim() || !nom.trim() || !matricule.trim() || !email.trim()) {
      return false;
    }

    if (!/^\d+$/.test(matricule.trim())) {
      return false;
    }

    if (!isValidEmail(email.trim())) {
      return false;
    }

    if (ligneIdsSelectionnees.length === 0) {
      return false;
    }

    return validateConfirmationMotDePasse(motDePasse, confirmationMotDePasse) === null;
  }, [
    prenom,
    nom,
    matricule,
    email,
    motDePasse,
    confirmationMotDePasse,
    ligneIdsSelectionnees,
  ]);

  useEffect(() => {
    if (formState.success && formState.inscriptionId) {
      setStep("verify");
    }
  }, [formState]);

  function toggleLigne(ligneId: string, checked: boolean) {
    setLigneIdsSelectionnees((current) => {
      if (checked) {
        return current.includes(ligneId) ? current : [...current, ligneId];
      }

      return current.filter((id) => id !== ligneId);
    });
  }

  if (step === "verify" && formState.inscriptionId) {
    return (
      <form action={verifyAction} className="space-y-4">
        <input
          type="hidden"
          name="inscriptionId"
          value={formState.inscriptionId}
        />
        <input type="hidden" name="motDePasse" value={motDePasse} />

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Un code à 5 chiffres a été envoyé à{" "}
          <span className="font-medium text-foreground">
            {formState.email}
          </span>
          .
        </p>

        <div>
          <label htmlFor="code" className={authLabelClassName}>
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
            autoComplete="off"
            className={authInputClassName}
          />
        </div>

        {verifyState.error ? (
          <p className="text-sm text-red-600" role="alert">
            {verifyState.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={verifyPending}
          className={authButtonClassName}
        >
          {verifyPending ? "Validation..." : "Valider et se connecter"}
        </button>

        <button
          type="button"
          onClick={() => setStep("form")}
          className="w-full text-sm text-zinc-600 underline-offset-4 hover:text-foreground hover:underline dark:text-zinc-400"
        >
          Recommencer l&apos;inscription
        </button>
      </form>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm italic text-zinc-500">
        Tous les champs sont obligatoires.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="prenom" className={authLabelClassName}>
            Prénom
          </label>
          <input
            id="prenom"
            name="prenom"
            type="text"
            required
            value={prenom}
            onChange={(event) => setPrenom(event.target.value)}
            autoComplete="given-name"
            className={authInputClassName}
          />
        </div>
        <div>
          <label htmlFor="nom" className={authLabelClassName}>
            Nom
          </label>
          <input
            id="nom"
            name="nom"
            type="text"
            required
            value={nom}
            onChange={(event) => setNom(event.target.value)}
            autoComplete="family-name"
            className={authInputClassName}
          />
        </div>
      </div>

      <div>
        <label htmlFor="matricule" className={authLabelClassName}>
          Matricule
        </label>
        <input
          id="matricule"
          name="matricule"
          type="text"
          inputMode="numeric"
          pattern="\d+"
          required
          value={matricule}
          onChange={(event) => setMatricule(event.target.value)}
          className={authInputClassName}
          placeholder="123456"
        />
      </div>

      <div>
        <label htmlFor="email" className={authLabelClassName}>
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          className={authInputClassName}
        />
      </div>

      <div>
        <label htmlFor="motDePasse" className={authLabelClassName}>
          Mot de passe
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
        />
        {concordanceErreur ? (
          <p className="mt-1 text-sm text-red-600" role="alert">
            {concordanceErreur}
          </p>
        ) : null}
      </div>

      <fieldset>
        <legend className={authLabelClassName}>
          Qualifications (lignes d&apos;astreinte)
        </legend>
        <div className="mt-2 space-y-2">
          {lignes.map((ligne) => (
            <label
              key={ligne.id}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <input
                type="checkbox"
                name="ligneIds"
                value={ligne.id}
                checked={ligneIdsSelectionnees.includes(ligne.id)}
                onChange={(event) =>
                  toggleLigne(ligne.id, event.target.checked)
                }
                className="rounded border-zinc-300"
              />
              {ligne.nom}
            </label>
          ))}
        </div>
        {ligneIdsSelectionnees.length === 0 ? (
          <p className="mt-1 text-xs text-zinc-500">
            Sélectionnez au moins une ligne.
          </p>
        ) : null}
      </fieldset>

      {formState.error ? (
        <p className="text-sm text-red-600" role="alert">
          {formState.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={formPending || !formulaireValide}
        className={authButtonClassName}
      >
        {formPending ? "Envoi du code..." : "Créer mon compte"}
      </button>

      <div className="text-center">
        <AuthBackLink href="/login" label="Retour à la connexion" />
      </div>
    </form>
  );
}
