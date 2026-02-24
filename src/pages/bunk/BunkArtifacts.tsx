import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, Edit2, Save, X, FileText, Loader2, StickyNote, CheckSquare, Printer, Copy, Send, Globe, Users, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Visibility = "tourtext" | "condobunk" | "bunk_stash";

type Artifact = {
  id: string;
  title: string;
  content: string | null;
  artifact_type: string;
  visibility: Visibility;
  created_at: string;
  updated_at: string;
  user_id: string;
  tour_id: string | null;
};

type Profile = { id: string; display_name: string | null; email: string | null };

const TYPE_ICONS: Record<string, React.ElementType> = {
  note: StickyNote,
  document: FileText,
  checklist: CheckSquare,
};

const TYPE_LABELS: Record<string, string> = {
  note: "Note",
  document: "Document",
  checklist: "Checklist",
};

const VIS_META: Record<Visibility, { icon: React.ElementType; label: string; color: string }> = {
  tourtext: { icon: Globe, label: "TourText", color: "text-green-500" },
  condobunk: { icon: Users, label: "CondoBunk", color: "text-blue-500" },
  bunk_stash: { icon: Lock, label: "Bunk Stash", color: "text-amber-500" },
};

const SENSITIVE_KEYWORDS = [
  "settlement", "finance", "salary", "hr", "nda", "per diem", "guarantee",
  "gross", "net", "contract", "insurance", "confidential", "internal",
  "legal", "compensation", "payroll", "tax", "w-9", "w9", "severance",
  "termination", "rider", "commission", "bonus", "deduction",
];

function detectSensitive(text: string): boolean {
  const lower = text.toLowerCase();
  return SENSITIVE_KEYWORDS.some((kw) => lower.includes(kw));
}

/* ─── Artifact Card ─── */
const ArtifactCard = ({
  a,
  isOwner,
  creatorName,
  readOnly,
  onEdit,
  onDelete,
  onCopy,
  onPrint,
  onSend,
}: {
  a: Artifact;
  isOwner: boolean;
  creatorName?: string;
  readOnly?: boolean;
  onEdit: (a: Artifact) => void;
  onDelete: (id: string) => void;
  onCopy: (a: Artifact) => void;
  onPrint: (a: Artifact) => void;
  onSend: (a: Artifact) => void;
}) => {
  const Icon = TYPE_ICONS[a.artifact_type] || FileText;
  const VisIcon = VIS_META[a.visibility]?.icon || FileText;

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-sm font-semibold truncate">{a.title}</h3>
          <Badge variant="outline" className="text-xs font-mono shrink-0">
            {TYPE_LABELS[a.artifact_type] || a.artifact_type}
          </Badge>
          <VisIcon className={`h-3.5 w-3.5 shrink-0 ${VIS_META[a.visibility]?.color}`} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" onClick={() => onCopy(a)} title="Copy">
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onPrint(a)} title="Print">
            <Printer className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onSend(a)} title="Email">
            <Send className="h-4 w-4" />
          </Button>
          {isOwner && !readOnly && (
            <>
              <Button size="sm" variant="ghost" onClick={() => onEdit(a)} title="Edit">
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(a.id)} title="Delete">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </div>
      {a.content && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed pl-6">
          {a.content}
        </p>
      )}
      <div className="flex items-center gap-3 pl-6">
        {creatorName && (
          <span className="text-xs text-muted-foreground/70 font-mono">by {creatorName}</span>
        )}
        <span className="text-xs text-muted-foreground/50 font-mono">
          Updated {new Date(a.updated_at).toLocaleDateString()}
        </span>
      </div>
    </Card>
  );
};

