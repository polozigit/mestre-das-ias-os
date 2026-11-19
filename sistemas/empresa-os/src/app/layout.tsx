import type { Metadata, Viewport } from "next";
import { nomeSistema, descricaoSistema } from "../../config/empresa";
import { marca } from "../../config/marca";
import { SCRIPT_TEMA } from "../lib/tema";
import { FaixaTeste } from "../components/layout/FaixaTeste";
import { LuzDoCursor } from "../components/ui/LuzDoCursor";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: nomeSistema, template: `%s · ${nomeSistema}` },
  description: descricaoSistema,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: marca.corDoNavegador.claro },
    { media: "(prefers-color-scheme: dark)", color: marca.corDoNavegador.escuro },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        {marca.fontesGoogle && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link rel="stylesheet" href={marca.fontesGoogle} />
          </>
        )}
      </head>
      <body>
        <FaixaTeste />
        {children}
        <LuzDoCursor />
      </body>
    </html>
  );
}
