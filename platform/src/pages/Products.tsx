import { useEffect, useMemo, useState } from "react";
import { Boxes, Grid3x3, List, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import {
  useBusinessCatalog,
  useCreateProduct,
  useDeleteProduct,
  useProducts,
  useUpdateProduct,
} from "@/lib/platform-queries";
import type { ProductItem } from "@/lib/platform-api";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "success" | "warning" | "default"> = {
  active: "success",
  draft: "warning",
  archived: "default",
};

type ViewMode = "grid" | "table";

interface ProductForm {
  name: string;
  kind: string;
  sku: string;
  description: string;
  price: string;
  status: string;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  kind: "",
  sku: "",
  description: "",
  price: "",
  status: "draft",
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Operazione non riuscita";
}

function parsePrice(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (normalized === "") return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export default function Products() {
  const { toast } = useToast();
  const [view, setView] = useState<ViewMode>("grid");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductItem | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const productsQuery = useProducts();
  const catalogQuery = useBusinessCatalog();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const list = productsQuery.data ?? [];
  const kindOptions = (catalogQuery.data?.productKinds ?? []).map((item) => ({
    value: item.id,
    label: item.label,
  }));
  const statusOptions = (catalogQuery.data?.productStatuses ?? []).map((item) => ({
    value: item.id,
    label: item.label,
  }));

  useEffect(() => {
    if (kindOptions.length > 0 && form.kind === "") {
      setForm((current) => ({ ...current, kind: kindOptions[0].value }));
    }
  }, [form.kind, kindOptions]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return list.filter((product) => {
      const matchesStatus = statusFilter === "all" || product.status === statusFilter;
      const matchesQuery =
        needle === "" ||
        product.name.toLowerCase().includes(needle) ||
        product.description.toLowerCase().includes(needle) ||
        product.sku.toLowerCase().includes(needle);
      return matchesStatus && matchesQuery;
    });
  }, [list, statusFilter, query]);

  const stats = useMemo(() => {
    const active = list.filter((product) => product.status === "active").length;
    const draft = list.filter((product) => product.status === "draft").length;
    const catalogValue = list.reduce((sum, product) => sum + product.priceCents, 0) / 100;
    return { total: list.length, active, draft, catalogValue };
  }, [list]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, kind: kindOptions[0]?.value ?? "" });
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(product: ProductItem) {
    setEditing(product);
    setForm({
      name: product.name,
      kind: product.kind,
      sku: product.sku,
      description: product.description,
      price: product.priceCents > 0 ? (product.priceCents / 100).toFixed(2).replace(".", ",") : "",
      status: product.status,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    if (form.name.trim().length < 3) {
      setFormError("Il nome del prodotto e' obbligatorio.");
      return;
    }
    const priceCents = parsePrice(form.price);
    if (priceCents === null) {
      setFormError("Inserisci un prezzo valido.");
      return;
    }
    setFormError(null);
    try {
      if (editing) {
        await updateProduct.mutateAsync({
          id: editing.id,
          body: {
            name: form.name.trim(),
            kind: form.kind,
            description: form.description.trim(),
            priceCents,
            status: form.status,
          },
        });
        toast({ kind: "success", title: "Prodotto aggiornato", description: form.name.trim() });
      } else {
        await createProduct.mutateAsync({
          name: form.name.trim(),
          kind: form.kind || undefined,
          sku: form.sku.trim() || undefined,
          description: form.description.trim() || undefined,
          priceCents,
        });
        toast({ kind: "success", title: "Prodotto creato", description: form.name.trim() });
      }
      setModalOpen(false);
      setEditing(null);
    } catch (error) {
      toast({ kind: "error", title: "Salvataggio non riuscito", description: errorText(error) });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteProduct.mutateAsync(deleteTarget.id);
      toast({ kind: "info", title: "Prodotto eliminato", description: deleteTarget.name });
      setDeleteTarget(null);
    } catch (error) {
      toast({ kind: "error", title: "Eliminazione non riuscita", description: errorText(error) });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Prodotti"
        description="Catalogo di prodotti e servizi del tenant: prezzi, stato e descrizioni salvati sul server."
        actions={
          <Button variant="primary" leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={openCreate}>
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
        <KpiCard label="Bozze" value={formatNumber(stats.draft)} />
        <KpiCard
          label="Valore di listino"
          value={formatCurrency(stats.catalogValue)}
          hint="Somma dei prezzi di catalogo, non vendite."
        />
      </section>

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {[{ value: "all", label: "Tutti" }, ...statusOptions].map((filter) => (
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

      {productsQuery.isLoading ? (
        <Card bodyClassName="p-5">
          <Skeleton lines={6} />
        </Card>
      ) : productsQuery.isError ? (
        <Card bodyClassName="p-5">
          <EmptyState
            icon={<Package className="h-5 w-5" aria-hidden="true" />}
            title="Catalogo non disponibile"
            description={errorText(productsQuery.error)}
            action={
              <Button variant="secondary" size="sm" onClick={() => productsQuery.refetch()}>
                Ricarica catalogo
              </Button>
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" aria-hidden="true" />}
          title="Nessun prodotto"
          description="Nessun prodotto corrisponde ai filtri selezionati."
          action={
            <Button variant="secondary" size="sm" onClick={openCreate}>
              Crea il primo prodotto
            </Button>
          }
        />
      ) : view === "grid" ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => (
            <li key={product.id}>
              <Card className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-text-primary">{product.name}</h3>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {product.kind}
                      {product.sku ? ` · ${product.sku}` : ""}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[product.status] ?? "default"}>{product.status}</Badge>
                </div>
                <p className="flex-1 text-sm text-text-secondary">{product.description || "—"}</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-lg font-semibold text-text-primary">
                    {formatCurrency(product.priceCents / 100, product.currency)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" fullWidth onClick={() => openEdit(product)}>
                    Modifica
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Elimina ${product.name}`}
                    onClick={() => setDeleteTarget(product)}
                  >
                    <Trash2 className="h-4 w-4 text-error" aria-hidden="true" />
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
                  <th scope="col" className="py-2 pr-4 font-medium">Tipo</th>
                  <th scope="col" className="py-2 pr-4 font-medium">SKU</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Prezzo</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Stato</th>
                  <th scope="col" className="py-2 pr-5 font-medium text-right">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.id} className="border-b border-secondary/5">
                    <td className="py-3 pl-5 pr-4 text-text-primary">{product.name}</td>
                    <td className="py-3 pr-4 text-text-secondary">{product.kind}</td>
                    <td className="py-3 pr-4 text-text-secondary">{product.sku || "—"}</td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {formatCurrency(product.priceCents / 100, product.currency)}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={STATUS_VARIANT[product.status] ?? "default"}>
                        {product.status}
                      </Badge>
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Modifica ${product.name}`}
                          onClick={() => openEdit(product)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Elimina ${product.name}`}
                          onClick={() => setDeleteTarget(product)}
                        >
                          <Trash2 className="h-4 w-4 text-error" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? "Modifica prodotto" : "Nuovo prodotto"}
        description={
          editing
            ? "Le modifiche vengono salvate sul catalogo del tenant."
            : "Aggiungi un prodotto o servizio al catalogo."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="primary"
              loading={createProduct.isPending || updateProduct.isPending}
              disabled={form.name.trim().length < 3}
              onClick={handleSave}
            >
              {editing ? "Salva modifiche" : "Aggiungi prodotto"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Nome prodotto"
            placeholder="Es. Kit Analytics Avanzato"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Tipo"
              value={form.kind}
              onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value }))}
              options={kindOptions}
            />
            <Input
              label="SKU"
              value={form.sku}
              onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
              readOnly={Boolean(editing)}
              hint={editing ? "Lo SKU non e' modificabile dopo la creazione." : undefined}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Prezzo (EUR)"
              type="number"
              min={0}
              step="0.01"
              placeholder="99"
              value={form.price}
              onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
              error={formError ?? undefined}
            />
            {editing && (
              <Select
                label="Stato"
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({ ...current, status: event.target.value }))
                }
                options={statusOptions}
              />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="product-description" className="text-sm font-medium text-text-secondary">
              Descrizione
            </label>
            <textarea
              id="product-description"
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Descrivi brevemente il prodotto."
              className="w-full rounded-lg border border-secondary/20 bg-primary/60 px-3.5 py-2.5 text-base text-text-primary placeholder:text-text-muted focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Eliminare il prodotto?"
        description="L'operazione rimuove l'elemento dal catalogo del tenant."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Annulla
            </Button>
            <Button variant="danger" loading={deleteProduct.isPending} onClick={handleDelete}>
              Elimina
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          Prodotto: <span className="font-medium text-text-primary">{deleteTarget?.name}</span>
        </p>
      </Modal>
    </div>
  );
}
