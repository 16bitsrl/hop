import { useSyncExternalStore } from "react";

/** True while the media query matches, e.g. `useMediaQuery("(min-width: 768px)")`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}
