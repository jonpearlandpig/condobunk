import { MessageSquare } from "lucide-react";

const BunkChat = () => (
  <div className="space-y-6 max-w-4xl">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Internal Chat</h1>
      <p className="text-sm text-muted-foreground font-mono mt-1">
        Management-only communications
      </p>
    </div>
    <div className="rounded-lg border border-border border-dashed bg-card/50 p-12 text-center">
      <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground font-mono">
        Internal chat coming in Phase 2
      </p>
    </div>
  </div>
);

export default BunkChat;
