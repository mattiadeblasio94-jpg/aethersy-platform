// builder/agents/specializations/copy.ts — Copywriter Agent

import { sandboxProvider } from "../sandbox.js";
import type { AgentExecutor, AgentContext, AgentResult, AgentArtifact } from "../types.js";

export const copyAgent: AgentExecutor = {
  async execute(context: AgentContext): Promise<AgentResult> {
    const { task, step, projectId, workspacePath } = context;
    const action = step.input.action as string;

    const artifacts: AgentArtifact[] = [];
    let costCredits = 0;

    switch (action) {
      case 'write_copy': {
        const pages = (step.input.pages as string[]) ?? ['landing', 'pricing', 'features'];

        for (const page of pages) {
          const copyFile = generateCopyForPage(page);
          await writeFile(workspacePath, `apps/web/app/pages/${page}.tsx`, copyFile, artifacts);
        }

        // Generate email sequences
        const emailSequences = generateEmailSequences();
        await writeFile(workspacePath, 'packages/shared/marketing/email-sequences.ts', emailSequences, artifacts);

        // Generate ad copies
        const adCopies = generateAdCopies();
        await writeFile(workspacePath, 'packages/shared/marketing/ad-copies.ts', adCopies, artifacts);

        costCredits = 10;
        break;
      }

      case 'write_landing_copy': {
        const pageName = step.input.page_name as string ?? 'landing';
        const copyFile = generateCopyForPage(pageName);
        await writeFile(workspacePath, `apps/web/app/${pageName}.tsx`, copyFile, artifacts);

        // Generate headline variants
        const headlines = generateHeadlines(pageName);
        await writeFile(workspacePath, `packages/shared/marketing/${pageName}-headlines.ts`, headlines, artifacts);

        costCredits = 5;
        break;
      }

      default:
        throw new Error(`Unknown copy action: ${action}`);
    }

    return {
      output: { copy: 'completed', pages: artifacts.map(a => a.name) },
      artifacts,
      costCredits,
      stepsCompleted: 1,
    };
  },
};

async function writeFile(workspacePath: string, filePath: string, content: string, artifacts: AgentArtifact[]): Promise<void> {
  await sandboxProvider.exec({
    command: 'bash',
    args: ['-c', `cat > ${filePath} << 'EOF'\n${content}\nEOF`],
    workdir: workspacePath,
  });
  artifacts.push({
    kind: 'document',
    name: filePath,
    content,
    metadata: { path: filePath },
  });
}

function generateCopyForPage(page: string): string {
  const copies: Record<string, { headline: string; subheadline: string; cta: string }> = {
    landing: {
      headline: 'Accelera la tua attività con l\'AI Operating Officer',
      subheadline: 'Aethersy trasforma la tua idea in un business automatizzato: brand, sito, contenuti, social e lead generation in un solo clic.',
      cta: 'Inizia ora',
    },
    pricing: {
      headline: 'Piani flessibili per ogni fase',
      subheadline: 'Scegli il piano giusto per le tue esigenze: da Startup a Enterprise. Pay-per-use con crediti ricaricabili.',
      cta: 'Scegli piano',
    },
    features: {
      headline: 'Potenza completa per la tua crescita',
      subheadline: 'Brand automatico, sito web in minuti, contenuti pronti, funnel pubblicitari ottimizzati e lead qualificati in arrivo.',
      cta: 'Attiva funzionalità',
    },
  };

  const copy = copies[page];
  if (!copy) return '';

  return `import Image from 'next/image';
import { Hero } from '@/components/ui/hero';
import { Button } from '@/components/ui/button';

export default function ${page[0].toUpperCase() + page.slice(1)}Page() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4">${copy.headline}</h1>
        <p className="text-lg text-gray-600 mb-6">${copy.subheadline}</p>
        <Button variant="primary" onClick="">
          ${copy.cta}
        </Button>
      </div>
    </section>
  );
}`;
}

function generateEmailSequences(): string {
  return `export interface EmailSequence {
  id: string;
  name: string;
  subject: string;
  body: string;
  send_after_days: number;
  open_rate_estimate: number;
  click_rate_estimate: number;
}

export const welcomeSequence: EmailSequence[] = [
  {
    id: 'welcome-1',
    subject: 'Benvenuto in Aethersy! 👋',
    body: 'Ciao! Benvenuto nella piattaforma che trasforma le tue idee in business automatizzati. In questa prima email ti mostriamo cosa puoi ottenere...',
    send_after_days: 0,
  },
  {
    id: 'welcome-2',
    subject: 'Ecco cosa possiamo fare per te',
    body: 'Dalla creazione automatica del brand al sito web pronto in pochi minuti. Scopri di più sulle nostre funzionalità...',
    send_after_days: 2,
  },
  {
    id: 'welcome-3',
    subject: 'Storie di successo',
    body: 'Guarda come altri imprenditori hanno cresciuto la loro attività con Aethersy. Iscriviti a una demo gratuita...',
    send_after_days: 5,
  },
];

export const reengagementSequence: EmailSequence[] = [
  {
    id: 'reengage-1',
    subject: 'Torna a crescere con noi',
    body: 'Abbiamo notato che non sei più attivo. Ecco nuove funzionalità che potrebbero interessarti...',
    send_after_days: 0,
  },
  {
    id: 'reengage-2',
    subject: 'Ultimi giorni per il piano Pro',
    body: 'Il tuo piano scade tra breve. Ecco cosa perderai se non rinnovi...',
    send_after_days: 3,
  },
];

export const dripSequence: EmailSequence[] = [
  {
    id: 'drip-1',
    subject: 'Consigli per la crescita',
    body: 'Ogni settimana ti inviamo un consiglio pratico per far crescere la tua attività con l\'AI...',
    send_after_days: 1,
  },
];
`;
}

function generateAdCopies(): string {
  return `export interface AdCopy {
  headline: string;
  description: string;
  cta: string;
}

export const googleAds: AdCopy[] = [
  {
    headline: 'Aethersy: Il tuo AI Operating Officer',
    description: 'Automatizza brand, sito e lead generation in un solo clic. Prova gratis.',
    cta: 'Inizia ora',
  },
  {
    headline: 'Siti web in minuti',
    description: 'Genera il tuo sito professionale con l\'AI. Nessun codice richiesto.',
    cta: 'Genera sito',
  },
];

export const facebookAds: AdCopy[] = [
  {
    headline: 'Finalmente un business automatizzato',
    description: 'Lascia che l\'AI si occupi di brand, sito e lead mentre ti concentri su ciò che ami.',
    cta: 'Inizia oggi',
  },
];

export const linkedinAds: AdCopy[] = [
  {
    headline: 'Aethersy per imprenditori',
    description: 'AI Operating Officer: da idea a business automatizzato. Nessuna competenza tecnica richiesta.',
    cta: 'Richiedi demo',
  },
];
`;
}

function generateHeadlines(page: string): string {
  const headlines: Record<string, string[]> = {
    landing: [
      'Aethersy: Il tuo AI Operating Officer',
      'Da idea a business automatizzato in un clic',
      'Brand, sito e lead con l\'AI',
    ],
    pricing: [
      'Piani flessibili per ogni fase',
      'Pay-per-use con crediti ricaricabili',
      'Scegli il piano giusto per te',
    ],
    features: [
      'Potenza completa per la tua crescita',
      'Tutto ciò di cui hai bisogno, in un clic',
      'La tua attività potenziata dall\'AI',
    ],
  };
  return headlines[page] || ['Default headline'];
}
