"use client";
import { useState } from "react";
import { TIMER_PRESETS, timerLabel } from "@/lib/auction";

const MIN = 10;
const MAX = 3600;

/**
 * Choose a timer length: a common length from the list, or "Other length…" to type minutes and seconds.
 * `value` null means "use the default" (only offered when `defaultLabel` is given).
 * With `applyButton`, a typed length is only used when Set is pressed (for the live console);
 * otherwise it's used as you type (for forms that are saved later).
 */
export function TimerPicker({ value, onChange, defaultLabel, disabled, applyButton, label = "Timer" }: {
  value: number | null;
  onChange: (seconds: number | null) => void;
  defaultLabel?: string;
  disabled?: boolean;
  applyButton?: boolean;
  label?: string;
}) {
  const isPreset = value == null ? !!defaultLabel : TIMER_PRESETS.includes(value);
  const [custom, setCustom] = useState(!isPreset);
  const [m, setM] = useState(String(Math.floor((value ?? 180) / 60)));
  const [s, setS] = useState(String((value ?? 180) % 60).padStart(2, "0"));
  const total = (Number(m) || 0) * 60 + (Number(s) || 0);
  const valid = total >= MIN && total <= MAX;

  function typed(nm: string, ns: string) {
    setM(nm);
    setS(ns);
    const t = (Number(nm) || 0) * 60 + (Number(ns) || 0);
    if (!applyButton && t >= MIN && t <= MAX) onChange(t);
  }

  const selected = custom ? "custom" : value == null ? "" : String(value);
  return (
    <span className="timer-pick">
      <select
        aria-label={label}
        value={selected}
        disabled={disabled}
        onChange={e => {
          const v = e.target.value;
          if (v === "custom") {
            setCustom(true);
            if (!applyButton && valid) onChange(total);
            return;
          }
          setCustom(false);
          onChange(v === "" ? null : Number(v));
        }}
      >
        {defaultLabel ? <option value="">{defaultLabel}</option> : null}
        {TIMER_PRESETS.map(p => (
          <option key={p} value={p}>{p < 60 ? `${p} seconds` : `${timerLabel(p)} min`}</option>
        ))}
        <option value="custom">Other length…</option>
      </select>
      {custom ? (
        <span className="mmss">
          <input aria-label="Minutes" inputMode="numeric" value={m} disabled={disabled} onChange={e => typed(e.target.value.replace(/\D/g, "").slice(0, 2), s)} />
          <span>min</span>
          <input aria-label="Seconds" inputMode="numeric" value={s} disabled={disabled} onChange={e => typed(m, e.target.value.replace(/\D/g, "").slice(0, 2))} />
          <span>sec</span>
          {applyButton ? (
            <button className="btn sm" type="button" disabled={disabled || !valid} onClick={() => onChange(total)}>Set {valid ? timerLabel(total) : ""}</button>
          ) : null}
          {!valid ? <span className="fine">10 seconds to 60 minutes</span> : null}
        </span>
      ) : null}
    </span>
  );
}
