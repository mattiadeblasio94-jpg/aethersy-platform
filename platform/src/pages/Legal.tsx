import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/common/PageElements";

// Pagine legali pubbliche (Privacy Policy e Termini di Servizio).
//
// Servono a due scopi concreti:
//   1. la verifica dell'app Google (la Console richiede una privacy policy
//      pubblica che descriva i dati raccolti e la loro finalita');
//   2. trasparenza verso gli utenti della piattaforma.
//
// Il testo e' volutamente specifico: elenca i dati realmente trattati dai
// connettori (Gmail, Drive, Calendar, Docs, Sheets, YouTube, Ads) e il
// passaggio verso i provider AI usati per produrre i deliverable.

const CONTATTO = "mattiadeblasio94@gmail.com";
const DOMINIO = "aethersy.online";

function LegalLayout(props: {
  title: string;
  updated: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader title={props.title} description={`Ultimo aggiornamento: ${props.updated}`} />
      <Card>
        <div className="flex flex-col gap-4 text-sm leading-relaxed text-text-secondary">
          <p className="text-text-primary">{props.intro}</p>
          {props.children}
          <div className="mt-2 border-t border-secondary/20 pt-4 text-xs text-text-muted">
            <Link to="/login" className="underline-offset-2 hover:underline">
              Torna al login
            </Link>
            <span className="mx-2">·</span>
            <Link to="/terms" className="underline-offset-2 hover:underline">
              Termini di servizio
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated="8 novembre 2026"
      intro={`Aethersy e' una piattaforma di automazione e produttivita' offerta da Aethersy (contatto: ${CONTATTO}). Questa informativa descrive i dati personali trattati quando usi la piattaforma, in particolare quando colleghi un account esterno (Google, GitHub, Slack, Notion e altri).`}
    >
      <section>
        <h2 className="font-display text-base font-semibold text-text-primary">1. Titolare del trattamento</h2>
        <p>
          Titolare: Aethersy &mdash; contatto privacy:{" "}
          <a href={`mailto:${CONTATTO}`} className="underline-offset-2 hover:underline">
            {CONTATTO}
          </a>
          . La piattaforma e' ospitata su server in Italia (VPS Aruba Cloud, provider Aruba.it).
        </p>
      </section>

      <section>
        <h2 className="font-display text-base font-semibold text-text-primary">2. Dati trattati</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Dati account e sessione</strong>: email, identificativo del tenant, stato della sessione
            (cookie httpOnly firmato).
          </li>
          <li>
            <strong>Dati del profilo del provider collegato</strong>: per Google, nome, email e identificativo
            dell'account che autorizzi; per GitHub, profilo pubblico e ambiti del repository che autorizzi.
          </li>
          <li>
            <strong>Contenuti dei servizi che autorizzi</strong>: i permessi che concedi (per esempio Gmail, Google
            Drive, Calendar, Docs, Sheets, YouTube, Google Ads) permettono di leggere e scrivere i contenuti di quei
            servizi per creare i deliverable che richiedi. I permessi sono richiesti uno per uno e puoi revocarli in
            qualsiasi momento dalla pagina Connettori.
          </li>
          <li>
            <strong>Credenziali</strong>: token OAuth e chiavi API sono cifrati a riposo (AES-256-GCM) e restano
            sul server; non sono mai mostrati in chiaro.
          </li>
          <li>
            <strong>Contenuti prodotti</strong>: brief, deliverable, documenti, PDF e immagini generati per te, con
            i relativi metadati (run, crediti, approvazioni).
          </li>
          <li>
            <strong>Dati di fatturazione</strong>: stato dei crediti, pagamenti e fatture, per i quali usiamo Stripe
            come gestore dei pagamenti.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-base font-semibold text-text-primary">3. Finalita' e base giuridica</h2>
        <p>
          Trattiamo i dati per erogare il servizio richiesto: eseguire la pipeline che hai lanciato, produrre e
          conservare i deliverable, collegare i tuoi account ai provider che hai autorizzato, gestire crediti e
          pagamenti e fornire assistenza. La base giuridica e' l'esecuzione del contratto (art. 6.1.b GDPR) per il
          servizio e il consenso (art. 6.1.a GDPR) per i permessi OAuth che concedi ai provider.
        </p>
      </section>

      <section>
        <h2 className="font-display text-base font-semibold text-text-primary">
          4. Trattamento con i provider AI
        </h2>
        <p>
          Per generare testi, immagini e documenti, il contenuto del brief e i materiali che alleghi vengono inviati
          ai provider di intelligenza artificiale indicati nel pannello "AI Router" della piattaforma (ad esempio
          OpenRouter e, se attivo, Venice.ai). Tali provider possono trattare i dati per conto proprio: per questo
          motivo ti sconsigliamo di inserire segreti aziendali nei brief. Il passaggio di dati e' limitato a quanto
          serve per generare il deliverable richiesto.
        </p>
      </section>

      <section>
        <h2 className="font-display text-base font-semibold text-text-primary">5. Conservazione</h2>
        <p>
          Conserviamo i token e le credenziali finche' il collegamento resta attivo; revokando il connettore o
          eliminando il workspace i dati vengono cancellati. I deliverable e i metadati di esecuzione restano nel
          tuo tenant per il periodo del tuo abbonamento e per i tempi di conservazione fiscali previsti dalla legge
          applicable. I log tecnici vengono ruotati periodicamente.
        </p>
      </section>

      <section>
        <h2 className="font-display text-base font-semibold text-text-primary">6. Sicurezza</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>Cifratura TLS dei dati in transito e AES-256-GCM dei segreti a riposo.</li>
          <li>Sessioni e cookie di stato httpOnly, firmati e con scadenza breve.</li>
          <li>Accesso ai dati limitato al tenant di appartenenza e registrato nei log.</li>
          <li>Server in Italia; i provider AI citati al punto 4 possono trattare dati fuori dall'Unione Europea.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-display text-base font-semibold text-text-primary">7. I tuoi diritti</h2>
        <p>
          Puoi chiedere in ogni momento accesso, rettifica, cancellazione, limitazione e portabilita' dei tuoi dati,
          e revocare il consenso ai permessi OAuth direttamente dalla pagina Connettori. Scrivi a{" "}
          <a href={`mailto:${CONTATTO}`} className="underline-offset-2 hover:underline">
            {CONTATTO}
          </a>{" "}
          per le richieste relative ai dati del tuo account. Hai inoltre diritto di proporre reclamo al Garante per la
          protezione dei dati personali.
        </p>
      </section>

      <section>
        <h2 className="font-display text-base font-semibold text-text-primary">8. Modifiche</h2>
        <p>
          Questa informativa puo' essere aggiornata; la data in alto indica l'ultima revisione. Le modifiche
          sostanziali vengono comunicate via email agli utenti registrati. Sito pubblico: {DOMINIO}.
        </p>
      </section>
    </LegalLayout>
  );
}

