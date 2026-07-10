import type { MetadataRoute } from "next";

const serverApiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081';

function assetURL(path: string | undefined, size: number, fallback: string) {
  if (!path) return fallback;
  const sizedPath = path.replace('/logo/512', `/logo/${size}`);
  return sizedPath.startsWith('http') ? sizedPath : `${serverApiBase}${sizedPath}`;
}

export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let branding: { name?: string; logoPath?: string } = { name: 'justspace' };
  try {
    const response = await fetch(`${serverApiBase}/api/platform/branding`, { cache: 'no-store' });
    if (response.ok) branding = await response.json();
  } catch { /* use defaults */ }
  const name = branding.name?.trim() || 'justspace';
  return {
    name,
    short_name: name,
    description: `Project tracking and documentation for ${name}`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8f9fa",
    theme_color: "#5c7cfa",
    categories: ["productivity", "business"],
    icons: [
      {
        src: assetURL(branding.logoPath, 192, "/icon-192.png"),
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: assetURL(branding.logoPath, 512, "/icon-512.png"),
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: assetURL(branding.logoPath, 180, "/apple-touch-icon.png"),
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
