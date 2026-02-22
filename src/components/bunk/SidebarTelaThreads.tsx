import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles, ChevronRight, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTelaThreads } from "@/hooks/useTelaThreads";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const SidebarTelaThreads = () => {
  const { threads, loading, renameThread, deleteThread } = useTelaThreads();
  const { setOpenMobile, setOpen } = useSidebar();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpenState] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  };

  const goToThread = (threadId: string) => {
    handleNavClick();
    navigate(`/bunk/chat?thread=${threadId}`);
  };

  const goNewThread = () => {
    handleNavClick();
    navigate("/bunk/chat");
  };

  const startRename = (id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenameValue(currentTitle);
  };

  const confirmRename = async () => {
    if (renamingId && renameValue.trim()) {
      await renameThread(renamingId, renameValue.trim());
      toast.success("Thread renamed");
    }
    setRenamingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteThread(id);
    toast.success("Thread deleted");
    // If we're viewing this thread, navigate away
    if (location.search.includes(id)) {
      navigate("/bunk/chat");
    }
  };

  const currentThreadId = new URLSearchParams(location.search).get("thread");

  return (
    <SidebarGroup>
      <button
        onClick={() => setOpenState(!open)}
        className="w-full font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase px-4 py-1.5 flex items-center gap-2 hover:text-muted-foreground transition-colors"
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
        <Sparkles className="h-3 w-3" />
        Ask TELA
        {threads.length > 0 && (
          <span className="ml-auto text-muted-foreground/40 normal-case tracking-normal">{threads.length}</span>
        )}
      </button>
      {open && (
        <SidebarGroupContent>
          {loading ? (
            <div className="px-4 py-2 text-[10px] text-muted-foreground/40 font-mono">Loading…</div>
          ) : threads.length === 0 ? (
            <div className="px-4 py-2 text-[10px] text-muted-foreground/40 font-mono">No threads yet</div>
          ) : (
            <div className="space-y-0.5">
              {threads.map((t) => {
                const isActive = currentThreadId === t.id;
                const isRenaming = renamingId === t.id;
                return (
                  <div
                    key={t.id}
                    className={`group flex items-center gap-1 px-4 py-1.5 rounded-md transition-colors cursor-pointer ${
                      isActive ? "bg-sidebar-accent text-primary" : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                    }`}
                  >
                    {isRenaming ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setRenamingId(null); }}
                          className="flex-1 min-w-0 bg-transparent text-xs border-b border-primary outline-none py-0.5"
                        />
                        <button onClick={confirmRename} className="text-primary hover:text-primary/80"><Check className="h-3 w-3" /></button>
                        <button onClick={() => setRenamingId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0" onClick={() => goToThread(t.id)}>
                          <p className="text-xs truncate">{t.title}</p>
                          <p className="text-[9px] text-muted-foreground/50 font-mono">
                            {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                          </p>
                        </div>
                        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); startRename(t.id, t.title); }}
                            className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                            className="p-0.5 rounded text-muted-foreground/50 hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
};

export default SidebarTelaThreads;
