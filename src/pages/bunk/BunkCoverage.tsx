import { BarChart3 } from "lucide-react";

const docTypes = [
  "SCHEDULE",
  "CONTACTS",
  "RUN_OF_SHOW",
  "TECH",
  "FINANCE",
  "TRAVEL",
  "LOGISTICS",
  "HOSPITALITY",
  "CAST",
  "VENUE",
];

const BunkCoverage = () => (
  <div className="space-y-6 max-w-4xl">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">AKB Coverage</h1>
      <p className="text-sm text-muted-foreground font-mono mt-1">
        Domain checklist — track what's been uploaded
      </p>
    </div>

    <div className="space-y-2">
      {docTypes.map((type) => (
        <div
          key={type}
          className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-3"
        >
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            <span className="font-mono text-sm">{type}</span>
          </div>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
            NOT COVERED
          </span>
        </div>
      ))}
    </div>
  </div>
);

export default BunkCoverage;
