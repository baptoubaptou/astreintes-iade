import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { isCadreOnlyRoute } from "@/lib/navigation";

const { auth } = NextAuth(authConfig);

const publicAuthRoutes = [
  "/login",
  "/premiere-connexion",
  "/mot-de-passe-oublie",
  "/reinitialiser-mot-de-passe",
] as const;

function isPublicAuthRoute(pathname: string): boolean {
  return publicAuthRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth?.user;
  const role = req.auth?.user?.role;

  if (isPublicAuthRoute(pathname)) {
    if (isLoggedIn && pathname.startsWith("/login")) {
      return Response.redirect(new URL("/app", req.nextUrl));
    }
    return;
  }

  if (pathname.startsWith("/app")) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", req.nextUrl);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return Response.redirect(loginUrl);
    }

    if (isCadreOnlyRoute(pathname) && role !== "CADRE") {
      return Response.redirect(new URL("/app", req.nextUrl));
    }

    return;
  }

  if (pathname.startsWith("/planning") || pathname.startsWith("/mes-astreintes") || pathname.startsWith("/mes-disponibilites") || pathname.startsWith("/points")) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", req.nextUrl);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return Response.redirect(loginUrl);
    }

    return;
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (!isLoggedIn) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
      }

      const loginUrl = new URL("/login", req.nextUrl);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return Response.redirect(loginUrl);
    }

    if (role !== "CADRE") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }

      return Response.redirect(new URL("/app", req.nextUrl));
    }

    return;
  }

  if (pathname.startsWith("/api/export")) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    return;
  }

  if (pathname.startsWith("/api/disponibilites") || pathname.startsWith("/api/preferences-continuite") || pathname.startsWith("/api/points") || pathname.startsWith("/api/bourse")) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
  }
});

export const config = {
  matcher: [
    "/login",
    "/premiere-connexion",
    "/mot-de-passe-oublie",
    "/reinitialiser-mot-de-passe",
    "/app/:path*",
    "/planning",
    "/mes-astreintes",
    "/mes-disponibilites",
    "/points",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/export/:path*",
    "/api/disponibilites/:path*",
    "/api/preferences-continuite/:path*",
    "/api/points",
    "/api/bourse/:path*",
  ],
};
