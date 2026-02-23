import { GLOSSARY } from "@/lib/glossary";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface GlossaryTermProps {
  term: string;
  children?: React.ReactNode;
}

const GlossaryTerm = ({ term, children }: GlossaryTermProps) => {
  const entry = GLOSSARY[term];
  if (!entry) return <>{children || term}</>;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="border-b border-dotted border-muted-foreground/40 cursor-help">
            {children || term}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          <span className="font-semibold">{entry.term}</span>
          <span className="text-muted-foreground"> — </span>
          {entry.short}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default GlossaryTerm;
