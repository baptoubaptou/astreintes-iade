import { LoginForm } from "@/components/login-form";

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Astreintes IADE
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Connectez-vous avec votre e-mail ou matricule
          </p>
        </div>
        <LoginForm callbackUrl={params.callbackUrl} />
      </div>
    </main>
  );
}