/* ─── Main ─── */
const BunkArtifacts = () => {
  const { user } = useAuth();
  const { selectedTourId, isDemoMode } = useTour();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Visibility>("condobunk");

  // New artifact form
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState("note");
  const [newVisibility, setNewVisibility] = useState<Visibility>("condobunk");
  const [userOverrodeVis, setUserOverrodeVis] = useState(false);

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  /* ── keyword detection on title ── */
  useEffect(() => {
    if (userOverrodeVis) return;
    if (detectSensitive(newTitle)) {
      if (newVisibility !== "bunk_stash") {
        setNewVisibility("bunk_stash");
        toast.info("This looks sensitive — saving to Bunk Stash", { duration: 3000 });
      }
    }
  }, [newTitle, userOverrodeVis, newVisibility]);

  const handleVisChange = (v: Visibility) => {
    setNewVisibility(v);
    setUserOverrodeVis(true);
  };

  /* ── load artifacts ── */
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Fetch all artifacts the user can see (RLS handles access)
    const query = supabase
      .from("user_artifacts")
      .select("*")
      .order("updated_at", { ascending: false });

    if (selectedTourId) {
      query.or(`tour_id.eq.${selectedTourId},tour_id.is.null`);
    }

    const { data, error } = await query;
    if (error) toast.error(error.message);
    else {
      const items = (data || []) as Artifact[];
      setArtifacts(items);

      // Fetch profiles for shared items
      const userIds = [...new Set(items.filter((i) => i.visibility !== "bunk_stash").map((i) => i.user_id))];
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", userIds);
        if (profs) {
          const map: Record<string, Profile> = {};
          profs.forEach((p) => (map[p.id] = p as Profile));
          setProfiles(map);
        }
      }
    }
    setLoading(false);
  }, [user, selectedTourId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => artifacts.filter((a) => (a as Artifact).visibility === activeTab),
    [artifacts, activeTab]
  );

  /* ── CRUD ── */
  const handleCreate = async () => {
    if (!user || !newTitle.trim()) return;
    const { error } = await supabase.from("user_artifacts").insert({
      user_id: user.id,
      tour_id: selectedTourId || null,
      title: newTitle.trim(),
      content: newContent.trim() || null,
      artifact_type: newType,
      visibility: newVisibility,
    } as any);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Artifact saved");
      setCreating(false);
      setNewTitle(""); setNewContent(""); setNewType("note");
      setNewVisibility("condobunk"); setUserOverrodeVis(false);
      load();
    }
  };

  const handleSaveEdit = async (id: string) => {
    const { error } = await supabase
      .from("user_artifacts")
      .update({ title: editTitle.trim(), content: editContent.trim() || null })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); setEditingId(null); load(); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("user_artifacts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); load(); }
  };

  const startEdit = (a: Artifact) => {
    setEditingId(a.id);
    setEditTitle(a.title);
    setEditContent(a.content || "");
  };

  const handlePrint = (a: Artifact) => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>${a.title}</title><style>body{font-family:monospace;padding:2rem;white-space:pre-wrap}h1{font-size:1.25rem;margin-bottom:1rem}</style></head><body><h1>${a.title}</h1>${a.content || ""}</body></html>`);
    win.document.close();
    win.print();
  };

  const handleCopy = async (a: Artifact) => {
    try {
      await navigator.clipboard.writeText(`${a.title}\n\n${a.content || ""}`);
      toast.success("Copied to clipboard");
    } catch { toast.error("Failed to copy"); }
  };

  const handleSend = (a: Artifact) => {
    const body = encodeURIComponent(`${a.title}\n\n${a.content || ""}`);
    const subject = encodeURIComponent(a.title);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  };

  const tabCounts = useMemo(() => ({
    tourtext: artifacts.filter((a) => (a as Artifact).visibility === "tourtext").length,
    condobunk: artifacts.filter((a) => (a as Artifact).visibility === "condobunk").length,
    bunk_stash: artifacts.filter((a) => (a as Artifact).visibility === "bunk_stash").length,
  }), [artifacts]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Artifacts</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Tour info, team notes, and your private stash
          </p>
        </div>
        {!isDemoMode && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setCreating(true); setNewVisibility(activeTab); setUserOverrodeVis(false); }}
            disabled={creating}
          >
            <Plus className="h-4 w-4 mr-1" /> New Artifact
          </Button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <Card className="p-4 space-y-3 border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-mono text-primary font-medium">NEW ARTIFACT</p>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setUserOverrodeVis(false); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Visibility chips */}
          <div className="flex gap-2">
            {(["tourtext", "condobunk", "bunk_stash"] as Visibility[]).map((v) => {
              const meta = VIS_META[v];
              const VisIcon = meta.icon;
              const active = newVisibility === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleVisChange(v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-medium border transition-all ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  <VisIcon className="h-3.5 w-3.5" />
                  {meta.label}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                placeholder="Title (e.g. Arena Floor Arrows - Night 1)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="font-mono text-sm"
                autoFocus
              />
            </div>
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="document">Document</SelectItem>
                <SelectItem value="checklist">Checklist</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            placeholder="Content, directions, instructions, lists…"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            className="font-mono text-sm min-h-[100px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setUserOverrodeVis(false); }}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={!newTitle.trim()}>
              <Save className="h-4 w-4 mr-1" /> Save Artifact
            </Button>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Visibility)}>
        <TabsList className="w-full">
          {(["tourtext", "condobunk", "bunk_stash"] as Visibility[]).map((v) => {
            const meta = VIS_META[v];
            const VisIcon = meta.icon;
            return (
              <TabsTrigger key={v} value={v} className="flex-1 gap-1.5 text-xs font-mono">
                <VisIcon className="h-3.5 w-3.5" />
                {meta.label}
                {tabCounts[v] > 0 && (
                  <span className="ml-1 text-muted-foreground">({tabCounts[v]})</span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {(["tourtext", "condobunk", "bunk_stash"] as Visibility[]).map((v) => (
          <TabsContent key={v} value={v}>
            {loading ? (
              <div className="flex items-center gap-3 py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm font-mono text-muted-foreground">Loading…</span>
              </div>
            ) : filtered.length === 0 ? (
              <Card className="p-12 text-center border-dashed">
                {(() => { const I = VIS_META[v].icon; return <I className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />; })()}
                <p className="text-sm font-mono text-muted-foreground">No {VIS_META[v].label} artifacts yet.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {v === "tourtext" && "Public tour info visible to all tour members."}
                  {v === "condobunk" && "Internal team notes shared with tour members."}
                  {v === "bunk_stash" && "Your private vault — only you can see this."}
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {filtered.map((a) => {
                  const isEditing = editingId === a.id;
                  const isOwner = a.user_id === user?.id;
                  const prof = profiles[a.user_id];
                  const creatorName = v !== "bunk_stash" ? (prof?.display_name || prof?.email || undefined) : undefined;

                  if (isEditing && isOwner) {
                    return (
                      <Card key={a.id} className="p-4 space-y-2">
                        <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="font-mono text-sm font-medium" />
                        <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="font-mono text-sm min-h-[100px]" />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4 mr-1" /> Cancel
                          </Button>
                          <Button size="sm" onClick={() => handleSaveEdit(a.id)}>
                            <Save className="h-4 w-4 mr-1" /> Save
                          </Button>
                        </div>
                      </Card>
                    );
                  }

                  return (
                    <ArtifactCard
                      key={a.id}
                      a={a}
                      isOwner={isOwner}
                      creatorName={creatorName}
                      readOnly={isDemoMode}
                      onEdit={startEdit}
                      onDelete={handleDelete}
                      onCopy={handleCopy}
                      onPrint={handlePrint}
                      onSend={handleSend}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default BunkArtifacts;
