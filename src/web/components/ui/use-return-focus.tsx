import * as React from "react"

/**
 * Dialogs here are usually opened from state, not from a Trigger, so Base UI does not know where
 * focus came from. <CaptureOpener> sits inside the popup: it mounts on every opening, before focus
 * moves in, and remembers the focused element; `finalFocus` gives focus back to it on close
 * (when it is still on the page).
 */
export function useReturnFocus(finalFocus: unknown) {
  const opener = React.useRef<HTMLElement | null>(null)
  const resolved = finalFocus !== undefined ? finalFocus : () => (opener.current?.isConnected ? opener.current : true)
  return { opener, finalFocus: resolved }
}

export function CaptureOpener({ opener }: { opener: React.RefObject<HTMLElement | null> }) {
  React.useState(() => {
    const el = typeof document !== "undefined" ? document.activeElement : null
    opener.current = el instanceof HTMLElement && el !== document.body ? el : null
    return null
  })
  return null
}
