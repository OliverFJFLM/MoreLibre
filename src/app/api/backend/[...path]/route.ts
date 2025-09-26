import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const rawBase = (process.env.BACKEND_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

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
  const targetUrl = buildTargetUrl(pathSegments, request, rawBase);

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
    const alternativeBase = httpsFallback(rawBase);
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
