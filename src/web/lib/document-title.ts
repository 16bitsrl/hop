import { useEffect } from "react";

/** Names the browser tab after the current page and the instance it runs on, e.g. "Links · hop.example.com". */
export function useDocumentTitle(page: string | undefined) {
  useEffect(() => {
    const host = window.location.host;
    document.title = page ? `${page} · ${host}` : host;
  }, [page]);
}
