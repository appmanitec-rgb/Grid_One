import {
  DataPill,
  MetricCard,
  PageHero,
  SectionCard,
} from "./DashboardPageKit";

type ModuleBlueprintPageProps = {
  title: string;
  subtitle: string;
  objective: string;
  bullets: string[];
  integrations: string[];
};

export default function ModuleBlueprintPage({
  title,
  subtitle,
  objective,
  bullets,
  integrations,
}: ModuleBlueprintPageProps) {
  return (
    <div className="space-y-6 pb-10">
      <PageHero
        eyebrow="Módulo em estruturação"
        title={title}
        description={subtitle}
        stats={[
          {
            label: "Frentes previstas",
            value: String(bullets.length),
            helper: "blocos planejados para a tela",
            tone: "blue",
          },
          {
            label: "Integracoes",
            value: String(integrations.length),
            helper: "pontos que precisam conversar",
            tone: "amber",
          },
        ]}
      />

      <SectionCard
        eyebrow="Direcao"
        title="Objetivo do modulo"
        description="Antes de adicionar campos e tabelas, a tela precisa deixar claro o que resolve e o que deve ficar em evidência."
      >
        <p className="max-w-3xl text-sm leading-7 text-slate-700">{objective}</p>
      </SectionCard>

      <SectionCard
        eyebrow="Arquitetura"
        title="Estrutura prevista"
        description="O módulo deve nascer já com hierarquia visual, blocos separados por função e leitura rápida."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {bullets.map((item) => (
            <MetricCard key={item} label="Bloco" value={item} tone="slate" />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Dependencias"
        title="Integracoes obrigatorias"
        description="Esses pontos precisam existir desde o começo para a tela não virar uma ilha dentro do sistema."
      >
        <div className="flex flex-wrap gap-2">
          {integrations.map((rule) => (
            <DataPill key={rule} tone="blue">
              {rule}
            </DataPill>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
