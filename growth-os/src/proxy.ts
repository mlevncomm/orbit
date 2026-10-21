import { NextRequest, NextResponse } from "next/server";
import { decodeSession, SESSION_COOKIE, authConfigured } from "@/lib/session-token";
import { decodeProfile, inProfileGroup, PROFILE_COOKIE } from "@/lib/app-profiles";

// Profil seçmeden de açılabilen yollar (oturum yine gerekir)
const PROFILE_FREE = ["/api/me"];

// Programa giriş profil ekranındaki 4 haneli şifreyle yapılır; /giris yalnızca üst yönetici içindir
const PUBLIC = ["/giris", "/profil", "/api/profil", "/api/auth", "/api/instagram/webhook", "/api/outreach/tick", "/api/surum"];

function isPublic(pathname: string) {
  return PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) {
    return NextResponse.next();
  }
  if (!authConfigured() && process.env.VERCEL !== "1") {
    return NextResponse.next();
  }
  const session = decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    const yonetici = pathname === "/platform" || pathname.startsWith("/platform/");
    url.pathname = yonetici ? "/giris" : "/profil";
    url.search = "";
    if (yonetici) url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const platformPage = pathname === "/platform" || pathname.startsWith("/platform/");
  const platformApi = pathname === "/api/platform" || pathname.startsWith("/api/platform/");
  if (platformPage) {
    if (session.role !== "platform" || session.impersonatorId) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  if (platformApi && session.role !== "platform") {
    return NextResponse.json({ error: "Yalnızca üst yönetici" }, { status: 403 });
  }

  if (
    session.role === "platform" &&
    !session.impersonatorId &&
    !session.tenantId &&
    !pathname.startsWith("/api/") &&
    pathname !== "/platform"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/platform";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Wexon.dev / Aquails kullanıcıları her açılışta profil seçer (profil çerezi program kapanınca silinir)
  if (
    session.role === "member" &&
    inProfileGroup(session.tenantId) &&
    !PROFILE_FREE.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
    !decodeProfile(request.cookies.get(PROFILE_COOKIE)?.value, session.userId)
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Önce profil seçin.", profil: true }, { status: 428 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/profil";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
