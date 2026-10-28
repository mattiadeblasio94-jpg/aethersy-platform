// =============================================================================
// Prodotti (brief §3.8) — rotta /products. Catalogo con vista griglia/tabella,
// classifica best-seller, ricerca, filtro stato e creazione prodotto.
// =============================================================================

import { useMemo, useState } from "react";
import { Boxes, Grid3x3, List, Package, Plus, Search, Star, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import { useCreateProduct, useProducts } from "@/lib/queries";
import type { Product } from "@/lib/types";
import { cn, formatCurrency, formatNumber, productStatusLabel } from "@/lib/utils";

const STATUS_VARIANT: Record<Product["status"], "success" | "warning" | "default"> = {
  active: "success",
  draft: "warning",
  archived: "default",
};

const STATUS_FILTERS = [
  { value: "all", label: "Tutti" },
  { value: "active", label: "Attivi" },
  { value: "draft", label: "Bozze" },
  { value: "archived", label: "Archiviati" },
];

type ViewMode = "grid" | "table";

export default function Products() {
  const { toast } = useToast();
  const [view, setView] = useState<ViewMode>("grid");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  const products = useProducts();
  const createProduct = useCreateProduct();

  const list = products.data ?? [];

  const filtered = useMemo(
    () =>
      list.filter((product) => {
        const matchesStatus = statusFilter === "all" || product.status === statusFilter;
        const matchesQuery =
          query.trim() === "" ||
          product.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          product.description.toLowerCase().includes(query.trim().toLowerCase());
        return matchesStatus && matchesQuery;
      }),
    [list, statusFilter, query],
  );

  const bestSellers = useMemo(
    () => [...list].sort((a, b) => (b.sold ?? 0) - (a.sold ?? 0)).slice(0, 5),
    [list],
  );

  const stats = useMemo(() => {
    const active = list.filter((product) => product.status === "active").length;
    const sold = list.reduce((sum, product) => sum + (product.sold ?? 0), 0);
    const revenue = list.reduce((sum, product) => sum + (product.sold ?? 0) * product.price, 0);
    return { total: list.length, active, sold, revenue };
  }, [list]);

  async function handleCreate() {
    try {
      await createProduct.mutateAsync({ name: name.trim() || "Nuovo prodotto" });
      toast({
        kind: "success",
        title: "Prodotto creato",
        description: `${name.trim() || "Nuovo prodotto"} aggiunto al catalogo.`,
      });
      setModalOpen(false);
      setName("");
      setPrice("");
      setDescription("");
    } catch {
      toast({ kind: "error", title: "Creazione non riuscita" });
    }
  }

  function handleAction(productName: string, action: string) {
    toast({ kind: "info", title: action, description: `${productName}: azione registrata (mock).` });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Prodotti"
        description="Catalogo di prodotti e servizi, con vendite e performance."
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            onClick={() => setModalOpen(true)}
          >
            Nuovo Prodotto
          </Button>
        }
      />

      <section aria-label="Statistiche prodotti" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Prodotti"
          value={formatNumber(stats.total)}
          icon={<Boxes className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="Attivi"
          value={formatNumber(stats.active)}
          icon={<Package className="h-5 w-5 text-success" aria-hidden="true" />}
        />
        <KpiCard
          label="Unita' vendute"
          value={formatNumber(stats.sold)}
          icon={<TrendingUp className="h-5 w-5 text-secondary" aria-hidden="true" />}
          delta="+7,3%"
          trend="up"
        />
        <KpiCard
          label="Fatturato stimato"
          value={formatCurrency(stats.revenue)}
          icon={<TrendingUp className="h-5 w-5 text-secondary" aria-hidden="true" />}
          delta="+9,1%"
          trend="up"
        />
      </section>

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={statusFilter === filter.value}
                onClick={() => setStatusFilter(filter.value)}
                className={cn(
                  "min-h-[44px] rounded-full border px-3.5 text-sm transition-colors",
                  statusFilter === filter.value
                    ? "border-secondary/50 bg-secondary/15 text-secondary"
                    : "border-secondary/15 text-text-secondary hover:bg-bg-hover",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Input
              type="search"
              placeholder="Cerca prodotto…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
              className="lg:w-64"
            />
            <div
              role="group"
              aria-label="Modalita' di visualizzazione"
              className="inline-flex gap-1 rounded-xl border border-secondary/10 bg-primary/40 p-1"
            >
              <button
                type="button"
                aria-pressed={view === "grid"}
                aria-label="Vista griglia"
                onClick={() => setView("grid")}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                  view === "grid" ? "bg-secondary/15 text-secondary" : "text-text-muted hover:text-text-primary",
                )}
              >
                <Grid3x3 className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-pressed={view === "table"}
                aria-label="Vista tabella"
                onClick={() => setView("table")}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                  view === "table" ? "bg-secondary/15 text-secondary" : "text-text-muted hover:text-text-primary",
                )}
              >
                <List className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </Card>

      {products.isLoading ? (
        <Card bodyClassName="p-5">
          <Skeleton lines={6} />
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" aria-hidden="true" />}
          title="Nessun prodotto"
          description="Nessun prodotto corrisponde ai filtri selezionati."
        />
      ) : view === "grid" ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => (
            <li key={product.id}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-text-primary">{product.name}</h3>
                    <p className="mt-0.5 text-xs text-text-muted">{product.category}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[product.status]}>
                    {productStatusLabel(product.status)}
                  </Badge>
                </div>
                <p className="flex-1 text-sm text-text-secondary">{product.description}</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-lg font-semibold text-text-primary">
                    {formatCurrency(product.price, product.currency)}
                  </span>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    {typeof product.rating === "number" && product.rating > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                        {product.rating.toFixed(1).replace(".", ",")}
                      </span>
                    )}
                    <span>{formatNumber(product.sold ?? 0)} venduti</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    onClick={() => handleAction(product.name, "Modifica")}
                  >
                    Modifica
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <caption className="sr-only">Catalogo prodotti</caption>
              <thead>
                <tr className="border-b border-secondary/10 text-left text-xs text-text-muted">
                  <th scope="col" className="py-2 pl-5 pr-4 font-medium">Prodotto</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Categoria</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Prezzo</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Magazzino</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Venduti</th>
                  <th scope="col" className="py-2 pr-5 font-medium text-right">Stato</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.id} className="border-b border-secondary/5">
                    <td className="py-3 pl-5 pr-4 text-text-primary">{product.name}</td>
                    <td className="py-3 pr-4 text-text-secondary">{product.category}</td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {formatCurrency(product.price, product.currency)}
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{formatNumber(product.stock)}</td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {formatNumber(product.sold ?? 0)}
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <Badge variant={STATUS_VARIANT[product.status]}>
                        {productStatusLabel(product.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Best-seller */}
      <Card header={<h2 className="text-base font-semibold text-text-primary">Best-seller</h2>}>
        {products.isLoading ? (
          <Skeleton lines={5} />
        ) : (
          <ol className="flex flex-col gap-3">
            {bestSellers.map((product, index) => (
              <li key={product.id} className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-hover text-xs font-semibold text-text-secondary">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {product.name}
                </span>
                <span className="text-sm text-text-secondary">
                  {formatNumber(product.sold ?? 0)} venduti
                </span>
                <span className="w-32 shrink-0 text-right text-xs text-text-muted">
                  {formatCurrency((product.sold ?? 0) * product.price)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Modale nuovo prodotto */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Nuovo prodotto"
        description="Aggiungi un prodotto o servizio al catalogo."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="primary"
              loading={createProduct.isPending}
              disabled={name.trim().length < 3}
              onClick={handleCreate}
            >
              Aggiungi prodotto
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Nome prodotto"
            placeholder="Es. Kit Analytics Avanzato"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            label="Prezzo (EUR)"
            type="number"
            min={0}
            placeholder="99"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="product-description" className="text-sm font-medium text-text-secondary">
              Descrizione
            </label>
            <textarea
              id="product-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descrivi brevemente il prodotto."
              className="w-full rounded-lg border border-secondary/20 bg-primary/60 px-3.5 py-2.5 text-base text-text-primary placeholder:text-text-muted focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
