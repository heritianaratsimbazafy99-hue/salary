"use client";

import { useEffect, useRef, useState } from "react";
import type { ElementType, ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  /** Stagger entrance by this many milliseconds. */
  delay?: number;
  /** Render as a different element (e.g. "li", "section"). Defaults to div. */
  as?: ElementType;
  className?: string;
};

/**
 * Reveals its children when scrolled into view. Degrades gracefully:
 * - Without JS, the `.js` flag is absent so children stay visible (see globals.css).
 * - With reduced-motion, content is shown immediately and CSS disables transitions.
 */
export function Reveal({ children, delay = 0, as, className }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  const Tag = (as ?? "div") as ElementType;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      // Defer out of the synchronous effect body; CSS also forces visibility
      // under reduced motion, so this is purely a belt-and-braces fallback.
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      data-reveal=""
      data-shown={shown ? "true" : "false"}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={className}
    >
      {children}
    </Tag>
  );
}
