"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { FINAL_CTA, PLANS } from "@/content/site";

type Field = "nome" | "email" | "whatsapp" | "lgpd";
type Values = { nome: string; email: string; whatsapp: string; lgpd: boolean };
type Errors = Partial<Record<Field, string>>;

const INTENTS: Record<string, string> = {
  ...Object.fromEntries(PLANS.plans.map((p) => [p.id, p.id === "telescopio" ? "Falar sobre o Telescópio" : `Assinar ${p.name}`])),
  advogado: "Falar com um advogado especialista",
};

/** (11) 91234-5678 enquanto digita. */
function maskPhone(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function validate(v: Values): Errors {
  const e: Errors = {};
  const nome = v.nome.trim();
  if (!nome) e.nome = "Informe seu nome.";
  else if (nome.length < 2 || !/^[\p{L}][\p{L}' .-]*$/u.test(nome)) e.nome = "Use só letras no nome.";
  const email = v.email.trim();
  if (!email) e.email = "Informe seu e-mail.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) e.email = "Confira o e-mail (ex.: voce@exemplo.com).";
  const digits = v.whatsapp.replace(/\D/g, "");
  if (!digits) e.whatsapp = "Informe seu WhatsApp com DDD.";
  else if (!/^[1-9][1-9]9\d{8}$/.test(digits)) e.whatsapp = "Use um celular com DDD, ex.: (11) 91234-5678.";
  if (!v.lgpd) e.lgpd = "Para continuar, aceite a política de privacidade.";
  return e;
}

/**
 * Formulário curto (nome, e-mail, WhatsApp) com validação no front e consentimento LGPD.
 * NÃO envia dados: ao validar, mostra a confirmação "Mira ajustada" (demonstração).
 * Botões de plano/advogado com data-intent marcam o assunto do contato.
 */
export function LeadForm() {
  const id = useId();
  const [values, setValues] = useState<Values>({ nome: "", email: "", whatsapp: "", lgpd: false });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [sent, setSent] = useState(false);
  const [intent, setIntent] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  // Clique em "Assinar Luneta", "Quero falar com um advogado" etc. → marca o assunto do contato.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-intent]");
      if (el?.dataset.intent && INTENTS[el.dataset.intent]) setIntent(el.dataset.intent);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (sent) doneRef.current?.focus();
  }, [sent]);

  const errors = validate(values);
  const show = (f: Field) => (submitted || touched[f]) && errors[f];

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const first = (["nome", "email", "whatsapp", "lgpd"] as Field[]).find((f) => errors[f]);
    if (first) {
      formRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
      return;
    }
    // Sem backend: aqui entraria o envio (ex.: fetch para a API/CRM). Nada é enviado.
    setSent(true);
  };

  const input =
    "mt-1.5 w-full rounded-xl border bg-noite px-4 py-3.5 text-base text-luar placeholder:text-nevoa/70 transition-colors duration-150 focus:border-latao focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-latao-texto";
  const label = "block text-xs font-medium tracking-[0.06em] text-nevoa uppercase";

  const field = (name: "nome" | "email" | "whatsapp", text: string, props: React.InputHTMLAttributes<HTMLInputElement>) => {
    const err = show(name);
    return (
      <div>
        <label htmlFor={`${id}-${name}`} className={label}>
          {text}
        </label>
        <input
          id={`${id}-${name}`}
          name={name}
          value={values[name]}
          onChange={(e) => setValues((v) => ({ ...v, [name]: name === "whatsapp" ? maskPhone(e.target.value) : e.target.value }))}
          onBlur={() => setTouched((t) => ({ ...t, [name]: true }))}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-${name}-err` : undefined}
          required
          className={`${input} ${err ? "border-grave" : "border-nevoa/35"}`}
          {...props}
        />
        {err && (
          <p id={`${id}-${name}-err`} className="mt-1.5 flex items-center gap-1.5 text-[13px] text-grave-texto">
            <span aria-hidden="true">✕</span>
            {err}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-3xl border border-nevoa/20 bg-tinta p-6 [perspective:1200px] sm:p-9">
      {sent ? (
        <div ref={doneRef} tabIndex={-1} role="status" className="flex flex-col items-start gap-3 outline-none motion-safe:animate-[flip-in_.6s_var(--ease-luneta)]">
          <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full border-2 border-pos text-pos">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 11.5l4.5 4.5 8.5-9.5" />
            </svg>
          </span>
          <p className="font-display text-[22px] leading-tight font-bold">{FINAL_CTA.successTitle}</p>
          <p className="text-[15px] leading-relaxed text-nevoa">{FINAL_CTA.successText}</p>
          <button
            type="button"
            className="mt-2 text-sm font-semibold text-latao-texto underline underline-offset-4"
            onClick={() => {
              setSent(false);
              setSubmitted(false);
              setTouched({});
              setValues({ nome: "", email: "", whatsapp: "", lgpd: false });
            }}
          >
            Preencher de novo
          </button>
        </div>
      ) : (
        <form ref={formRef} noValidate onSubmit={onSubmit} aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
          <h3 id={`${id}-title`} className="font-display text-xl leading-tight font-bold tracking-[-0.01em]">
            {FINAL_CTA.formTitle}
          </h3>
          <p className="-mt-1 text-sm leading-relaxed text-nevoa">{FINAL_CTA.formText}</p>
          {intent && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-nevoa">Assunto:</span>
              <span className="rounded-full border border-latao/60 bg-latao/10 px-3 py-1 font-medium text-luar">{INTENTS[intent]}</span>
              <button type="button" onClick={() => setIntent(null)} className="text-xs text-nevoa underline underline-offset-2 hover:text-luar">
                remover
              </button>
            </p>
          )}
          {field("nome", "Nome", { type: "text", autoComplete: "name", placeholder: "Seu nome" })}
          {field("email", "E-mail", { type: "email", autoComplete: "email", inputMode: "email", placeholder: "voce@exemplo.com" })}
          {field("whatsapp", "WhatsApp", { type: "tel", autoComplete: "tel-national", inputMode: "tel", placeholder: "(11) 91234-5678" })}
          <div>
            <label className="flex items-start gap-3 text-[13px] leading-relaxed text-nevoa">
              <input
                type="checkbox"
                name="lgpd"
                checked={values.lgpd}
                onChange={(e) => {
                  const lgpd = e.target.checked;
                  setValues((v) => ({ ...v, lgpd }));
                  setTouched((t) => ({ ...t, lgpd: true }));
                }}
                aria-invalid={show("lgpd") ? true : undefined}
                aria-describedby={show("lgpd") ? `${id}-lgpd-err` : undefined}
                className="mt-0.5 size-5 shrink-0 accent-[#C9A24D]"
              />
              <span>
                Concordo em receber contatos da Luneta de Leilões e li a{" "}
                <a href="#politica-de-privacidade" className="text-latao-texto underline underline-offset-2">
                  política de privacidade
                </a>{" "}
                (LGPD). Posso cancelar quando quiser.
              </span>
            </label>
            {show("lgpd") && (
              <p id={`${id}-lgpd-err`} className="mt-1.5 flex items-center gap-1.5 text-[13px] text-grave-texto">
                <span aria-hidden="true">✕</span>
                {errors.lgpd}
              </p>
            )}
          </div>
          <button type="submit" className="btn-primary mt-1 w-full">
            {FINAL_CTA.submit}
          </button>
          <p className="text-xs text-nevoa">Demonstração: o formulário valida os campos, mas ainda não envia dados.</p>
        </form>
      )}
    </div>
  );
}
