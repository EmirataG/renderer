import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = '__session';

/** Routes that don't require authentication */
const PUBLIC_ROUTES = ['/login', '/terms'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  // Authenticated user on login page -- redirect to dashboard
  if (pathname === '/login' && session) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Unauthenticated user on protected route -- redirect to login
  const isPublic = PUBLIC_ROUTES.includes(pathname);
  if (!isPublic && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, public assets
     */
    '/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
