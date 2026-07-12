import { requireCadre } from "@/server/require-cadre";

export default async function CadreLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireCadre();
  return children;
}