export function Terms() {
  return (
    <LegalLayout
      title="Termini di servizio"
      updated="8 novembre 2026"
      intro="Questi termini regolano l'uso della piattaforma Aethersy. Usando il servizio accetti quanto segue."
    >
      <section>
        <h2 className="font-display text-base font-semibold text-text-primary">1. Servizio</h2>
        <p>
          Aethersy e' una piattaforma self-hosted di automazione e produttivita' che orchestra agenti, produce
          deliverable e collega account di terze parti. Il servizio e' erogato sulla base dei crediti acquistati o
          messi a disposizione dal committente.
        </p>
      </section>
      <section>
        <h2 className="font-display text-base font-semibold text-text-primary">2. Account</h2>
        <p>
          Sei responsabile delle credenziali del tuo account, dei contenuti che carichi e dei permessi che concedi ai
          provider collegati. Ogni utente puo' collegare solo gli account per cui e' autorizzato.
        </p>
      </section>
      <section>
        <h2 className="font-display text-base font-semibold text-text-primary">3. Uso consentito</h2>
        <p>
          Non puoi usare il servizio per violare le leggi, i diritti di terzi o i termini dei provider collegati,
          ne' per inviare comunicazioni spam o contenuti illeciti. I deliverable generati sono una base di lavoro:
          la revisione e la responsabilita' finale dei contenuti pubblicati restano a chi li pubblica.
        </p>
      </section>
      <section>
        <h2 className="font-display text-base font-semibold text-text-primary">4. Disponibilita' e limitazione</h2>
        <p>
          Facciamo il possibile per la continuita' del servizio, ma non garantiamo un uptime continuativo. La
          responsabilita' e' limitata al valore dei crediti utilizzati per la richiesta che ha generato l'errore.
        </p>
      </section>
      <section>
        <h2 className="font-display text-base font-semibold text-text-primary">5. Contatti</h2>
        <p>
          Per qualsiasi questione:{" "}
          <a href={`mailto:${CONTATTO}`} className="underline-offset-2 hover:underline">
            {CONTATTO}
          </a>
          .
        </p>
      </section>
    </LegalLayout>
  );
}
