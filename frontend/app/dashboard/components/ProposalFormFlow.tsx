"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ProposalStep = { title: string; description: string };

export function ProposalSteps({ steps, current, onChange }: {
  steps: ProposalStep[];
  current: number;
  onChange: (step: number) => void;
}) {
  return (
    <nav className="proposal-stepper" data-step-count={steps.length} aria-label="Etapas da proposta">
      <ol style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => (
          <li key={step.title}>
            <button type="button" aria-current={index === current ? "step" : undefined} onClick={() => onChange(index)}>
              <span className="proposal-step-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="min-w-0"><strong>{step.title}</strong><small>{step.description}</small></span>
            </button>
          </li>
        ))}
      </ol>
      <div className="proposal-step-heading" id="proposal-step-heading" tabIndex={-1}>
        <p>Etapa {current + 1} de {steps.length}</p>
        <h2>{steps[current].title}</h2>
        <span>{steps[current].description}</span>
      </div>
    </nav>
  );
}

export function focusProposalStep() {
  window.requestAnimationFrame(() => {
    const heading = document.getElementById("proposal-step-heading");
    heading?.focus({ preventScroll: true });
    document.querySelector(".dashboard-main")?.scrollTo({ top: 0, behavior: "smooth" });
  });
}

export function ProposalFinancialDock({ lines, total, payment, current, steps, onBack, onNext, onSave, saving = false, disabled = false, saveLabel = "Salvar proposta", formId, currency = "BRL" }: {
  lines: { label: string; value: number; negative?: boolean }[];
  total: number;
  payment?: string;
  current: number;
  steps: number;
  onBack: () => void;
  onNext: () => void;
  onSave?: () => void;
  saving?: boolean;
  disabled?: boolean;
  saveLabel?: string;
  formId?: string;
  currency?: string;
}) {
  const [host, setHost] = useState<Element | null>(null);
  const [bounds, setBounds] = useState({ left: 0, right: 0 });
  useEffect(() => {
    const main = document.querySelector(".dashboard-main");
    if (!main) return;
    setHost(main);
    const measure = () => {
      const rect = main.getBoundingClientRect();
      setBounds({ left: rect.left, right: window.innerWidth - rect.right });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: /^[A-Z]{3}$/.test(currency) ? currency : "BRL" });
  if (!host) return null;
  return createPortal(
    <section className="proposal-finance-dock" style={bounds} aria-label="Resumo financeiro da proposta">
      <div className="proposal-finance-content">
        <details className="proposal-finance-details">
          <summary>Resumo financeiro <span>Ver composição</span></summary>
          <dl>{lines.map((line) => <div key={line.label}><dt>{line.label}</dt><dd>{line.negative ? "− " : ""}{money(line.value)}</dd></div>)}</dl>
        </details>
        <dl className="proposal-finance-inline">{lines.map((line) => <div key={line.label}><dt>{line.label}</dt><dd>{line.negative ? "− " : ""}{money(line.value)}</dd></div>)}</dl>
        <div className="proposal-finance-total"><span>Total da proposta</span><output aria-label="Total da proposta">{money(total)}</output>{payment ? <small>{payment}</small> : null}</div>
        <div className="proposal-flow-actions">
          <button type="button" disabled={current === 0 || saving} onClick={onBack} className="proposal-flow-back">Voltar</button>
          {current < steps - 1 ? <button key="next" type="button" disabled={saving} onClick={onNext} className="proposal-flow-primary">Continuar <span aria-hidden>→</span></button> : <button key="save" type="button" onClick={() => { if (formId) (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit(); else onSave?.(); }} disabled={disabled || saving} className="proposal-flow-primary">{saving ? "Salvando..." : saveLabel}</button>}
        </div>
      </div>
    </section>, host,
  );
}

export function ProposalFormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="proposal-form-section"><header><h2>{title}</h2>{description ? <p>{description}</p> : null}</header>{children}</section>;
}
