import type { Metadata, Viewport } from "next";
import { nomeSistema, descricaoSistema } from "../../config/empresa";
import { SCRIPT_TEMA } from "../lib/tema";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: nomeSistema, template: `%s · ${nomeSistema}` },
  description: descricaoSistema,
  icons: { icon: "/marca/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FCFCFD" },
    { media: "(prefers-color-scheme: dark)", color: "#111114" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
