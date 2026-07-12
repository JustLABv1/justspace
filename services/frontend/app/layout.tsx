import AppLayout from "@/components/AppLayout";
import { BrandingProvider } from "@/services/frontend/context/BrandingContext";
import { PwaBootstrap } from "@/components/PwaBootstrap";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { getRuntimeConfig } from "@/services/frontend/lib/env-config";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-code",
  subsets: ["latin"],
});

const serverApiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081';

async function getServerBranding() {
  try {
    const response = await fetch(`${serverApiBase}/api/platform/branding`, { cache: 'no-store' });
    if (response.ok) {
      return await response.json() as { name?: string; logoPath?: string };
    }
  } catch { /* use the default while the backend is unavailable */ }
  return { name: 'justspace' };
}

function absoluteBrandAsset(path: string | undefined) {
  if (!path) return undefined;
  const iconPath = path.replace('/logo/512', '/logo/32');
  return iconPath.startsWith('http') ? iconPath : `${serverApiBase}${iconPath}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getServerBranding();
  const name = branding.name?.trim() || 'justspace';
  const logo = absoluteBrandAsset(branding.logoPath);
  return {
    title: `${name} | Consultant Portal`,
    description: `Project tracking and documentation for ${name}`,
    applicationName: name,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: name,
    },
    formatDetection: { telephone: false },
    icons: {
      icon: logo || "/favicon.ico",
      apple: logo || "/apple-touch-icon.png",
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "oklch(0.6204 0.195 253.83)" },
    { media: "(prefers-color-scheme: dark)", color: "oklch(0.7204 0.145 253.83)" },
  ],
};

export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const runtimeConfig = getRuntimeConfig();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window._env_ = ${JSON.stringify(runtimeConfig)};`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased font-sans`}
      >
        <PwaBootstrap />
        <ThemeProvider>
          <ToastProvider />
          <BrandingProvider>
            <AppLayout>
              {children}
            </AppLayout>
          </BrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
