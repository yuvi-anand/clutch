import type { Metadata } from "next";
import { APP_NAME, TAGLINE } from "@/lib/brand";
import "katex/dist/katex.min.css";
import "./globals.css";
import { FeedbackButton } from "@/components/Feedback";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: APP_NAME,
  description: TAGLINE,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-100">
        <Nav />
        <main className="mx-auto max-w-6xl px-4 pt-6 pb-24 sm:px-6">{children}</main>
        <FeedbackButton />
      </body>
    </html>
  );
}
