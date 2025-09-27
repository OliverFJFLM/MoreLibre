import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

let productionHttpWarningEmitted = false;

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function ensureHttpsOrigin(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = value
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);
  return match ?? null;
}

function localBackendFallback(): string | null {
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    return null;
  }

  const candidates = [
    process.env.LOCAL_BACKEND_BASE_URL,
    process.env.DEV_BACKEND_BASE_URL,
    "http://127.0.0.1:8000",
    "http://localhost:8000",
  ];

  for (const value of candidates) {
    if (value && value.trim().length > 0) {
      return stripTrailingSlash(value.trim());
    }
  }

  return null;
}

function parseHostname(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const { hostname } = new URL(value);
    return hostname;
  } catch (error) {
    return null;
  }
}

function isLocalHostname(hostname: string | null): boolean {
  if (!hostname) {
    return false;
  }
  return /^(localhost|127(?:\.\d{1,3}){3})$/i.test(hostname);
}

function buildPythonApiBase(origin: string): string {
  const sanitizedOrigin = stripTrailingSlash(origin);
  return `${sanitizedOrigin}/api/python`;
}

function assertProductionSafeBase(base: string): void {
  const isProd = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  if (!isProd) {
    return;
  }

  if (/^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3})(?::\d+)?(?:\/.*)?$/i.test(base)) {
    throw new Error(
      "BACKEND_BASE_URL/NEXT_PUBLIC_API_BASE(_URL) points to localhost in production. Configure a publicly reachable FastAPI endpoint or remove the variables to use the /api/python proxy."
    );
  }

  if (base.startsWith("http://") && !productionHttpWarningEmitted) {
    productionHttpWarningEmitted = true;
    console.warn(
      "BACKEND_BASE_URL/NEXT_PUBLIC_API_BASE(_URL) is using http:// in production. Ensure the backend supports HTTPS or rely on the built-in /api/backend proxy to avoid mixed content issues."
    );
  }
}

function resolveBackendBase(request: NextRequest): string {
  const explicit =
    process.env.BACKEND_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE ??
    process.env.NEXT_PUBLIC_API_BASE_URL;
  if (explicit && explicit.trim().length > 0) {
    const sanitized = stripTrailingSlash(explicit.trim());
    assertProductionSafeBase(sanitized);
    return sanitized;
  }

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl && vercelUrl.trim().length > 0) {
    const vercelOrigin = stripTrailingSlash(ensureHttpsOrigin(vercelUrl.trim()))
      .split(",")[0]
      .trim();
    return buildPythonApiBase(vercelOrigin);
  }

  let requestOrigin: string | null = null;
  try {
    const origin = request.nextUrl.origin;
    if (origin && origin.trim().length > 0) {
      requestOrigin = stripTrailingSlash(origin.trim());
    }
  } catch (error) {
    requestOrigin = null;
  }

  const host =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    firstHeaderValue(request.headers.get("host"));
  const protocol =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    firstHeaderValue(request.headers.get("x-forwarded-protocol")) ??
    (() => {
      try {
        const proto = request.nextUrl.protocol.replace(/:$/, "");
        if (proto) {
          return proto;
        }
      } catch (error) {
        return undefined;
      }
      return undefined;
    })() ??
    (host && host.includes("localhost") ? "http" : "https");

  const headerOrigin = host ? stripTrailingSlash(`${protocol}://${host}`) : null;
  const candidateOrigin = requestOrigin ?? headerOrigin;
  const candidateHostname = parseHostname(candidateOrigin);

  if (candidateOrigin) {
    if (isLocalHostname(candidateHostname)) {
      const localFallback = localBackendFallback();
      if (localFallback) {
        return localFallback;
      }
    }
    return buildPythonApiBase(candidateOrigin);
  }

  if (host) {
    return buildPythonApiBase(`${protocol}://${host}`);
  }

  const localFallback = localBackendFallback();
  if (localFallback) {
    return localFallback;
  }

  throw new Error("Unable to resolve backend origin from request");
}

function buildTargetUrl(pathSegments: string[], request: NextRequest, base: string): URL {
  const url = new URL(base);
  const targetPath = pathSegments.join("/");
  const basePath = url.pathname.replace(/\/$/, "");
  const combinedPath = [basePath, targetPath].filter((segment) => segment && segment !== "/").join("/");
  url.pathname = combinedPath.length > 0 ? (combinedPath.startsWith("/") ? combinedPath : `/${combinedPath}`) : "/";
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
