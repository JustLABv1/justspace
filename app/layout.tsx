import AppLayout from "@/components/AppLayout";
import { ThemeProvider } from "@/components/ThemeProvider";
import { getRuntimeConfig } from "@/lib/env-config";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "justspace | Consultant Portal",
  description: "Project tracking and documentation for consultants",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <AppLayout>
            {children}
          </AppLayout>
        </ThemeProvider>
      </body>
    </html>
  );
}
