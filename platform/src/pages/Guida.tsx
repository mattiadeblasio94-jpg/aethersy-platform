// =============================================================================
// Guida passo-passo: come si usa la piattaforma, dalla prima idea alla
// vendita online. Ogni passo porta al punto esatto della piattaforma in cui
// si svolge l'azione, con un link diretto: nessuna teoria, solo sequenza.
//
// La guida e' statica di proposito: i numeri che cambiano (crediti, ordini,
// prodotti) stanno nelle rispettive pagine, gia' collegate.
// =============================================================================

import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CircleDollarSign,
  Globe,
  Rocket,
  ShoppingBag,
  Sparkles,
  Store,
  Workflow,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/common/PageElements";

interface GuideStep {
  id: string;
  number: number;
  title: string;
  goal: string;
  icon: typeof Rocket;
  actions: string[];
  where: { label: string; to: string };
  note?: string;
}

const STEPS: GuideStep[] = [
  {
    id: "idea",
    number: 1,
    title: "Descrivi cosa vuoi ottenere",
    goal: "Parti dall'obiettivo finale, non dal mezzo: la piattaforma sceglie gli strumenti.",
    icon: Rocket,
    actions: [
      "Apri 'Realizza l'idea' e scrivi il risultato che vuoi (es. 'voglio una landing per un corso di cucina').",
      "Aggiungi contesto: brand, pubblico, settore, tono, città, eventuali riferimenti.",
      "La piattaforma crea i reparti necessari e mette al lavoro gli specialisti: ricerca sul web reale, testi, immagini, pagine.",
      "Il run mostra ogni passaggio: approvi i deliverable che ti servono e scarti quello che non va.",
    ],
    where: { label: "Realizza la tua idea", to: "/idea" },
    note: "Ogni ricerca e' reale: le fonti citate sono quelle lette sul web, non un testo inventato.",
  },
  {
    id: "sito",
    number: 2,
    title: "Pubblica il sito",
    goal: "Il sito multi-pagina nasce dal deliverable approvato e ha un indirizzo pubblico subito.",
    icon: Globe,
    actions: [
      "Dal run approvato premi 'Pubblica sito': vengono generate le pagine (home, servizi, lavori, contatti).",
      "Ottieni un URL pubblico da condividere: e' lo stesso sito che i reparti hanno scritto.",
      "Puoi ritirare il sito in qualsiasi momento: il link smette di funzionare, i dati restano tuoi.",
    ],
    where: { label: "Sito Web", to: "/website" },
  },
  {
    id: "wix",
    number: 3,
    title: "Collega il tuo account Wix",
    goal: "Un solo clic: la piattaforma si autorizza con il tuo account e legge il tuo sito reale.",
    icon: Sparkles,
    actions: [
      "Nella pagina Wix premi 'Collega Wix': verrai reindirizzato su wix.com per autorizzare.",
      "Torni qui con il collegamento attivo: la piattaforma ha gia' individuato i tuoi siti e i tuoi prodotti.",
      "I token restano cifrati nel tuo tenant: la piattaforma non vede la tua password.",
    ],
    where: { label: "Wix", to: "/wix" },
    note: "Il collegamento usa OAuth 2.1 con PKCE: si puo' revocare in un clic dal pulsante 'Scollega'.",
  },
  {
    id: "business",
    number: 4,
    title: "Guarda il business e crea i prodotti",
    goal: "Ricavi, ordini, catalogo e contatti sono letti dal tuo sito, non stimati.",
    icon: ShoppingBag,
    actions: [
      "I KPI in alto mostrano ricavi, ordini, scontrino medio, prodotti in catalogo e contatti.",
      "Il catalogo elenca i prodotti reali con prezzo e immagine; gli ordini mostrano importo e cliente.",
      "Per vendere un servizio nuovo: scrivi nome, prezzo e descrizione e premi 'Crea nel catalogo Wix'.",
      "Il prodotto compare subito nel catalogo del tuo sito e puo' essere acquistato.",
    ],
    where: { label: "Wix - Business", to: "/wix" },
  },
  {
    id: "automazioni",
    number: 5,
    title: "Metti in automatico cio' che fai ogni giorno",
    goal: "Le routine ripetitive girano da sole, anche quando tu non sei collegato.",
    icon: Workflow,
    actions: [
      "Gli agenti eseguono i compiti assegnati: monitoraggio, social, outreach, report.",
      "Le attivita' programmate partono all'ora stabilita e lasciano traccia nel registro.",
      "I connettori collegano i tuoi strumenti (email, CRM, social): ogni connessione e' reversibile.",
    ],
    where: { label: "Agenti", to: "/agents" },
  },
  {
    id: "pagamenti",
    number: 6,
    title: "Attiva il piano a pagamento",
    goal: "Quando il servizio funziona, si passa al piano: fatturazione, crediti e abbonamento.",
    icon: CircleDollarSign,
    actions: [
      "Verifica i crediti disponibili: ogni operazione AI scalca dal saldo reale.",
      "Attiva l'abbonamento del piano scelto: la fatturazione passa da Stripe.",
      "Da 'Pagamenti' vedi lo stato dei pagamenti e dei prelievi.",
    ],
    where: { label: "Pagamenti", to: "/payouts" },
  },
  {
    id: "store",
    number: 7,
    title: "Affianca il negozio: catalogo e offerte",
    goal: "Il catalogo e' la vetrina commerciale della piattaforma, sincronizzabile con il sito.",
    icon: Store,
    actions: [
      "In 'Prodotti' trovi l'offerta della piattaforma e il catalogo del tuo store.",
      "Le offerte e i listini sono gli stessi che vedi in Wix: un'unica fonte di verita'.",
    ],
    where: { label: "Prodotti", to: "/products" },
  },
];

