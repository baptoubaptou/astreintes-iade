export type NavItem = {
  href: string;
  label: string;
  children?: NavItem[];
};

export const sharedNavItems: NavItem[] = [
  { href: "/mes-astreintes", label: "Mes astreintes" },
  { href: "/mes-disponibilites", label: "Mes disponibilités" },
  { href: "/planning", label: "Planning collectif" },
  { href: "/points", label: "Points" },
  { href: "/app/bourse", label: "Bourse aux astreintes" },
];

/** Entrées visibles pour le cadre (hors sous-menus). */
export const cadrePersonalNavItems: NavItem[] = [
  { href: "/points", label: "Points" },
  { href: "/app/bourse", label: "Bourse aux astreintes" },
];

export const planningNavChildren: NavItem[] = [
  { href: "/admin/dashboard", label: "Tableau de bord" },
  { href: "/planning", label: "Planning collectif" },
  { href: "/admin/planning", label: "Gestion du planning" },
  {
    href: "/admin/generation-automatique",
    label: "Génération auto (du planning)",
  },
  { href: "/admin/campagnes", label: "Campagnes de planification" },
  { href: "/admin/disponibilites", label: "Disponibilités" },
];

export const parametresNavChildren: NavItem[] = [
  { href: "/app/utilisateurs", label: "Gestion des utilisateurs" },
  { href: "/admin/qualifications", label: "Qualifications" },
  { href: "/admin/lignes", label: "Lignes d'astreinte" },
  { href: "/admin/poids-creneaux", label: "Poids par créneau" },
  { href: "/admin/bonus-continuite", label: "Bonus de continuité" },
  { href: "/admin/parametres-algorithme", label: "Algorithme d'attribution" },
  { href: "/admin/jours-feries", label: "Gestion des jours fériés" },
  { href: "/admin/journal", label: "Journal d'audit" },
];

export const cadreNavItems: NavItem[] = [
  {
    href: "/admin/planning",
    label: "Gestion du planning",
    children: planningNavChildren,
  },
  {
    href: "/app/parametres",
    label: "Paramètres",
    children: parametresNavChildren,
  },
];

function flattenNavItems(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [
    item,
    ...(item.children ? flattenNavItems(item.children) : []),
  ]);
}

function isCadreOnlyHref(href: string): boolean {
  return (
    href.startsWith("/admin") ||
    href === "/app/parametres" ||
    href === "/app/utilisateurs"
  );
}

export const cadreOnlyPaths = flattenNavItems(cadreNavItems)
  .map((item) => item.href)
  .filter(isCadreOnlyHref);

export function getNavItemsForRole(role: "IADE" | "CADRE"): NavItem[] {
  if (role === "CADRE") {
    return [...cadrePersonalNavItems, ...cadreNavItems];
  }

  return sharedNavItems;
}

export function isCadreOnlyRoute(pathname: string): boolean {
  return cadreOnlyPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
