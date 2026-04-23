import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://book-quiz-kappa.vercel.app"),
  title: "Book Quiz",
  description: "Test your knowledge of the books you've read.",
  openGraph: {
    title: "Book Quiz",
    description: "Test your knowledge of the books you've read.",
    url: "https://book-quiz-kappa.vercel.app",
    siteName: "Book Quiz",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Book Quiz",
    description: "Test your knowledge of the books you've read.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
      {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
      )}
    </html>
  );
}
