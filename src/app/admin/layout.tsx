import { AppHeader } from "@/components/app-header";
import { requireCadre } from "@/server/require-cadre";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireCadre();

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        userName={user.name ?? user.email ?? "Utilisateur"}
        role={user.role}
        maxWidthClass="max-w-6xl"
      />
      <div className="flex-1">{children}</div>
    </div>
  );
}
