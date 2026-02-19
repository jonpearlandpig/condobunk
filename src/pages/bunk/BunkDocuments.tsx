import { FileText } from "lucide-react";

const BunkDocuments = () => (
  <div className="space-y-6 max-w-4xl">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
      <p className="text-sm text-muted-foreground font-mono mt-1">
        Upload, version, and activate tour documents
      </p>
    </div>
    <div className="rounded-lg border border-border border-dashed bg-card/50 p-12 text-center">
      <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground font-mono">
        Document upload + extraction engine coming in Phase 2
      </p>
    </div>
  </div>
);

export default BunkDocuments;
