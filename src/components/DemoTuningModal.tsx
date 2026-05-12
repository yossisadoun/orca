import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  DEFAULT_DEMO_TUNING,
  IN_PROGRESS_SECONDS_OPTIONS,
  normalizeDemoTuning,
  saveDemoTuning,
  type DemoTuning,
} from "../utils/demoTuning";
import styles from "./DemoTuningModal.module.css";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {children}
    </div>
  );
}

export function DemoTuningModal({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: DemoTuning;
  onClose: () => void;
  onSave: (next: DemoTuning) => void;
}) {
  const titleId = useId();
  const failId = useId();
  const [t, setT] = useState<DemoTuning>(initial);

  useEffect(() => {
    if (!open) return;
    setT(initial);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const apply = () => {
    const next = normalizeDemoTuning(t);
    saveDemoTuning(next);
    onSave(next);
    onClose();
  };

  const reset = () => {
    setT({ ...DEFAULT_DEMO_TUNING });
  };

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-demo-tuning-modal
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.headerIcon}>
              <SlidersHorizontal size={20} strokeWidth={1.75} aria-hidden />
            </div>
            <div>
              <p className={styles.kicker}>Demo</p>
              <h2 id={titleId} className={styles.title}>
                Tune automation
              </h2>
              <p className={styles.subtitle}>
                Control how often bots get stuck in In progress and how long each bot takes to finish.
              </p>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </header>

        <div className={styles.body}>
          <Field
            id={failId}
            label="Chance a bot gets stuck (In progress)"
            hint={
              "0–1 probability checked each tick after a little progress (12%). " +
              "When it fires, that bot stops with the red stuck state."
            }
          >
            <input
              id={failId}
              type="number"
              className={styles.input}
              min={0}
              max={1}
              step={0.05}
              value={t.inProgressBotFailProbability}
              onChange={(e) => {
                const v = Number(e.target.value);
                setT((p) => ({
                  ...p,
                  inProgressBotFailProbability: Number.isFinite(v) ? v : p.inProgressBotFailProbability,
                }));
              }}
            />
          </Field>
          <Field
            id="tune-seconds"
            label="Time for one bot to finish (seconds)"
            hint="Each agent on a card advances from 0% to 100% in about this long."
          >
            <div className={styles.segmented} role="radiogroup" aria-label="Seconds per bot">
              {IN_PROGRESS_SECONDS_OPTIONS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className={`${styles.segBtn} ${t.inProgressSecondsPerBot === sec ? styles.segBtnActive : ""}`}
                  role="radio"
                  aria-checked={t.inProgressSecondsPerBot === sec}
                  onClick={() => setT((p) => ({ ...p, inProgressSecondsPerBot: sec }))}
                >
                  {sec}s
                </button>
              ))}
            </div>
          </Field>
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={reset}>
            Reset defaults
          </button>
          <div className={styles.footerRight}>
            <button type="button" className={styles.secondary} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={styles.primary} onClick={apply}>
              Save
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
