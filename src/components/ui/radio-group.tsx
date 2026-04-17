import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";

import { cn } from "@/lib/utils";
import { advanceToNextField } from "@/hooks/useEnterNavigation";

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return <RadioGroupPrimitive.Root className={cn("grid gap-2", className)} {...props} ref={ref} />;
});
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, onKeyDown, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      data-field-value={props.checked || (props as any)["data-state"] === "checked" ? "selected" : ""}
      className={cn(
        "aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:ring-2 data-[state=checked]:ring-primary/40",
        className,
      )}
      onKeyDown={(e) => {
        // Enter on a selected radio → advance focus to next field (don't toggle)
        if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
          const isChecked = (e.currentTarget as HTMLElement).getAttribute("data-state") === "checked";
          if (isChecked) {
            e.preventDefault();
            advanceToNextField(e.currentTarget as HTMLElement);
            return;
          }
          // Not selected yet: select it (Radix uses Space, so synthesize)
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
          // Then advance shortly after
          setTimeout(() => advanceToNextField(e.currentTarget as HTMLElement), 30);
          return;
        }
        // "R" key → toggle current item (UX shortcut)
        if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
          return;
        }
        onKeyDown?.(e);
      }}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
