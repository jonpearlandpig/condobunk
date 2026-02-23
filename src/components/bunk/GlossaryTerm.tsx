import { useState } from "react";
import { GLOSSARY } from "@/lib/glossary";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";

interface GlossaryTermProps {
  term: string;
  children?: React.ReactNode;
}

const GlossaryTerm = ({ term, children }: GlossaryTermProps) => {
  const entry = GLOSSARY[term];
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (!entry) return <>{children || term}</>;

  const label = children || term;
  const content = (
    <>
      <span className="font-semibold">{entry.term}</span>
      <span className="text-muted-foreground"> — </span>
      {entry.short}
    </>
  );

  if (isMobile) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <span className="border-b border-dotted border-muted-foreground/40 cursor-help">
            {label}
          </span>
        </PopoverTrigger>
        <PopoverContent side="top" className="max-w-xs text-xs leading-relaxed p-3">
          {content}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="border-b border-dotted border-muted-foreground/40 cursor-help">
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default GlossaryTerm;
