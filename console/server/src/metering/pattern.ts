// Matching dei pattern di modello del price book (modulo puro, senza import:
// cosi' e' testabile in isolamento senza toccare DB/config).
//
// Punteggio di specificita' di un `model_pattern` rispetto a un modello:
// `null` = non corrisponde. Piu' alto = piu' specifico.
//   'deepseek/x'  esatto  -> 1000+
//   'deepseek/*'  prefisso-> 500+
//   '*:free'      regex   -> 100+
//   '*'           wildcard-> 1

export function patternScore(pattern: string, model: string): number | null {
  if (pattern === model) return 1000 + model.length;
  if (pattern === "*") return 1;
  if (pattern.endsWith("*") && !pattern.slice(0, -1).includes("*")) {
    const prefix = pattern.slice(0, -1);
    return model.startsWith(prefix) ? 500 + prefix.length : null;
  }
  if (pattern.includes("*")) {
    const rx = new RegExp("^" + pattern.split("*").map(escapeRe).join(".*") + "$");
    if (!rx.test(model)) return null;
    return 100 + pattern.replace(/\*/g, "").length;
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
