import { useEffect, useRef, useState } from "react";

/**
 * Lightweight scroll-reveal hook backed by IntersectionObserver.
 * Returns a ref to attach to the element and a boolean that flips to
 * true once the element has entered the viewport (and stays true —
 * this is a one-way reveal, not a scroll-linked toggle).
 *
 * Used across the landing page instead of a motion library: the page
 * has no other need for one, and CSS transitions triggered by a class
 * are enough to make sections feel considered without adding a
 * dependency for a handful of fade/slide-ins.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.2) {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Respect reduced-motion users by just showing content immediately.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -10% 0px" }
    );

    observer.observe(node);

    // Defensive fallback: content must never depend on the observer firing
    // to become readable — a resize-based capture, a slow layout pass, or a
    // browser quirk could all mean it never does. If scroll hasn't revealed
    // the section within a beat of mounting, show it anyway.
    const fallback = window.setTimeout(() => setIsVisible(true), 1200);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [threshold]);

  return { ref, isVisible };
}
