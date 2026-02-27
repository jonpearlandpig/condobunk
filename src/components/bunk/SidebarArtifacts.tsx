import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { StickyNote, ChevronRight, Plus, FileText, CheckSquare, Eye, Lock, Users } from "lucide-react";
import { useSidebar, SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface ArtifactRow {
  id: string;
  title: string;
  artifact_type: string;
  visibility: string;
  updated_at: string;
}

const typeIcon = (type: string) => {
  switch (type) {
    case "checklist": return CheckSquare;
    case "document": return FileText;
    default: return StickyNote;
  }
};

const visibilityIcon = (vis: string) => {
  switch (vis) {
    case "bunk_stash": return Lock;
    case "condobunk": return Users;
    default: return Eye; // tourtext
  }
};

const SidebarArtifacts = ({ isDemoMode }: { isDemoMode?: boolean }) => {
  const { user } = useAuth();
  const { tours } = useTour();
  const { setOpenMobile, setOpen } = useSidebar();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [open, setOpenState] = useState(false);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [loading, setLoading] = useState(false);

  const tourIds = tours.map(t => t.id);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    const fetchArtifacts = async () => {
      const { data } = await supabase
        .from("user_artifacts")
        .select("id, title, artifact_type, visibility, updated_at")
        .or(`user_id.eq.${user.id}${tourIds.length > 0 ? `,tour_id.in.(${tourIds.join(",")})` : ""}`)
        .order("updated_at", { ascending: false })
        .limit(10) as { data: ArtifactRow[] | null };
      setArtifacts(data || []);
      setLoading(false);
    };
    fetchArtifacts();
  }, [open, user, tourIds.join(",")]);

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  };

  const goToArtifact = (id: string) => {
    handleNavClick();
    navigate(`/bunk/artifacts?id=${id}`);
  };

  const goNewArtifact = () => {
    handleNavClick();
    navigate("/bunk/artifacts?new=1");
  };

  return (
    <SidebarGroup>
      <button
        onClick={() => setOpenState(!open)}
        className="w-full font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60 uppercase px-4 py-1.5 flex items-center gap-2 hover:text-muted-foreground transition-colors"
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
        <StickyNote className="h-3 w-3" />
        Artifacts
        {artifacts.length > 0 && (
          <span className="ml-auto text-muted-foreground/40 normal-case tracking-normal">{artifacts.length}</span>
        )}
      </button>
      {open && (
        <SidebarGroupContent>
          {!isDemoMode && (
            <button
              onClick={goNewArtifact}
              className="mx-4 mb-1 flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono tracking-wider text-primary hover:bg-primary/10 transition-colors"
            >
              <Plus className="h-3 w-3" />
              NEW
            </button>
          )}
          {loading ? (
            <div className="px-4 py-2 text-[10px] text-muted-foreground/40 font-mono">Loading…</div>
          ) : artifacts.length === 0 ? (
            <div className="px-4 py-2 text-[10px] text-muted-foreground/40 font-mono">No artifacts yet</div>
          ) : (
            <div className="space-y-0.5">
              {artifacts.map((a) => {
                const TypeIcon = typeIcon(a.artifact_type);
                const VisIcon = visibilityIcon(a.visibility);
                return (
                  <div
                    key={a.id}
                    onClick={() => goToArtifact(a.id)}
                    className="group flex items-center gap-2 px-4 py-1.5 rounded-md transition-colors cursor-pointer hover:bg-sidebar-accent/50 text-sidebar-foreground"
                  >
                    <TypeIcon className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{a.title}</p>
                      <p className="text-[9px] text-muted-foreground/50 font-mono">
                        {formatDistanceToNow(new Date(a.updated_at), { addSuffix: true })}
                      </p>
                    </div>
                    <VisIcon className="h-3 w-3 shrink-0 text-muted-foreground/30" />
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

export default SidebarArtifacts;
