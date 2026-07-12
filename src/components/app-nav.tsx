import Link from "next/link";
import type { Role } from "@prisma/client";
import { getNavItemsForRole, type NavItem } from "@/lib/navigation";

type AppNavProps = {
  role: Role;
};

function NavLink({ item }: { item: NavItem }) {
  return (
    <Link href={item.href} className="hover:underline">
      {item.label}
    </Link>
  );
}

function ExpandableNavItem({ item }: { item: NavItem }) {
  const children = item.children ?? [];

  return (
    <li className="group relative">
      <Link href={item.href} className="hover:underline">
        {item.label}
      </Link>
      <ul className="absolute left-0 top-full z-20 hidden min-w-max flex-col gap-1 pt-1 group-hover:flex">
        <li className="flex flex-col gap-1 rounded border border-zinc-200 bg-white p-2 shadow-sm">
          {children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              className="whitespace-nowrap rounded px-2 py-1 text-xs hover:bg-zinc-100"
            >
              {child.label}
            </Link>
          ))}
        </li>
      </ul>
    </li>
  );
}

export function AppNav({ role }: AppNavProps) {
  const items = getNavItemsForRole(role);

  return (
    <nav aria-label="Navigation principale">
      <ul className="flex flex-wrap items-center gap-4 text-sm">
        {items.map((item) =>
          item.children && item.children.length > 0 ? (
            <ExpandableNavItem key={item.href} item={item} />
          ) : (
            <li key={item.href}>
              <NavLink item={item} />
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
