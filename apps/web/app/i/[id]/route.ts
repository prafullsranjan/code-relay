import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /i/:id?t=<token>
 *
 * Redeems a guest invite by forwarding a POST to the API's redeem endpoint.
 * On success the API returns 302 + Set-Cookie (guest_session).
 * This handler forwards both so the browser lands on /w/:workspaceId
 * with the session cookie already set.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get('t');

  if (!token) {
    return NextResponse.redirect(new URL('/?error=missing_token', req.url));
  }

  // Server-side: use the real API origin, not the /api proxy path.
  // NEXT_PUBLIC_API_BASE is set to e.g. http://api:3001 in docker/k8s.
  // Locally it is unset so we fall back to http://localhost:3001 (same
  // default the Next.js rewrite uses in next.config.ts).
  const apiBase =
    (process.env.NEXT_PUBLIC_API_BASE ?? '').startsWith('http')
      ? process.env.NEXT_PUBLIC_API_BASE!
      : 'http://localhost:3001';

  const redeemUrl = `${apiBase}/api/invites/${encodeURIComponent(id)}/redeem?t=${encodeURIComponent(token)}`;

  let apiRes: Response;
  try {
    apiRes = await fetch(redeemUrl, { method: 'POST', redirect: 'manual' });
  } catch {
    return NextResponse.redirect(new URL('/?error=invite_error', req.url));
  }

  if (apiRes.status === 302) {
    const location = apiRes.headers.get('location') ?? '/';
    const setCookie = apiRes.headers.get('set-cookie');

    // location may be relative (e.g. /w/:id) — resolve against the request origin
    const dest = location.startsWith('http')
      ? location
      : new URL(location, req.nextUrl.origin).href;

    const response = NextResponse.redirect(dest);
    if (setCookie) {
      response.headers.set('set-cookie', setCookie);
    }
    return response;
  }

  return NextResponse.redirect(new URL('/?error=invite_invalid', req.url));
}
