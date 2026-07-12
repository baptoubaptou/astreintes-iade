import { SignOutButton } from "@/components/sign-out-button";
import { AppNav } from "@/components/app-nav";
import type { Role } from "@prisma/client";

type AppHeaderProps = {
  userName: string;
  role: Role;
  maxWidthClass?: string;
};

export function AppHeader({
  userName,
  role,
  maxWidthClass = "max-w-6xl",
}: AppHeaderProps) {
  return (
    <header className="border-b border-zinc-200 px-6 py-4">
      <div className={`mx-auto flex ${maxWidthClass} flex-col gap-4`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Astreintes IADE</p>
            <p className="text-sm text-zinc-600">
              {userName} — {role}
            </p>
          </div>
          <SignOutButton />
        </div>
        <AppNav role={role} />
      </div>
    </header>
  );
}
