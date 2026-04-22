import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Book Quiz",
  description: "Reflective book quizzes for readers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
