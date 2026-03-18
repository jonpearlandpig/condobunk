import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AdvanceIntelligenceReport, IntelligenceItem } from "@/stores/advanceStore";
import { format } from "date-fns";
import {
  CheckCircle2, AlertTriangle, ShieldAlert, HelpCircle,
  MessageSquareText, StickyNote, Save, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface Props {
  showAdvanceId: string;
}

export default function AdvanceIntelligenceSection({ showAdvanceId }: Props) {
  const queryClient = useQueryClient();

  const { data: report, isLoading } = useQuery({
    queryKey: ["advance-intelligence", showAdvanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advance_intelligence_reports")
        .select("*")
        .eq("show_advance_id", showAdvanceId)
        .order("generated_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as unknown as AdvanceIntelligenceReport) || null;
    },
  });

  const [editedQuestions, setEditedQuestions] = useState<string | null>(null);
  const [editedNotes, setEditedNotes] = useState<string | null>(null);
  const [hasQEdits, setHasQEdits] = useState(false);
  const [hasNEdits, setHasNEdits] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (updates: { edited_questions?: any; edited_internal_notes?: any }) => {
      const { error } = await supabase
        .from("advance_intelligence_reports")
        .update(updates as any)
        .eq("id", report!.id) as any;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-intelligence", showAdvanceId] });
      setHasQEdits(false);
      setHasNEdits(false);
      toast.success("Edits saved");
    },
  });

  if (isLoading) return null;
  if (!report) return null;

  const greenLights = (report.green_lights || []) as IntelligenceItem[];
  const yellowFlags = (report.yellow_flags || []) as IntelligenceItem[];
  const redFlags = (report.red_flags || []) as IntelligenceItem[];
  const missingUnknown = (report.missing_unknown || []) as IntelligenceItem[];

  // Show edited versions if they exist, otherwise generated
  const currentQuestions = report.edited_questions || report.draft_advance_questions || [];
  const currentNotes = report.edited_internal_notes || report.draft_internal_notes || [];

  const questionsText = editedQuestions ?? (currentQuestions as IntelligenceItem[]).map(q => q.text).join("\n");
  const notesText = editedNotes ?? (currentNotes as IntelligenceItem[]).map(n => n.text).join("\n");

  const handleSaveEdits = () => {
    const updates: any = {};
    if (hasQEdits && editedQuestions !== null) {
      updates.edited_questions = editedQuestions.split("\n").filter(Boolean).map(t => ({ text: t }));
    }
    if (hasNEdits && editedNotes !== null) {
      updates.edited_internal_notes = editedNotes.split("\n").filter(Boolean).map(t => ({ text: t }));
    }
    if (Object.keys(updates).length) {
      saveMutation.mutate(updates);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-mono tracking-wider text-muted-foreground/60 uppercase px-1">
          Advance Intelligence
        </h2>
        <span className="text-[10px] text-muted-foreground">
          Last analyzed {(() => { const d = new Date(report.generated_at); return isNaN(d.getTime()) ? "Unknown" : format(d, "MMM d, h:mm a"); })()}
        </span>
      </div>

      {/* Venue Capability Summary */}
      {report.venue_capability_summary && (
        <Card className="border-primary/20">
          <CardContent className="py-3 px-4">
            <p className="text-xs leading-relaxed">{report.venue_capability_summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Green / Yellow / Red / Missing grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Green Lights */}
        {greenLights.length > 0 && (
          <IntelCard
            icon={<CheckCircle2 className="h-4 w-4 text-success" />}
            title="Green Lights"
            items={greenLights}
            dotColor="bg-success"
          />
        )}

        {/* Yellow Flags */}
        {yellowFlags.length > 0 && (
          <IntelCard
            icon={<AlertTriangle className="h-4 w-4 text-warning" />}
            title="Yellow Flags"
            items={yellowFlags}
            dotColor="bg-warning"
          />
        )}

        {/* Red Flags */}
        {redFlags.length > 0 && (
          <IntelCard
            icon={<ShieldAlert className="h-4 w-4 text-destructive" />}
            title="Red Flags"
            items={redFlags}
            dotColor="bg-destructive"
          />
        )}

        {/* Missing / Unknown */}
        {missingUnknown.length > 0 && (
          <IntelCard
            icon={<HelpCircle className="h-4 w-4 text-muted-foreground" />}
            title="Missing / Unknown"
            items={missingUnknown}
            dotColor="bg-muted-foreground"
          />
        )}
      </div>

      {/* Editable sections */}
      <Separator />

      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-mono tracking-wider text-muted-foreground/60">DRAFT ADVANCE QUESTIONS</span>
            {report.edited_questions && (
              <Badge variant="outline" className="text-[9px]">Edited</Badge>
            )}
          </div>
          <Textarea
            className="text-xs min-h-[80px]"
            value={questionsText}
            onChange={(e) => {
              setEditedQuestions(e.target.value);
              setHasQEdits(true);
            }}
            placeholder="TELA-generated advance questions will appear here..."
          />
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-mono tracking-wider text-muted-foreground/60">DRAFT INTERNAL NOTES</span>
            {report.edited_internal_notes && (
              <Badge variant="outline" className="text-[9px]">Edited</Badge>
            )}
          </div>
          <Textarea
            className="text-xs min-h-[80px]"
            value={notesText}
            onChange={(e) => {
              setEditedNotes(e.target.value);
              setHasNEdits(true);
            }}
            placeholder="TELA-generated internal notes will appear here..."
          />
        </div>

        {(hasQEdits || hasNEdits) && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleSaveEdits}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Edits
          </Button>
        )}
      </div>
    </div>
  );
}

function IntelCard({ icon, title, items, dotColor }: {
  icon: React.ReactNode;
  title: string;
  items: IntelligenceItem[];
  dotColor: string;
}) {
  return (
    <Card>
      <CardHeader className="py-2.5 px-4">
        <CardTitle className="flex items-center gap-1.5 text-xs font-mono tracking-wider">
          {icon}
          <span className="text-muted-foreground/60">{title.toUpperCase()}</span>
          <Badge variant="secondary" className="text-[9px] ml-auto">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 mt-1.5 ${dotColor}`} />
            <span className="leading-relaxed">{item.text}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
