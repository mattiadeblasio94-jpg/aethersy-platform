// =============================================================================
// Competenze (IA pazi "Skills"). Dati reali dal BFF: edge platform.roster.
// Matrice competenze x agenti (chi sa fare cosa), copertura degli stadi del
// pipeline e carico di lavoro per specialista.
// =============================================================================

import { useMemo, useState } from "react";
import { Layers, Sparkles, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import { useRoster } from "@/lib/platform-queries";
import { agentTypeLabel, formatRelative } from "@/lib/utils";

export default function Skills() {
  const [tab, setTab] = useState("matrix");
  const roster = useRoster();
  const rows = roster.data ?? [];

  const skills = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of rows) {
      for (const skill of entry.skills) {
        const bucket = map.get(skill);
        if (bucket) bucket.push(entry.name);
        else map.set(skill, [entry.name]);
      }
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [rows]);

  const stages = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of rows) {
      for (const stage of entry.stages) {
        const bucket = map.get(stage);
        if (bucket) bucket.push(entry.name);
        else map.set(stage, [entry.name]);
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const stats = useMemo(
    () => ({
      agents: rows.length,
      skills: skills.length,
      stages: stages.length,
      overloaded: rows.filter((row) => row.running > 2).length,
    }),
    [rows, skills.length, stages.length],
  );

  const tabs = [
    { value: "matrix", label: "Matrice competenze" },
    { value: "stages", label: "Copertura stadi", badge: String(stats.stages) },
    { value: "roster", label: "Specialisti", badge: String(stats.agents) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Competenze"
        description="Mappa delle competenze degli agenti: chi copre cosa e su quali stadi del pipeline."
      />

      <section aria-label="Statistiche competenze" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Specialisti"
          value={String(stats.agents)}
          icon={<Users className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="Competenze"
          value={String(stats.skills)}
          icon={<Sparkles className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="Stadi coperti"
          value={String(stats.stages)}
          icon={<Layers className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard label="Carico elevato" value={String(stats.overloaded)} hint="agenti con oltre 2 task" />
      </section>

      <Card className="flex flex-col gap-4">
        <Tabs items={tabs} value={tab} onValueChange={setTab} />
      </Card>

      {roster.isLoading ? (
        <Card bodyClassName="p-5">
          <Skeleton lines={6} />
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
          title="Nessun agente registrato"
          description="La mappa delle competenze si popola con gli agenti del roster."
        />
      ) : tab === "matrix" ? (
        <Card bodyClassName="p-0">
          <ul className="divide-y divide-secondary/10">
            {skills.map(([skill, agents]) => (
              <li key={skill} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="text-sm font-medium text-text-primary">{skill}</span>
                <span className="text-xs text-text-muted">
                  {agents.length} {agents.length === 1 ? "specialista" : "specialisti"}
                </span>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {agents.map((name) => (
                    <Badge key={name} variant="default">
                      {name}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : tab === "stages" ? (
        <Card bodyClassName="p-0">
          <ul className="divide-y divide-secondary/10">
            {stages.map(([stage, agents]) => (
              <li key={stage} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="text-sm font-medium text-text-primary">{stage}</span>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {agents.map((name) => (
                    <Badge key={name} variant="info">
                      {name}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {rows.map((entry) => (
            <Card key={entry.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-text-primary">{entry.name}</h2>
                  <p className="text-xs text-text-muted">
                    {agentTypeLabel(entry.role)} · {entry.department}
                  </p>
                </div>
                <Badge variant={entry.running > 0 ? "info" : "default"}>
                  {entry.running} attivi
                </Badge>
              </div>
              <p className="text-sm text-text-secondary">{entry.tagline}</p>
              <div className="flex flex-wrap gap-1.5">
                {entry.skills.map((skill) => (
                  <Badge key={skill} variant="accent">
                    {skill}
                  </Badge>
                ))}
              </div>
              <dl className="grid grid-cols-4 gap-2 border-t border-secondary/10 pt-3 text-center text-xs">
                <div>
                  <dt className="text-text-muted">Task</dt>
                  <dd className="text-text-primary">{entry.tasks}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">In corso</dt>
                  <dd className="text-text-primary">{entry.running}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Completati</dt>
                  <dd className="text-text-primary">{entry.done}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Falliti</dt>
                  <dd className="text-text-primary">{entry.failed}</dd>
                </div>
              </dl>
              <p className="text-xs text-text-muted">
                Ultimo task: {entry.lastTaskAt ? formatRelative(entry.lastTaskAt) : "—"}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
