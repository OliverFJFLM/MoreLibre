import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function ensureHttpsOrigin(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function resolveBackendBase(request: NextRequest): string {
  const explicit = process.env.BACKEND_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (explicit && explicit.trim().length > 0) {
    return stripTrailingSlash(explicit.trim());
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl && vercelUrl.trim().length > 0) {
    const vercelOrigin = stripTrailingSlash(ensureHttpsOrigin(vercelUrl.trim()))
      .split(",")[0]
      .trim();
    return `${vercelOrigin}/api/python`;
  }

  const requestOrigin = request.nextUrl.origin;
  if (requestOrigin && requestOrigin.trim().length > 0) {
    return `${stripTrailingSlash(requestOrigin.trim())}/api/python`;
  }

  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (forwardedHost && forwardedHost.trim().length > 0) {
    const host = forwardedHost.split(",").map((value) => value.trim()).find(Boolean);
    if (host) {
      const forwardedProto =
        request.headers.get("x-forwarded-proto") ?? request.headers.get("x-forwarded-protocol");
      const protocol =
        forwardedProto?.split(",").map((value) => value.trim()).find(Boolean) ??
        request.nextUrl.protocol.replace(/:$/, "") ??
        "https";
      return `${stripTrailingSlash(`${protocol}://${host}`)}/api/python`;
    }
  }

  throw new Error("Unable to resolve backend origin from request");
}

function buildTargetUrl(pathSegments: string[], request: NextRequest, base: string): URL {
  const targetPath = pathSegments.join("/");
  const url = new URL(targetPath ? `/${targetPath}` : "", base);
  url.search = request.nextUrl.search;
  return url;
}

function httpsFallback(base: string): string | null {
  if (base.startsWith("http://")) {
    return `https://${base.slice("http://".length)}`;
  }
  return null;
}

function copyRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (["host", "connection", "content-length"].includes(lowerKey)) {
      return;
    }
    headers.set(key, value);
  });
  return headers;
}

function copyResponseHeaders(response: Response): Headers {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") {
      return;
    }
    headers.set(key, value);
  });
  return headers;
}

async function proxy(request: NextRequest, context: { params: { path?: string[] } }) {
  const pathSegments = context.params.path ?? [];
  const base = resolveBackendBase(request);
  const targetUrl = buildTargetUrl(pathSegments, request, base);

  const init: RequestInit = {
    method: request.method,
    headers: copyRequestHeaders(request),
    redirect: "manual",
  };

  if (!request.method || !["GET", "HEAD"].includes(request.method.toUpperCase())) {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) {
      init.body = body;
    }
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(targetUrl, init);
  } catch (error) {
    const alternativeBase = httpsFallback(base);
    if (alternativeBase) {
      const httpsUrl = buildTargetUrl(pathSegments, request, alternativeBase);
      try {
        upstreamResponse = await fetch(httpsUrl, init);
        console.info("Proxied request via HTTPS fallback", {
          originalTarget: targetUrl.toString(),
          fallbackTarget: httpsUrl.toString(),
        });
      } catch (secondaryError) {
        console.error("Failed to proxy request", {
          target: targetUrl.toString(),
          attemptedFallback: httpsUrl.toString(),
          error,
          secondaryError,
        });
        return new Response(
          JSON.stringify({
            detail: "Unable to reach backend service",
            suggestion: "Verify BACKEND_BASE_URL points to an accessible HTTPS endpoint.",
          }),
          {
            status: 502,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } else {
      console.error("Failed to proxy request", { target: targetUrl.toString(), error });
      return new Response(
        JSON.stringify({ detail: "Unable to reach backend service" }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: copyResponseHeaders(upstreamResponse),
  });
}

export async function GET(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

export async function HEAD(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

export async function PUT(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

export async function PATCH(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

export async function DELETE(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}

export async function OPTIONS(request: NextRequest, context: { params: { path?: string[] } }) {
  return proxy(request, context);
}
