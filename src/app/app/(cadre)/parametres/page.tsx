import Link from "next/link";
import { parametresNavChildren } from "@/lib/navigation";
import { requireCadre } from "@/server/require-cadre";

export default async function ParametresPage() {
  await requireCadre();

  const sections = parametresNavChildren;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Paramètres</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Mon compte et configuration de l&apos;application : utilisateurs,
          lignes, points par créneau, jours fériés et algorithme.
        </p>
      </header>

      <ul className="divide-y divide-zinc-200 rounded border border-zinc-200">
        {sections.map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              className="block px-4 py-3 text-sm hover:bg-zinc-50"
            >
              {section.label}
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm text-zinc-600">
        Les astreintes sont enregistrées en base sans notification immédiate.
        La publication explicite du planning (Phase 5) enverra les emails aux
        IADE concernés.
      </p>
    </main>
  );
}
