import type { Metadata } from "next";
import "./globals.css";
import "./homepage.css";
import "./workflow.css";
import "./card.css";
import "./playful.css";
import "./studio.css";
import "./motion.css";
import { PageTransition } from "@/components/page-transition";
import { IntroSplash, openingScript } from "@/components/intro-splash";

export const metadata: Metadata = {
  title: "先说好｜共享空间的小约定",
  description:
    "刚凑齐的室友、旅伴和社团同伴，花 3 分钟说好 5 件小事。匿名认领，保存便签，发到群里。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: openingScript }} /></head>
      <body>
        <IntroSplash />
        <div id="application-content" suppressHydrationWarning><PageTransition>{children}</PageTransition></div>
      </body>
    </html>
  );
}
