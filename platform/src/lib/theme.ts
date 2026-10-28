// =============================================================================
// Tema (brief §5.3): scuro, chiaro o "sistema". La preferenza vive nello store
// UI (persistito) e viene applicata come classe `dark`/`light` sull'elemento
// <html>, cosi' i token CSS (src/index.css) cambiano in un solo punto.
// =============================================================================

import { useEffect } from "react";
import { useUiStore } from "@/store/ui";
import type { ThemeMode } from "@/store/ui";

export type ResolvedTheme = "dark" | "light";

/** Risolve la preferenza in un tema effettivo, considerando il sistema. */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "dark";
  }
  return mode;
}

/** Applica il tema all'elemento <html> e restituisce il tema risolto. */
export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
  }
  return resolved;
}

/**
 * Hook da montare una sola volta (App): tiene sincronizzato il tema preferito
 * con <html> e reagisce ai cambi di tema di sistema quando la preferenza e'
 * "system".
 */
export function useAppliedTheme(): ThemeMode {
  const theme = useUiStore((state) => state.theme);

  useEffect(() => {
    applyTheme(theme);

    if (theme !== "system") return undefined;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return theme;
}
