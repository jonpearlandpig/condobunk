import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { TourProductionDoc, TourDocCategory } from "@/stores/advanceStore";
import { format } from "date-fns";
import { Upload, FileText, Loader2, Zap, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<TourDocCategory, string> = {
  production_rider: "Production Rider",
  rigging_plot: "Rigging Plot",
  input_list: "Input List",
  patch_list: "Patch List",
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  uploaded: { label: "Ready", variant: "outline" },
  processing: { label: "Processing", variant: "secondary" },
  complete: { label: "Extracted", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
};

interface Props {
  tourId: string;
}

export default function TourRiderSection({ tourId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<TourDocCategory>("production_rider");

  const { data: docs, isLoading } = useQuery({
    queryKey: ["tour-production-docs", tourId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tour_production_docs")
        .select("*")
        .eq("tour_id", tourId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as unknown as TourProductionDoc[];
    },
    enabled: !!tourId,
    refetchInterval: (query) => {
      const data = query.state.data as TourProductionDoc[] | undefined;
      const hasProcessing = data?.some(d => d.processing_status === "processing");
      return hasProcessing ? 3000 : false;
    },
  });

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${tourId}/production-docs/${timestamp}_${safeName}`;

      const { error: uploadErr } = await supabase.storage
        .from("document-files")
        .upload(filePath, file);
      if (uploadErr) throw uploadErr;

      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const { error: insertErr } = await supabase
        .from("tour_production_docs")
        .insert({
          tour_id: tourId,
          file_name: file.name,
          file_path: filePath,
          file_type: ext,
          document_category: selectedCategory,
          uploaded_by: user?.id,
        });
      if (insertErr) throw insertErr;

      queryClient.invalidateQueries({ queryKey: ["tour-production-docs", tourId] });
      toast.success("File uploaded", { description: file.name });
    } catch (err: any) {
      toast.error("Upload failed", { description: err?.message });
    } finally {
      setUploading(false);
    }
  };

  const analyzeMutation = useMutation({
    mutationFn: async (docIds?: string[]) => {
      const body: Record<string, unknown> = { tour_id: tourId };
      if (docIds?.length) body.document_ids = docIds;
      const { data, error } = await supabase.functions.invoke("advance-rider-analyze", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tour-production-docs", tourId] });
      queryClient.invalidateQueries({ queryKey: ["tour-production-extractions", tourId] });
      toast.success("Rider analysis complete", {
        description: `${data.docs_processed} docs processed${data.docs_failed ? `, ${data.docs_failed} failed` : ""}`,
      });
    },
    onError: (err: any) => {
      toast.error("Analysis failed", { description: err?.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const doc = docs?.find(d => d.id === docId);
      if (doc) {
        await supabase.storage.from("document-files").remove([doc.file_path]);
      }
      const { error } = await supabase.from("tour_production_docs").delete().eq("id", docId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour-production-docs", tourId] });
      toast.success("Document removed");
    },
  });

  const hasUnprocessed = docs?.some(d => d.processing_status === "uploaded" || d.processing_status === "failed");
  const hasComplete = docs?.some(d => d.processing_status === "complete");
  const isProcessing = docs?.some(d => d.processing_status === "processing") || analyzeMutation.isPending;
  const allDocIds = docs?.map(d => d.id).filter(Boolean) ?? [];

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-mono tracking-wider text-muted-foreground/60">TOUR PRODUCTION DOCS</CardTitle>
          <div className="flex items-center gap-1.5">
            {hasComplete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={isProcessing || !allDocIds.length}
                onClick={() => analyzeMutation.mutate(allDocIds)}
              >
                <RefreshCw className="h-3 w-3" />Re-run
              </Button>
            )}
            {(hasUnprocessed || !docs?.length) && (
              <Button
                variant="default"
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={isProcessing || !docs?.length}
                onClick={() => analyzeMutation.mutate(undefined)}
              >
                {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                {isProcessing ? "Analyzing..." : "Run TELA Analysis"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-3">
        {/* Upload controls */}
        <div className="flex items-center gap-2">
          <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as TourDocCategory)}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1 shrink-0"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.xlsx,.xls,.txt,.csv,.png,.jpg,.jpeg"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
              e.target.value = "";
            }}
          />
        </div>

        {/* Doc list */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !docs?.length ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            Upload your Production Rider, Rigging Plot, or Input List. TELA will extract tour requirements and compare them against venue specs.
          </p>
        ) : (
          <div className="space-y-1.5">
            {docs.map((doc) => {
              const sb = STATUS_BADGE[doc.processing_status] || STATUS_BADGE.uploaded;
              return (
                <div key={doc.id} className="flex items-center gap-2 p-2 rounded-md border border-border/50 bg-muted/20">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{doc.file_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {CATEGORY_LABELS[doc.document_category]} · {(() => { const d = new Date(doc.uploaded_at); return isNaN(d.getTime()) ? "Unknown" : format(d, "MMM d, h:mm a"); })()}
                    </p>
                    {doc.processing_error && (
                      <p className="text-[10px] text-destructive truncate">{doc.processing_error}</p>
                    )}
                  </div>
                  <Badge variant={sb.variant} className="text-[10px] shrink-0">{sb.label}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => deleteMutation.mutate(doc.id)}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
