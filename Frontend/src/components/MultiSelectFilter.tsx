import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  className,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  const selectAll = () => {
    onChange([...options]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2 min-w-[140px] justify-between", className)}
        >
          <span>
            {label}
            {selected.length > 0 && (
              <span className="ml-1 text-primary">({selected.length})</span>
            )}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="p-2 border-b border-border flex gap-2">
          <Button variant="ghost" size="sm" onClick={selectAll} className="flex-1">
            All
          </Button>
          <Button variant="ghost" size="sm" onClick={clearAll} className="flex-1">
            Clear
          </Button>
        </div>
        <div className="p-1 max-h-64 overflow-auto">
          {options.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <button
                key={option}
                onClick={() => toggleOption(option)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors",
                  isSelected && "bg-muted"
                )}
              >
                <div
                  className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center",
                    isSelected
                      ? "bg-primary border-primary"
                      : "border-muted-foreground/30"
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <span className="capitalize">{option}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