export default function Guida() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Guida passo-passo"
        description="Sette passaggi, in ordine: dalla prima idea al business online. Ogni passo porta al punto esatto della piattaforma in cui lavorare."
        actions={
          <Button
            variant="primary"
            leftIcon={<Rocket className="h-4 w-4" aria-hidden="true" />}
            onClick={() => {
              window.location.href = "/idea";
            }}
          >
            Parti subito
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-text-primary">In breve</h2>
          <p className="text-sm text-text-secondary">
            La piattaforma lavora per te in sequenza: descrivi il risultato, approvi i deliverable,
            pubblichi il sito, colleghi il tuo store e monitori le vendite. Nessuna schermata e' un
            mock: ogni numero che vedi arriva da un'API reale.
          </p>
        </div>
      </Card>

      <ol className="flex flex-col gap-4">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.id}>
              <Card>
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                        Passo {step.number}
                      </p>
                      <h2 className="text-base font-semibold text-text-primary">{step.title}</h2>
                      <p className="text-sm text-text-secondary">{step.goal}</p>
                    </div>
                  </div>

                  <ol className="flex flex-col gap-2">
                    {step.actions.map((action, index) => (
                      <li key={action} className="flex gap-2 text-sm text-text-secondary">
                        <span className="text-text-muted">{index + 1}.</span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ol>

                  {step.note && (
                    <p className="rounded-lg bg-secondary/5 px-3 py-2 text-xs text-text-muted">
                      {step.note}
                    </p>
                  )}

                  <div>
                    <Button
                      variant="secondary"
                      rightIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                      onClick={() => {
                        window.location.href = step.where.to;
                      }}
                    >
                      {step.where.label}
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      <Card>
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-text-primary">Se qualcosa non funziona</h2>
          <ul className="flex flex-col gap-2 text-sm text-text-secondary">
            <li>
              - Il collegamento Wix mostra un errore: premi 'Scollega' e ricollega. Se resta, il
              problema e' l' autorizzazione del browser, non i tuoi dati.
            </li>
            <li>
              - Il business resta vuoto: il sito Wix deve avere almeno un prodotto o un ordine, e la
              piattaforma deve aver individuato il sito giusto (lo vedi nel riquadro 'Sito Wix').
            </li>
            <li>
              - Un deliverable e' sbagliato: rigenera quel singolo passo dal run invece di rifare
              tutto.
            </li>
            <li>
              - Ti serve una risposta puntuale: la pagina Aiuto raccoglie le domande frequenti, la
              chat centrale risponde subito.
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              leftIcon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
              onClick={() => {
                window.location.href = "/help";
              }}
            >
              Aiuto e FAQ
            </Button>
            <Link
              to="/dashboard"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-secondary/20 px-4 text-sm font-medium text-text-primary hover:bg-secondary/5"
            >
              Torna alla Home
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
