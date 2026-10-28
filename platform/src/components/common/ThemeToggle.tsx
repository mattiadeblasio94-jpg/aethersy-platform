// =============================================================================
// Controlli tema (brief §5.3). Due forme dello stesso controllo:
//  - ThemeToggle: pulsante compatto per l'Header (cicla scuro/chiaro/sistema).
//  - ThemeSelector: radiogroup esteso per la pagina Impostazioni > Profilo.
// Entrambi leggono/scrivono la preferenza nello store UI persistito.
// =============================================================================

import { Monitor, Moon, Sun } from "lucide-react";
import { useUiStore } from "@/store/ui";
import type { ThemeMode } from "@/store/ui";
import { cn } from "@/lib/utils";

interface ThemeOption {
  value: ThemeMode;
  label: string;
  icon: typeof Sun;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: "dark", label: "Scuro", icon: Moon },
  { value: "light", label: "Chiaro", icon: Sun },
  { value: "system", label: "Sistema", icon: Monitor },
];

/**
 * Pulsante compatto per l'Header: mostra il tema attuale e cicla fra i tre
 * valori ad ogni click. Accessibile da tastiera, target >= 44px.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);

  const currentIndex = THEME_OPTIONS.findIndex((option) => option.value === theme);
  const current = THEME_OPTIONS[currentIndex] ?? THEME_OPTIONS[0];
  const next = THEME_OPTIONS[(currentIndex + 1) % THEME_OPTIONS.length];
  const Icon = current.icon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next.value)}
      aria-label={`Tema: ${current.label}. Passa a ${next.label}.`}
      title={`Tema: ${current.label}`}
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary",
        "transition-colors hover:bg-bg-hover hover:text-text-primary",
        className,
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/**
 * Selettore esteso (radiogroup) per la pagina Impostazioni > Profilo, con
 * etichetta per ciascuna opzione.
 */
export function ThemeSelector({ className }: { className?: string }) {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);

  return (
    <div
      role="radiogroup"
      aria-label="Tema dell'interfaccia"
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-xl border border-secondary/10 bg-primary/40 p-1",
        className,
      )}
    >
      {THEME_OPTIONS.map((option) => {
        const selected = option.value === theme;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option.value)}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors",
              selected
                ? "bg-secondary/15 text-secondary"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
