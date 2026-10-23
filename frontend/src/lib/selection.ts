/** Reveal details after an explicit inspection action, without moving chart navigation focus. */
export function revealDetails(element: HTMLElement | null) {
  element?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
  element?.focus({ preventScroll: true });
}
