import { Settings } from "lucide-react";

const BunkAdmin = () => (
  <div className="space-y-6 max-w-4xl">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
      <p className="text-sm text-muted-foreground font-mono mt-1">
        Tour lifecycle controls
      </p>
    </div>
    <div className="rounded-lg border border-border border-dashed bg-card/50 p-12 text-center">
      <Settings className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground font-mono">
        Lock, archive, and snapshot controls coming soon
      </p>
    </div>
  </div>
);

export default BunkAdmin;
