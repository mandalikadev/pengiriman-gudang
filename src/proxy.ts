import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Pemeriksaan optimistis (hanya keberadaan cookie sesi): pengguna yang belum masuk diarahkan ke /masuk.
// Pemeriksaan sesi dan peran yang sebenarnya dilakukan wajibMasuk()/wajibAdmin() di server.
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/masuk" || getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/masuk", request.url));
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
