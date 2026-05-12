import * as React from "react";

// v0.13 — bump à 1024 (lg) pour basculer la sidebar en drawer Sheet
// dès qu'on passe sous le seuil "petit desktop / tablette paysage".
const MOBILE_BREAKPOINT = 1024;

// v0.46 — init synchrone via matchMedia pour éviter le flash desktop sur smartphone (SSR-safe).
function getInitial(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(getInitial);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
