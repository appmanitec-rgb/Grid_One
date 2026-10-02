import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Manitec GridOne",
  description: "Manitec Grupos Geradores - Plataforma Comercial e Operacional",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
