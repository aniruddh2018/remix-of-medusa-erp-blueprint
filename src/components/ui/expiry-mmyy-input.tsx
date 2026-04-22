import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ExpiryMMYYHandle {
  focus: () => void;
}

interface Props {
  /** Date string YYYY-MM-DD or YYYY-MM. Empty string when unset. */
  value: string;
  /** Returns YYYY-MM-01 when both MM and YY are valid; "" when cleared. */
  onChange: (isoDate: string) => void;
  /** Forwarded to inner inputs (Enter navigation works because each input fires onKeyDown). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  className?: string;
  /** Make this input participate in the Enter-navigation system. */
  navName?: string;
  navOrder?: number;
}

/**
 * Two compact inputs (MM / YY) with auto-tab.
 * - Type 12 → focus auto-jumps to YY
 * - Type 27 → fires onChange("2027-12-01")
 * - Backspace on empty YY → returns to MM
 * - Accepts paste like "12/27", "1227", "12-27", "12/2027"
 * - Up/Down arrows bump month or year
 */
export const ExpiryMMYYInput = forwardRef<ExpiryMMYYHandle, Props>(
  ({ value, onChange, onKeyDown, disabled, className, navName, navOrder }, ref) => {
    const mmRef = useRef<HTMLInputElement>(null);
    const yyRef = useRef<HTMLInputElement>(null);

    // Parse incoming value into MM and YY parts
    const parse = (v: string): { mm: string; yy: string } => {
      if (!v) return { mm: "", yy: "" };
      const m = v.match(/^(\d{4})-(\d{2})/);
      if (m) return { mm: m[2], yy: m[1].slice(2) };
      return { mm: "", yy: "" };
    };

    const [mm, setMm] = useState(parse(value).mm);
    const [yy, setYy] = useState(parse(value).yy);

    // Sync from external changes (clearing, programmatic set)
    useEffect(() => {
      const p = parse(value);
      setMm(p.mm);
      setYy(p.yy);
    }, [value]);

    useImperativeHandle(ref, () => ({ focus: () => mmRef.current?.focus() }));

    const emit = (m: string, y: string) => {
      if (m.length === 2 && y.length === 2) {
        const monthNum = parseInt(m, 10);
        if (monthNum < 1 || monthNum > 12) return;
        onChange(`20${y}-${m.padStart(2, "0")}-01`);
      } else if (!m && !y) {
        onChange("");
      }
    };

    const handleMmChange = (raw: string) => {
      // Allow paste of full date / mm-yy combos
      const digits = raw.replace(/\D/g, "");
      if (digits.length >= 4) {
        // Treat as MMYY or MMYYYY paste
        const newMm = digits.slice(0, 2);
        const newYy = digits.length >= 6 ? digits.slice(4, 6) : digits.slice(2, 4);
        setMm(newMm);
        setYy(newYy);
        emit(newMm, newYy);
        yyRef.current?.focus();
        yyRef.current?.select();
        return;
      }
      const next = digits.slice(0, 2);
      setMm(next);
      // Auto-advance when 2 digits typed and value valid (>=01, <=12)
      if (next.length === 2) {
        const n = parseInt(next, 10);
        if (n >= 1 && n <= 12) {
          emit(next, yy);
          yyRef.current?.focus();
          yyRef.current?.select();
        }
      } else {
        emit(next, yy);
      }
    };

    const handleYyChange = (raw: string) => {
      const digits = raw.replace(/\D/g, "");
      // If user pastes 4-digit year, take last 2
      const next = digits.length >= 4 ? digits.slice(-2) : digits.slice(0, 2);
      setYy(next);
      emit(mm, next);
    };

    const bumpMonth = (delta: number) => {
      const cur = parseInt(mm || "0", 10);
      const next = ((cur + delta + 12 - 1) % 12) + 1;
      const s = String(next).padStart(2, "0");
      setMm(s);
      emit(s, yy);
    };

    const bumpYear = (delta: number) => {
      const cur = yy ? parseInt(yy, 10) : new Date().getFullYear() % 100;
      const next = Math.max(0, Math.min(99, cur + delta));
      const s = String(next).padStart(2, "0");
      setYy(s);
      emit(mm, s);
    };

    return (
      <div
        className={cn("flex items-center gap-1", className)}
        data-enter-nav-include={navName ? "true" : undefined}
      >
        <Input
          ref={mmRef}
          value={mm}
          inputMode="numeric"
          maxLength={4}
          placeholder="MM"
          disabled={disabled}
          aria-label="Expiry month"
          data-enter-nav-name={navName ? `${navName}-mm` : undefined}
          data-enter-nav-order={navOrder}
          onChange={(e) => handleMmChange(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") { e.preventDefault(); bumpMonth(1); return; }
            if (e.key === "ArrowDown") { e.preventDefault(); bumpMonth(-1); return; }
            if (e.key === "/" || e.key === "-" || e.key === " ") {
              e.preventDefault();
              if (mm.length > 0) yyRef.current?.focus();
              return;
            }
            onKeyDown?.(e);
          }}
          className="h-9 w-12 text-center text-sm font-mono px-1 tabular-nums"
        />
        <span className="text-muted-foreground text-xs select-none">/</span>
        <Input
          ref={yyRef}
          value={yy}
          inputMode="numeric"
          maxLength={4}
          placeholder="YY"
          disabled={disabled}
          aria-label="Expiry year"
          data-enter-nav-name={navName ? `${navName}-yy` : undefined}
          data-enter-nav-order={navOrder !== undefined ? navOrder + 0.5 : undefined}
          onChange={(e) => handleYyChange(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") { e.preventDefault(); bumpYear(1); return; }
            if (e.key === "ArrowDown") { e.preventDefault(); bumpYear(-1); return; }
            if (e.key === "Backspace" && yy === "") {
              e.preventDefault();
              mmRef.current?.focus();
              return;
            }
            onKeyDown?.(e);
          }}
          className="h-9 w-12 text-center text-sm font-mono px-1 tabular-nums"
        />
      </div>
    );
  }
);

ExpiryMMYYInput.displayName = "ExpiryMMYYInput";
