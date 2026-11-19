"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, type ComponentProps, type MouseEvent } from "react";

export type NavDirection = "forward" | "back";

// Route motion is a React <ViewTransition> (see page-transition.tsx). The browser
// snapshots the old page only once the new route is ready to commit, so there is
// no artificial wait, no blank frame on slow networks and the old page stays
// usable while the next one loads. The type picks the slide direction.
export function navTypes(direction: NavDirection = "forward") {
  return [direction === "back" ? "nav-back" : "nav-forward"];
}

export function useTransitionRouter() {
  const router = useRouter();
  const push = useCallback((href: string, options?: { direction?: NavDirection }) => {
    router.push(href, { transitionTypes: navTypes(options?.direction) });
  }, [router]);
  return { push, prefetch: router.prefetch };
}

type Props = Omit<ComponentProps<typeof Link>, "href" | "transitionTypes"> & { href: string; direction?: NavDirection };

export function TransitionLink({ href, direction = "forward", onMouseEnter, ...rest }: Props) {
  const router = useRouter();
  return <Link href={href} transitionTypes={navTypes(direction)} {...rest}
    onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => { onMouseEnter?.(event); router.prefetch(href); }} />;
}
