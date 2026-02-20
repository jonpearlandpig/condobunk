import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Edit2, Save, X, FileText, Loader2, StickyNote, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Artifact = {
  id: string;
  title: string;
  content: string | null;
  artifact_type: string;
  created_at: string;
  updated_at: string;
};

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

const BunkArtifacts = () => {
  const { user } = useAuth();
  const { selectedTourId } = useTour();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // New artifact form
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState("note");

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const query = supabase
      .from("user_artifacts")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (selectedTourId) {
      query.or(`tour_id.eq.${selectedTourId},tour_id.is.null`);
    }

    const { data, error } = await query;
    if (error) toast.error(error.message);
    else setArtifacts((data || []) as Artifact[]);
    setLoading(false);
  }, [user, selectedTourId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!user || !newTitle.trim()) return;
    const { error } = await supabase.from("user_artifacts").insert({
      user_id: user.id,
      tour_id: selectedTourId || null,
      title: newTitle.trim(),
      content: newContent.trim() || null,
      artifact_type: newType,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Artifact saved");
      setCreating(false);
      setNewTitle(""); setNewContent(""); setNewType("note");
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

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Artifacts</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Private to you — signage, notes, checklists, anything you need on the road
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCreating(true)}
          disabled={creating}
        >
          <Plus className="h-4 w-4 mr-1" /> New Artifact
        </Button>
      </div>

      {/* Create form */}
      {creating && (
        <Card className="p-4 space-y-3 border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-mono text-primary font-medium">NEW ARTIFACT</p>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              <X className="h-4 w-4" />
            </Button>
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
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={!newTitle.trim()}>
              <Save className="h-4 w-4 mr-1" /> Save Artifact
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-3 py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm font-mono text-muted-foreground">Loading artifacts…</span>
        </div>
      ) : artifacts.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <StickyNote className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-mono text-muted-foreground">No artifacts yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Create private notes, signage text, checklists — anything just for you.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {artifacts.map((a) => {
            const Icon = TYPE_ICONS[a.artifact_type] || FileText;
            const isEditing = editingId === a.id;
            return (
              <Card key={a.id} className="p-4 space-y-2">
                {isEditing ? (
                  <>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="font-mono text-sm font-medium"
                    />
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="font-mono text-sm min-h-[100px]"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4 mr-1" /> Cancel
                      </Button>
                      <Button size="sm" onClick={() => handleSaveEdit(a.id)}>
                        <Save className="h-4 w-4 mr-1" /> Save
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="h-4 w-4 text-primary shrink-0" />
                        <h3 className="text-sm font-semibold truncate">{a.title}</h3>
                        <Badge variant="outline" className="text-xs font-mono shrink-0">
                          {TYPE_LABELS[a.artifact_type] || a.artifact_type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(a)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(a.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {a.content && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed pl-6">
                        {a.content}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/50 font-mono pl-6">
                      Updated {new Date(a.updated_at).toLocaleDateString()}
                    </p>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BunkArtifacts;
