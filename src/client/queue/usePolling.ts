import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

/** Reload the route's data every few seconds while the tab is visible. */
export function useLiveRoute(intervalMs = 3000) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.invalidate().catch(() => {});
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
}
