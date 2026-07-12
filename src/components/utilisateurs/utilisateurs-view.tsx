"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { UtilisateurListItem } from "@/server/utilisateurs";
import { UtilisateursTable } from "@/components/utilisateurs/utilisateurs-table";

type UtilisateursViewProps = {
  utilisateurs: UtilisateurListItem[];
  currentUserId: string;
};

type NouvelUtilisateurForm = {
  nom: string;
  prenom: string;
  matricule: string;
  email: string;
};

const emptyForm: NouvelUtilisateurForm = {
  nom: "",
  prenom: "",
  matricule: "",
  email: "",
};

export function UtilisateursView({
  utilisateurs,
  currentUserId,
}: UtilisateursViewProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NouvelUtilisateurForm>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!showForm) {
      setForm(emptyForm);
      setFormError(null);
    }
  }, [showForm]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const response = await fetch("/api/admin/utilisateurs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        setFormError(data.error ?? "Erreur lors de la création.");
        return;
      }

      setForm(emptyForm);
      setShowForm(false);
      setFormSuccess(
        `Utilisateur ${data.prenom} ${data.nom} créé. Mot de passe initial : password123`,
      );
      router.refresh();
    } catch {
      setFormError("Impossible de contacter le serveur.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Gestion des utilisateurs</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Consultez et modifiez les comptes IADE et cadres. Cliquez sur le
            crayon pour déverrouiller les champs, puis enregistrez. La corbeille
            supprime définitivement un utilisateur sans donnée rattachée.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm((current) => !current);
            setFormSuccess(null);
          }}
          className="rounded border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          {showForm ? "Fermer" : "Ajouter"}
        </button>
      </header>

      {formSuccess ? (
        <p
          className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          role="status"
        >
          {formSuccess}
        </p>
      ) : null}

      {showForm ? (
        <section className="rounded border border-zinc-200 p-6">
          <h2 className="text-lg font-medium">Nouvel utilisateur</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Le compte est créé en tant qu&apos;IADE avec le mot de passe
            initial <code className="text-xs">password123</code>.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div>
              <label htmlFor="nouveau-nom" className="mb-1 block text-sm">
                Nom
              </label>
              <input
                id="nouveau-nom"
                type="text"
                value={form.nom}
                onChange={(event) =>
                  setForm((current) => ({ ...current, nom: event.target.value }))
                }
                required
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label htmlFor="nouveau-prenom" className="mb-1 block text-sm">
                Prénom
              </label>
              <input
                id="nouveau-prenom"
                type="text"
                value={form.prenom}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    prenom: event.target.value,
                  }))
                }
                required
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label htmlFor="nouveau-matricule" className="mb-1 block text-sm">
                Matricule
              </label>
              <input
                id="nouveau-matricule"
                type="text"
                value={form.matricule}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    matricule: event.target.value,
                  }))
                }
                required
                className="w-full rounded border border-zinc-300 px-2 py-1 font-mono text-sm"
              />
            </div>
            <div>
              <label htmlFor="nouveau-email" className="mb-1 block text-sm">
                Mail
              </label>
              <input
                id="nouveau-email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                required
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
              >
                {isSubmitting ? "Création..." : "Créer l'utilisateur"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={isSubmitting}
                className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
              >
                Annuler
              </button>
            </div>
          </form>

          {formError ? (
            <p
              className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {formError}
            </p>
          ) : null}
        </section>
      ) : null}

      <UtilisateursTable
        key={utilisateurs.map((u) => u.id).join(",")}
        utilisateurs={utilisateurs}
        currentUserId={currentUserId}
      />
    </div>
  );
}
