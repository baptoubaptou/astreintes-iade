import { SignOutButton } from "@/components/sign-out-button";
import { AppNav } from "@/components/app-nav";
import { getCurrentUser } from "@/server/auth";
import { redirect } from "next/navigation";

export default async function PlanningLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-zinc-200 px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Astreintes IADE</p>
              <p className="text-sm text-zinc-600">
                {user.name} — {user.role}
              </p>
            </div>
            <SignOutButton />
          </div>
          <AppNav role={user.role} />
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
