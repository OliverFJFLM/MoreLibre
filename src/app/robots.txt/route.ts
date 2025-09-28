const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://morelibre.example.com";

export function GET(): Response {
  const lines = [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${SITE_URL.replace(/\/$/, "")}/sitemap.xml`,
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
