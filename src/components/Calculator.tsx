import { useState, useCallback, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calculator as CalcIcon } from "lucide-react";

interface CalculatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransferValue?: (value: string) => void;
}

export function Calculator({ open, onOpenChange, onTransferValue }: CalculatorProps) {
  const [display, setDisplay] = useState("0");
  const [expression, setExpression] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);
  const displayRef = useRef<HTMLDivElement>(null);

  const clear = useCallback(() => {
    setDisplay("0");
    setExpression("");
    setLastResult(null);
  }, []);

  const handleNumber = useCallback((num: string) => {
    setDisplay(prev => prev === "0" || lastResult !== null ? num : prev + num);
    setExpression(prev => lastResult !== null ? num : prev + num);
    if (lastResult !== null) setLastResult(null);
  }, [lastResult]);

  const handleOperator = useCallback((op: string) => {
    setExpression(prev => {
      const trimmed = prev.trimEnd();
      if (["+", "-", "×", "÷"].includes(trimmed.slice(-1))) {
        return trimmed.slice(0, -1) + op;
      }
      return prev + " " + op + " ";
    });
    setDisplay("0");
    setLastResult(null);
  }, []);

  const handleDecimal = useCallback(() => {
    if (display.includes(".")) return;
    setDisplay(prev => prev + ".");
    setExpression(prev => prev + ".");
  }, [display]);

  const handlePercent = useCallback(() => {
    const val = parseFloat(display);
    if (isNaN(val)) return;
    const pct = (val / 100).toString();
    setDisplay(pct);
    // Replace last number in expression
    setExpression(prev => {
      const parts = prev.split(/([+\-×÷])/);
      parts[parts.length - 1] = pct;
      return parts.join("");
    });
  }, [display]);

  const calculate = useCallback(() => {
    try {
      const evalExpr = expression
        .replace(/×/g, "*")
        .replace(/÷/g, "/");
      // eslint-disable-next-line no-eval
      const result = Function('"use strict"; return (' + evalExpr + ')')();
      const formatted = parseFloat(result.toFixed(10)).toString();
      setDisplay(formatted);
      setExpression(formatted);
      setLastResult(formatted);
    } catch {
      setDisplay("Error");
      setExpression("");
    }
  }, [expression]);

  const handleBackspace = useCallback(() => {
    setDisplay(prev => prev.length <= 1 ? "0" : prev.slice(0, -1));
    setExpression(prev => prev.length <= 1 ? "" : prev.slice(0, -1));
  }, []);

  // Keyboard handler inside calculator
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const val = lastResult ?? display;
        if (val && val !== "Error" && onTransferValue) {
          onTransferValue(val);
          onOpenChange(false);
        }
        return;
      }
      if (e.key === "Escape") { onOpenChange(false); return; }
      if (e.key >= "0" && e.key <= "9") { handleNumber(e.key); e.preventDefault(); }
      else if (e.key === ".") { handleDecimal(); e.preventDefault(); }
      else if (e.key === "+") { handleOperator("+"); e.preventDefault(); }
      else if (e.key === "-") { handleOperator("-"); e.preventDefault(); }
      else if (e.key === "*") { handleOperator("×"); e.preventDefault(); }
      else if (e.key === "/") { handleOperator("÷"); e.preventDefault(); }
      else if (e.key === "%") { handlePercent(); e.preventDefault(); }
      else if (e.key === "Enter" || e.key === "=") { calculate(); e.preventDefault(); }
      else if (e.key === "Backspace") { handleBackspace(); e.preventDefault(); }
      else if (e.key.toLowerCase() === "c") { clear(); e.preventDefault(); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, display, lastResult, handleNumber, handleOperator, handleDecimal, handlePercent, calculate, handleBackspace, clear, onTransferValue, onOpenChange]);

  const buttons = [
    ["C", "⌫", "%", "÷"],
    ["7", "8", "9", "×"],
    ["4", "5", "6", "-"],
    ["1", "2", "3", "+"],
    ["0", ".", "=", "Tab↵"],
  ];

  const handleButton = (btn: string) => {
    switch (btn) {
      case "C": clear(); break;
      case "⌫": handleBackspace(); break;
      case "%": handlePercent(); break;
      case "÷": case "×": case "-": case "+": handleOperator(btn); break;
      case ".": handleDecimal(); break;
      case "=": calculate(); break;
      case "Tab↵":
        const val = lastResult ?? display;
        if (val && val !== "Error" && onTransferValue) {
          onTransferValue(val);
          onOpenChange(false);
        }
        break;
      default: handleNumber(btn);
    }
  };

  const getButtonVariant = (btn: string) => {
    if (btn === "=") return "default";
    if (btn === "Tab↵") return "default";
    if (["+", "-", "×", "÷"].includes(btn)) return "secondary";
    if (["C", "⌫", "%"].includes(btn)) return "outline";
    return "ghost";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px] p-4" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalcIcon className="h-4 w-4" />
            Calculator
            <span className="text-xs text-muted-foreground ml-auto">F12 to toggle</span>
          </DialogTitle>
        </DialogHeader>

        {/* Display */}
        <div className="bg-muted rounded-lg p-3 mb-2" ref={displayRef}>
          <div className="text-xs text-muted-foreground h-4 text-right truncate">
            {expression || "\u00A0"}
          </div>
          <div className="text-2xl font-mono text-right truncate text-foreground">
            {display}
          </div>
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-4 gap-1.5">
          {buttons.flat().map((btn, i) => (
            <Button
              key={i}
              variant={getButtonVariant(btn)}
              size="sm"
              className={`h-11 text-base font-medium ${btn === "0" ? "" : ""} ${
                btn === "Tab↵" ? "text-xs bg-primary text-primary-foreground hover:bg-primary/90" : ""
              } ${btn === "=" ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
              onClick={() => handleButton(btn)}
            >
              {btn}
            </Button>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground text-center mt-1">
          Press <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">Tab</kbd> to send result to active field
        </p>
      </DialogContent>
    </Dialog>
  );
}
