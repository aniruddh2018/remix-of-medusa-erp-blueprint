import { forwardRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { ComponentPropsWithoutRef } from "react";

type InputProps = ComponentPropsWithoutRef<typeof Input>;

interface DecimalInputProps extends Omit<InputProps, "value" | "onChange" | "type"> {
  value: number | string | null | undefined;
  onChange: (value: number) => void;
  /** Optional max — if exceeded, value is clamped before notifying */
  maxValue?: number;
  /** Called when user enters a value > maxValue (raw) */
  onMaxExceeded?: (max: number) => void;
}

/**
 * Numeric input that preserves in-progress decimal typing
 * (e.g. "12." or "12.0") without forcing a re-render that drops the dot.
 * Commits a parsed number to parent via onChange.
 */
export const DecimalInput = forwardRef<HTMLInputElement, DecimalInputProps>(
  ({ value, onChange, maxValue, onMaxExceeded, ...rest }, ref) => {
    const [draft, setDraft] = useState<string>(
      value === null || value === undefined || value === "" ? "" : String(value)
    );

    // Sync external value updates (e.g. programmatic resets) without
    // clobbering an in-progress decimal entry like "12."
    useEffect(() => {
      const incoming =
        value === null || value === undefined || value === "" ? "" : String(value);
      const draftNum = parseFloat(draft);
      const incomingNum = parseFloat(incoming);
      const sameNumeric =
        !Number.isNaN(draftNum) &&
        !Number.isNaN(incomingNum) &&
        draftNum === incomingNum;
      if (!sameNumeric && draft !== incoming) {
        setDraft(incoming);
      }
    }, [value]);

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => {
          const raw = e.target.value;
          // Allow empty, digits, single decimal, optional leading minus disabled.
          if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
          setDraft(raw);
          if (raw === "" || raw === ".") {
            onChange(0);
            return;
          }
          const parsed = parseFloat(raw);
          if (Number.isNaN(parsed)) return;
          if (maxValue !== undefined && parsed > maxValue) {
            onMaxExceeded?.(maxValue);
            setDraft(String(maxValue));
            onChange(maxValue);
            return;
          }
          onChange(parsed);
        }}
        onBlur={(e) => {
          if (draft === "" || draft === ".") setDraft("");
          rest.onBlur?.(e);
        }}
        {...rest}
      />
    );
  }
);

DecimalInput.displayName = "DecimalInput";
