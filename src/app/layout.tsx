import type { Metadata } from "next";
import { Geist_Mono, Inter, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Hindi (Devanagari) letters are not in Inter; this font fills in only for those letters.
const devanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "SETMI INDIA Inventory Management System", template: "%s | SETMI INDIA" },
  description: "Internal inventory management for SETMI INDIA",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${devanagari.variable} h-full antialiased`}
    >
      <head>
        {/* Applies the saved Light / Dark choice before the page is drawn, so there is no flash. Fixed text, no user input. */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('ims_theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}" }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
