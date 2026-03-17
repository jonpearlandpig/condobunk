import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { AdvanceSource } from "@/stores/advanceStore";
import { format } from "date-fns";
import { ArrowLeft, Upload, FileText, StickyNote, Mail, Mic, Loader2, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

const sourceIcons: Record<string, typeof FileText> = {
  transcript: Mic,
  manual_note: StickyNote,
  doc_upload: FileText,
  email_note: Mail,
};

const sourceColors: Record<string, string> = {
  transcript: "text-info",
  manual_note: "text-warning",
  doc_upload: "text-primary",
  email_note: "text-success",
};

export default function AdvanceSources() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [sourceType, setSourceType] = useState<string>("transcript");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: sources, isLoading } = useQuery({
    queryKey: ["advance-sources", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("advance_sources").select("*").eq("show_advance_id", id!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as AdvanceSource[];
    },
    enabled: !!id,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!sourceText.trim()) throw new Error("Source text is required");
      const { error } = await supabase.from("advance_sources").insert({
        show_advance_id: id!,
        source_type: sourceType,
        source_title: sourceTitle || null,
        raw_text: sourceText,
        uploaded_by: user?.id,
        source_datetime: new Date().toISOString(),
      });
      if (error) throw error;
      // Log to decision log
      await supabase.from("advance_decision_log").insert({
        show_advance_id: id!,
        tai_d: `TAI-D-SRC-${Date.now()}`,
        action_type: "source_added",
        new_value: sourceTitle || sourceType,
        rationale: `${sourceType} added`,
        created_by: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-sources", id] });
      setAddOpen(false);
      setSourceTitle("");
      setSourceText("");
      toast.success("Source added");
    },
    onError: (err: any) => toast.error("Failed", { description: err.message }),
  });

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/bunk/advance/${id}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">Source Timeline</h1>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add Source</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Source</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Source Type</Label>
                <Select value={sourceType} onValueChange={setSourceType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transcript">Transcript</SelectItem>
                    <SelectItem value="manual_note">Manual Note</SelectItem>
                    <SelectItem value="doc_upload">Document Upload</SelectItem>
                    <SelectItem value="email_note">Email Note</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Title (optional)</Label>
                <Input value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} placeholder="e.g. Advance Call #1" />
              </div>
              <div className="space-y-1.5">
                <Label>Content</Label>
                <Textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  placeholder="Paste transcript or enter notes..."
                  className="min-h-[200px] font-mono text-xs"
                />
              </div>
              <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending} className="w-full">
                {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Add Source
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !sources?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Upload className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No sources uploaded yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-3">
            {sources.map((s) => {
              const Icon = sourceIcons[s.source_type] || FileText;
              const color = sourceColors[s.source_type] || "text-muted-foreground";
              const isExpanded = expandedId === s.id;
              return (
                <div key={s.id} className="relative pl-12">
                  <div className={`absolute left-3.5 top-3 h-3 w-3 rounded-full bg-card border-2 ${
                    s.source_type === "transcript" ? "border-info" : s.source_type === "manual_note" ? "border-warning" : "border-primary"
                  }`} />
                  <Card className="hover:bg-accent/30 transition-colors">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{s.source_title || s.source_type}</span>
                            <Badge variant="outline" className="text-[9px]">{s.source_type.replace("_", " ")}</Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                            {s.created_at && <span>{format(new Date(s.created_at), "MMM d, yyyy h:mm a")}</span>}
                            {s.source_owner && <span>· {s.source_owner}</span>}
                          </div>
                          {s.raw_text && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : s.id)}
                              className="flex items-center gap-1 mt-1.5 text-[10px] text-primary hover:underline"
                            >
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              {isExpanded ? "Collapse" : "Expand raw text"}
                            </button>
                          )}
                          {isExpanded && s.raw_text && (
                            <pre className="mt-2 p-3 bg-muted/50 rounded text-[11px] font-mono whitespace-pre-wrap max-h-80 overflow-y-auto border">
                              {s.raw_text}
                            </pre>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
