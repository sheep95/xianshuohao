"use client";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, ViewTransition, type ReactNode } from "react";

// Rendered by the root layout so <body> persists and this boundary is the top of
// the subtree swapped on navigation (React only runs enter/exit there). The shared
// header carries its own view-transition-name and stays put while the rest moves.
// Link/router types choose the direction. Refreshes and direct links are not
// transitions, so the page simply renders.
const motion = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-fade" };

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const stage = useRef<HTMLDivElement>(null);
  const popped = useRef(false);
  useEffect(() => {
    const mark = () => { popped.current = true; };
    window.addEventListener("popstate", mark);
    return () => window.removeEventListener("popstate", mark);
  }, []);
  // Browser back/forward commits synchronously without a view transition; give
  // the restored page a short CSS fade instead of a hard cut.
  useLayoutEffect(() => {
    if (!popped.current) return;
    popped.current = false;
    stage.current?.setAttribute("data-arrive", "pop");
  }, [pathname]);
  return <ViewTransition key={pathname} enter={motion} exit={motion} default="none">
    <div className="page-transition" ref={stage} onAnimationEnd={(event) => { if (event.target === event.currentTarget) event.currentTarget.removeAttribute("data-arrive"); }}>{children}</div>
  </ViewTransition>;
}
