import { useState } from "react";
import {
  useBusinessSummary,
  useCreateProduct,
  useDeleteProduct,
  useProducts,
  useUpdateProduct,
} from "../lib/query";
import type { Product, ProductKind, ProductStatus } from "../lib/types";

// Catalogo prodotti/servizi (P1.1): cio' che l'impresa vende o eroga. Distinto
// dalla libreria di deliverable (pipeline.asset): qui c'e' l'offerta, non il
// lavoro. Persistenza: `business.product`.

const STATUSES: { id: ProductStatus; label: string }[] = [
  { id: "draft", label: "Bozza" },
  { id: "active", label: "Attivo" },
  { id: "archived", label: "Archiviato" },
];

const KIND_LABEL: Record<ProductKind, string> = { product: "Prodotto", service: "Servizio" };

function statusClass(status: ProductStatus): string {
  switch (status) {
    case "active":
      return "text-emerald-300 border-emerald-500/40";
    case "draft":
      return "text-[color:var(--color-accent)] border-[color:var(--color-accent)]/40";
    default:
      return "text-[color:var(--color-muted)] border-[color:var(--color-border)]";
  }
}

function money(cents: string | number, currency: string): string {
  const value = Number(cents) / 100;
  return value.toLocaleString("it-IT", { style: "currency", currency: currency || "EUR" });
}

export default function Products() {
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const list = useProducts({ status: status || undefined, kind: kind || undefined });
  const summary = useBusinessSummary();
  const update = useUpdateProduct();
  const remove = useDeleteProduct();

  return (
    <div>
      <header className="mb-8">
        <h1 className="wordmark text-3xl font-semibold text-white">Prodotti & Servizi</h1>
        <p className="mt-1 text-sm text-[color:var(--color-muted)]">
          Il catalogo dell'offerta dell'impresa: cosa vende o eroga. Distinto dalla libreria dei
          deliverable generati dalla pipeline.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Voci totali" value={summary.data?.products.total ?? 0} />
        <Metric label="Attivi" value={summary.data?.products.active ?? 0} />
        <Metric label="Prodotti" value={summary.data?.products.byStatus.active ?? 0} />
        <Metric label="Obiettivi attivi" value={summary.data?.goals.active ?? 0} />
      </div>

      <NewProductForm />

      <div className="mb-4 mt-8 flex flex-wrap items-center gap-2">
        {[{ id: "" as const, label: "Tutti gli stati" }, ...STATUSES].map((f) => (
          <button
            key={f.id || "all"}
            className={`btn ${status === f.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setStatus(f.id)}
          >
            {f.label}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-[color:var(--color-border)]" />
        {[
          { id: "" as const, label: "Tutti i tipi" },
          { id: "product" as const, label: "Prodotti" },
          { id: "service" as const, label: "Servizi" },
        ].map((f) => (
          <button
            key={f.id || "kind-all"}
            className={`btn ${kind === f.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setKind(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {list.isLoading ? (
          <div className="p-6 text-sm text-[color:var(--color-muted)]">Caricamento…</div>
        ) : !list.data?.length ? (
          <div className="p-6 text-sm text-[color:var(--color-muted)]">Nessun prodotto o servizio in catalogo.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[rgba(0,0,0,0.2)] text-left text-xs uppercase tracking-wider text-[color:var(--color-muted)]">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Prezzo</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((p: Product) => (
                <tr key={p.id} className="border-t border-[color:var(--color-border)]">
                  <td className="px-4 py-3 text-white">
                    {p.name}
                    {p.description && (
                      <div className="text-[11px] text-[color:var(--color-muted)]">{p.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">{KIND_LABEL[p.kind]}</td>
                  <td className="px-4 py-3 font-mono text-[color:var(--color-muted)]">{p.sku || "—"}</td>
                  <td className="px-4 py-3 text-[color:var(--color-muted)]">{money(p.price_cents, p.currency)}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${statusClass(p.status)}`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {p.status !== "active" && (
                        <button
                          className="btn btn-ghost"
                          disabled={update.isPending}
                          onClick={() => update.mutate({ id: p.id, status: "active" })}
                        >
                          Attiva
                        </button>
                      )}
                      {p.status === "active" && (
                        <button
                          className="btn btn-ghost"
                          disabled={update.isPending}
                          onClick={() => update.mutate({ id: p.id, status: "archived" })}
                        >
                          Archivia
                        </button>
                      )}
                      <button
                        className="btn btn-ghost"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(p.id)}
                      >
                        Elimina
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="text-xs uppercase tracking-wider text-[color:var(--color-muted)]">{label}</div>
    </div>
  );
}

function NewProductForm() {
  const create = useCreateProduct();
  const [kind, setKind] = useState<ProductKind>("service");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [status, setStatus] = useState<ProductStatus>("draft");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const priceCents = price.trim() ? Math.round(Number(price) * 100) : 0;
    if (Number.isNaN(priceCents) || priceCents < 0) {
      setError("Prezzo non valido");
      return;
    }
    create.mutate(
      {
        kind,
        name: name.trim(),
        sku: sku.trim() || undefined,
        description: description.trim() || undefined,
        priceCents,
        currency,
        status,
      },
      {
        onSuccess: () => {
          setName("");
          setSku("");
          setDescription("");
          setPrice("");
          setStatus("draft");
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  }

  return (
    <section className="card p-6">
      <h2 className="mb-4 text-lg font-semibold text-white">Nuova voce di catalogo</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          Nome
          <input
            className="input"
            value={name}
            placeholder="Es. Consulenza SEO"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          Tipo
          <select
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as ProductKind)}
          >
            <option value="service">Servizio</option>
            <option value="product">Prodotto</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          SKU (opzionale)
          <input className="input" value={sku} onChange={(e) => setSku(e.target.value)} />
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            Prezzo (opzionale)
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            Valuta
            <input
              className="input w-20"
              value={currency}
              maxLength={3}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          Stato
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProductStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          Descrizione (opzionale)
          <textarea
            className="input min-h-[42px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-4">
        <button
          className="btn btn-primary"
          disabled={!name.trim() || create.isPending}
          onClick={submit}
        >
          Aggiungi al catalogo
        </button>
      </div>
    </section>
  );
}
