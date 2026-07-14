import { redirect } from "next/navigation";
import { signOut } from "@/auth";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        // Évite qu'Auth.js reconstruise l'URL avec AUTH_URL (autre sous-domaine derrière Cloudflare).
        await signOut({ redirect: false });
        redirect("/login");
      }}
    >
      <button
        type="submit"
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        Se déconnecter
      </button>
    </form>
  );
}
