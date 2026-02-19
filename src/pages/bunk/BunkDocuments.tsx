import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  Zap,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Tour {
  id: string;
  name: string;
}

interface DocRow {
  id: string;
  tour_id: string;
  doc_type: string;
  version: number;
  is_active: boolean;
  filename: string | null;
  file_path: string | null;
  raw_text: string | null;
  created_at: string;
}

const DOC_TYPE_COLORS: Record<string, string> = {
  SCHEDULE: "bg-info/20 text-info border-info/30",
  CONTACTS: "bg-success/20 text-success border-success/30",
  FINANCE: "bg-warning/20 text-warning border-warning/30",
  TRAVEL: "bg-primary/20 text-primary border-primary/30",
  RUN_OF_SHOW: "bg-accent/20 text-accent-foreground border-accent/30",
  TECH: "bg-secondary/20 text-secondary-foreground border-secondary/30",
  UNKNOWN: "bg-muted/20 text-muted-foreground border-muted/30",
};

const BunkDocuments = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tours, setTours] = useState<Tour[]>([]);
  const [selectedTour, setSelectedTour] = useState<string>("");
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadTours();
  }, [user]);

  useEffect(() => {
    if (selectedTour) loadDocuments();
  }, [selectedTour]);

  const loadTours = async () => {
    const { data } = await supabase
      .from("tours")
      .select("id, name")
      .eq("status", "ACTIVE");
    if (data && data.length > 0) {
      setTours(data);
      setSelectedTour(data[0].id);
    }
  };

  const loadDocuments = async () => {
    const { data } = await supabase
      .from("documents")
      .select("*")
      .eq("tour_id", selectedTour)
      .order("created_at", { ascending: false });
    if (data) setDocuments(data as DocRow[]);
  };

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !selectedTour || !user) return;

      setUploading(true);
      try {
        // Read file as text
        const rawText = await file.text();

        // Get next version number for this tour
        const { count } = await supabase
          .from("documents")
          .select("*", { count: "exact", head: true })
          .eq("tour_id", selectedTour);
        const nextVersion = (count ?? 0) + 1;

        // Upload file to storage
        const filePath = `${selectedTour}/${Date.now()}_${file.name}`;
        const { error: storageErr } = await supabase.storage
          .from("document-files")
          .upload(filePath, file);

        if (storageErr) throw storageErr;

        // Create document record
        const { error: docErr } = await supabase.from("documents").insert({
          tour_id: selectedTour,
          filename: file.name,
          file_path: filePath,
          raw_text: rawText,
          version: nextVersion,
          doc_type: "UNKNOWN" as const,
          is_active: false,
        });

        if (docErr) throw docErr;

        toast({ title: "Document uploaded", description: file.name });
        loadDocuments();
      } catch (err: any) {
        toast({
          title: "Upload failed",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setUploading(false);
        // Reset input
        e.target.value = "";
      }
    },
    [selectedTour, user]
  );

  const runExtraction = async (docId: string) => {
    setExtracting(docId);
    try {
      const { data, error } = await supabase.functions.invoke(
        "extract-document",
        { body: { document_id: docId } }
      );
      if (error) throw error;

      toast({
        title: "Extraction complete",
        description: `Type: ${data.doc_type} — ${data.extracted_count} items extracted`,
      });
      loadDocuments();
    } catch (err: any) {
      toast({
        title: "Extraction failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setExtracting(null);
    }
  };

  const toggleActive = async (doc: DocRow) => {
    try {
      if (!doc.is_active) {
        // Deactivate others of same type first
        await supabase
          .from("documents")
          .update({ is_active: false })
          .eq("tour_id", doc.tour_id)
          .eq("doc_type", doc.doc_type as any);
      }

      await supabase
        .from("documents")
        .update({ is_active: !doc.is_active })
        .eq("id", doc.id);

      loadDocuments();
      toast({
        title: doc.is_active ? "Document deactivated" : "Document activated",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Upload, extract, version, and activate tour documents
          </p>
        </div>
        <div className="flex items-center gap-3">
          {tours.length > 0 && (
            <Select value={selectedTour} onValueChange={setSelectedTour}>
              <SelectTrigger className="w-48 font-mono text-xs bg-muted">
                <SelectValue placeholder="Select tour" />
              </SelectTrigger>
              <SelectContent>
                {tours.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="font-mono text-xs">
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Upload Zone */}
      <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center relative">
        <input
          type="file"
          accept=".txt,.csv,.tsv,.md,.doc,.docx,.pdf"
          onChange={handleFileUpload}
          disabled={uploading || !selectedTour}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
        {uploading ? (
          <Loader2 className="h-8 w-8 text-primary mx-auto mb-3 animate-spin" />
        ) : (
          <Upload className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
        )}
        <p className="text-sm text-muted-foreground font-mono">
          {uploading
            ? "Uploading..."
            : !selectedTour
            ? "Select a tour first"
            : "Drop a file or click to upload (.txt, .csv, .md)"}
        </p>
        <p className="text-xs text-muted-foreground/60 font-mono mt-1">
          Text-based files are extracted deterministically — no AI needed
        </p>
      </div>

      {/* Document List */}
      <div>
        <h2 className="text-sm font-mono text-muted-foreground tracking-wider mb-4">
          UPLOADED DOCUMENTS ({documents.length})
        </h2>
        {documents.length === 0 ? (
          <div className="rounded-lg border border-border border-dashed bg-card/50 p-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-mono">
              No documents yet. Upload one to begin building the AKB.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {documents.map((doc, i) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Collapsible
                    open={expandedDoc === doc.id}
                    onOpenChange={(open) =>
                      setExpandedDoc(open ? doc.id : null)
                    }
                  >
                    <div className="rounded-lg border border-border bg-card">
                      <div className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {doc.filename || "Untitled"}
                            </p>
                            <p className="text-xs font-mono text-muted-foreground mt-0.5">
                              v{doc.version} ·{" "}
                              {new Date(doc.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant="outline"
                            className={`font-mono text-[10px] tracking-wider ${
                              DOC_TYPE_COLORS[doc.doc_type] ||
                              DOC_TYPE_COLORS.UNKNOWN
                            }`}
                          >
                            {doc.doc_type}
                          </Badge>
                          {doc.is_active ? (
                            <Badge
                              variant="outline"
                              className="font-mono text-[10px] tracking-wider bg-success/20 text-success border-success/30"
                            >
                              ACTIVE
                            </Badge>
                          ) : null}

                          {doc.doc_type === "UNKNOWN" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="font-mono text-[10px] h-7 gap-1"
                              onClick={() => runExtraction(doc.id)}
                              disabled={extracting === doc.id}
                            >
                              {extracting === doc.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Zap className="h-3 w-3" />
                              )}
                              EXTRACT
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            className="font-mono text-[10px] h-7 gap-1"
                            onClick={() => toggleActive(doc)}
                          >
                            {doc.is_active ? (
                              <XCircle className="h-3 w-3" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3" />
                            )}
                            {doc.is_active ? "DEACTIVATE" : "ACTIVATE"}
                          </Button>

                          <CollapsibleTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                            >
                              <ChevronDown
                                className={`h-3 w-3 transition-transform ${
                                  expandedDoc === doc.id ? "rotate-180" : ""
                                }`}
                              />
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                      </div>
                      <CollapsibleContent>
                        <div className="border-t border-border px-5 py-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Eye className="h-3 w-3 text-muted-foreground" />
                            <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
                              RAW TEXT PREVIEW
                            </span>
                          </div>
                          <pre className="text-xs font-mono text-muted-foreground bg-muted/50 rounded p-3 max-h-48 overflow-auto whitespace-pre-wrap">
                            {doc.raw_text
                              ? doc.raw_text.slice(0, 2000) +
                                (doc.raw_text.length > 2000 ? "\n..." : "")
                              : "No text content"}
                          </pre>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};

export default BunkDocuments;
