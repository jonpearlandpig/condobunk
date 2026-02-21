import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
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
  Trash2,
  Pencil,
  MoreVertical,
  Archive,
  RotateCcw,
  MessageSquare,
} from "lucide-react";
import ExtractionReviewDialog from "@/components/bunk/ExtractionReviewDialog";
import TechPackReviewDialog from "@/components/bunk/TechPackReviewDialog";
import TechPackInlineSummary from "@/components/bunk/TechPackInlineSummary";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

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
  archived_at: string | null;
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
  const { tours, selectedTourId, setSelectedTourId, selectedTour } = useTour();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<DocRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [reviewDocId, setReviewDocId] = useState<string | null>(null);
  const [reviewSummary, setReviewSummary] = useState<any>(null);
  const [techPackReview, setTechPackReview] = useState<{
    docId: string;
    techSpecId: string | null;
    riskFlags: Array<{ category: string; severity: string; title: string; detail: string }>;
    venueName: string;
    contactCount: number;
  } | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocRow | null>(null);
  const [renameTarget, setRenameTarget] = useState<DocRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const activeDocuments = documents.filter(d => !d.archived_at);
  const archivedDocuments = documents.filter(d => !!d.archived_at);

  const openTechReview = async (docId: string) => {
    setReviewLoading(true);
    try {
      const { data: specs } = await supabase
        .from("venue_tech_specs")
        .select("id, venue_name")
        .eq("source_doc_id", docId)
        .limit(1);
      const spec = specs?.[0];
      if (!spec) {
        toast({ title: "No tech spec found for this document", variant: "destructive" });
        return;
      }
      const { data: flags } = await supabase
        .from("venue_risk_flags")
        .select("category, severity, risk_title, risk_detail")
        .eq("tech_spec_id", spec.id);
      const { count } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("source_doc_id", docId);
      setTechPackReview({
        docId,
        techSpecId: spec.id,
        riskFlags: (flags || []).map(f => ({ category: f.category, severity: f.severity, title: f.risk_title, detail: f.risk_detail || "" })),
        venueName: spec.venue_name,
        contactCount: count || 0,
      });
    } catch (err: any) {
      toast({ title: "Failed to load review", description: err.message, variant: "destructive" });
    } finally {
      setReviewLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTourId) loadDocuments();
  }, [selectedTourId]);

  const loadDocuments = async () => {
    const { data } = await supabase
      .from("documents")
      .select("*")
      .eq("tour_id", selectedTourId)
      .order("created_at", { ascending: false });
    if (data) setDocuments(data as DocRow[]);
  };

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !selectedTourId || !user) return;

      setUploading(true);
      try {
        const isTextFile = /\.(txt|csv|tsv|md)$/i.test(file.name);
        let rawText: string | null = null;
        if (isTextFile) {
          rawText = await file.text();
        }
        const { count } = await supabase
          .from("documents")
          .select("*", { count: "exact", head: true })
          .eq("tour_id", selectedTourId);
        const nextVersion = (count ?? 0) + 1;

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${selectedTourId}/${Date.now()}_${safeName}`;
        const { error: storageErr } = await supabase.storage
          .from("document-files")
          .upload(filePath, file);

        if (storageErr) throw storageErr;

        const { error: docErr } = await supabase.from("documents").insert({
          tour_id: selectedTourId,
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
        e.target.value = "";
      }
    },
    [selectedTourId, user]
  );

  const runExtraction = async (docId: string) => {
    setExtracting(docId);
    try {
      const { data, error } = await invokeWithTimeout(
        "extract-document",
        { document_id: docId }
      );
      if (error) throw error;

      if (data.is_advance_master) {
        toast({
          title: "★ Advance Master extracted",
          description: `${data.venue_count || 0} venues, ${data.extracted_count} items. This is your canonical document. Review before approving.`,
        });
        setReviewSummary(data);
        setReviewDocId(docId);
      } else if (data.is_tech_pack) {
        toast({
          title: "Tech pack extracted",
          description: `${data.venue_name} — ${data.summary?.risk_flags || 0} risks identified. Review before approving.`,
        });
        setTechPackReview({
          docId,
          techSpecId: data.tech_spec_id,
          riskFlags: data.risk_flags || [],
          venueName: data.venue_name || "Unknown Venue",
          contactCount: data.summary?.contacts || 0,
        });
      } else {
        toast({
          title: "Extraction complete",
          description: `Type: ${data.doc_type} — ${data.extracted_count} items. Review before approving.`,
        });
        setReviewSummary(data);
        setReviewDocId(docId);
      }
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

  const handleArchive = async (doc: DocRow) => {
    try {
      // 1. Find event IDs and tech spec IDs linked to this document
      const [eventsRes, techSpecsRes] = await Promise.all([
        supabase.from("schedule_events").select("id").eq("source_doc_id", doc.id),
        supabase.from("venue_tech_specs").select("id").eq("source_doc_id", doc.id),
      ]);

      const eventIds = (eventsRes.data || []).map(e => e.id);
      const techSpecIds = (techSpecsRes.data || []).map(t => t.id);

      // 2. Delete dependents that reference these IDs
      if (eventIds.length > 0) {
        await supabase.from("calendar_conflicts").delete().in("event_id", eventIds);
      }
      if (techSpecIds.length > 0) {
        await supabase.from("venue_risk_flags").delete().in("tech_spec_id", techSpecIds);
        await supabase.from("venue_scores").delete().in("tech_spec_id", techSpecIds);
      }

      // 3. Delete the primary AKB rows
      await Promise.all([
        supabase.from("schedule_events").delete().eq("source_doc_id", doc.id),
        supabase.from("contacts").delete().eq("source_doc_id", doc.id),
        supabase.from("venue_tech_specs").delete().eq("source_doc_id", doc.id),
      ]);

      // 4. Also clean up orphaned conflicts/gaps for this tour with no remaining events
      // Delete conflicts that have null event_id (tour-level) if no active docs remain
      const remainingDocs = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("tour_id", doc.tour_id)
        .is("archived_at", null)
        .neq("id", doc.id);

      if ((remainingDocs.count ?? 0) === 0) {
        // No active docs left — clear all tour-level gaps and conflicts
        await supabase.from("knowledge_gaps").delete().eq("tour_id", doc.tour_id);
        await supabase.from("calendar_conflicts").delete().eq("tour_id", doc.tour_id);
      }

      // 5. Archive the document
      await supabase.from("documents").update({ archived_at: new Date().toISOString(), is_active: false }).eq("id", doc.id);
      toast({ title: "Document archived", description: "All extracted data has been removed from the AKB." });
      loadDocuments();
    } catch (err: any) {
      toast({ title: "Archive failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleRestore = async (doc: DocRow) => {
    try {
      await supabase.from("documents").update({ archived_at: null }).eq("id", doc.id);
      toast({ title: "Document restored" });
      loadDocuments();
    } catch (err: any) {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await supabase.from("documents").update({ filename: renameValue.trim() }).eq("id", renameTarget.id);
      toast({ title: "Document renamed" });
      loadDocuments();
    } catch (err: any) {
      toast({ title: "Rename failed", description: err.message, variant: "destructive" });
    } finally {
      setRenameTarget(null);
      setRenameValue("");
    }
  };

  const toggleActive = async (doc: DocRow) => {
    try {
      await supabase
        .from("documents")
        .update({ is_active: !doc.is_active })
        .eq("id", doc.id);

      loadDocuments();
      toast({
        title: doc.is_active ? "Removed from AKB" : "Added to AKB",
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
    <div className="space-y-4 max-w-4xl w-full overflow-hidden">
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AKB Builder</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Upload documents
          </p>
        </div>
        {tours.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedTourId} onValueChange={setSelectedTourId}>
              <SelectTrigger className="w-full sm:w-48 font-mono text-xs bg-muted">
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
            {selectedTourId && (
              <Button
                size="sm"
                variant="outline"
                className="font-mono text-[10px] h-8 gap-1.5 tracking-wider"
                onClick={() => navigate(`/bunk/chat?scope=tour`)}
              >
                <MessageSquare className="h-3 w-3" />
                ASK TELA — {selectedTour?.name || "Tour"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Upload Zone */}
      <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center relative">
        <input
          type="file"
          accept=".txt,.csv,.tsv,.md,.doc,.docx,.pdf,.xlsx,.xls"
          onChange={handleFileUpload}
          disabled={uploading || !selectedTourId}
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
            : !selectedTourId
            ? "Select a tour first"
            : "Drop a file or click to upload (.txt, .csv, .md)"}
        </p>
        <p className="text-xs text-muted-foreground/60 font-mono mt-1">
          TELA will extract and author artifacts from your uploads
        </p>
      </div>

      {/* Document List */}
      <div>
        <h2 className="text-sm font-mono text-muted-foreground tracking-wider mb-4">
          AKB ARTIFACTS ({activeDocuments.length})
        </h2>
        {activeDocuments.length === 0 ? (
          <div className="rounded-lg border border-border border-dashed bg-card/50 p-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-mono">
              No artifacts yet. Upload a document to begin building the AKB.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {activeDocuments.map((doc, i) => (
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
                    <div className="rounded-lg border border-border bg-card overflow-hidden">
                      <div className="px-3 sm:px-4 py-3 space-y-2">
                        {/* Top row: icon + filename + chevron */}
                        <div className="flex items-center justify-between gap-2 overflow-hidden">
                          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">
                                {doc.filename || "Untitled"}
                              </p>
                              <p className="text-xs font-mono text-muted-foreground mt-0.5">
                                v{doc.version} ·{" "}
                                {new Date(doc.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setRenameTarget(doc); setRenameValue(doc.filename || ""); }}>
                                  <Pencil className="h-3 w-3 mr-2" /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(doc)}>
                                  <Archive className="h-3 w-3 mr-2" /> Archive
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <CollapsibleTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                                <ChevronDown className={`h-3 w-3 transition-transform ${expandedDoc === doc.id ? "rotate-180" : ""}`} />
                              </Button>
                            </CollapsibleTrigger>
                          </div>
                        </div>
                        {/* Bottom row: badge + actions, wraps on mobile */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={`font-mono text-[10px] tracking-wider ${
                              DOC_TYPE_COLORS[doc.doc_type] ||
                              DOC_TYPE_COLORS.UNKNOWN
                            }`}
                          >
                            {doc.doc_type}
                          </Badge>
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
                          {doc.doc_type === "TECH" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="font-mono text-[10px] h-7 gap-1"
                              onClick={() => openTechReview(doc.id)}
                            >
                              <Eye className="h-3 w-3" />
                              REVIEW
                            </Button>
                          )}
                          <button
                            onClick={() => toggleActive(doc)}
                            className={`flex items-center gap-1.5 font-mono text-[10px] tracking-wider px-2.5 py-1 rounded-full border transition-colors ${
                              doc.is_active
                                ? "bg-success/15 text-success border-success/30 hover:bg-success/25"
                                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${doc.is_active ? "bg-success" : "bg-muted-foreground/40"}`} />
                            {doc.is_active ? "IN AKB" : "NOT IN AKB"}
                          </button>
                        </div>
                      </div>
                      <CollapsibleContent>
                        <div className="border-t border-border px-5 py-4">
                          {doc.doc_type === "TECH" ? (
                            <TechPackInlineSummary docId={doc.id} />
                          ) : (
                            <>
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
                            </>
                          )}
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

      {/* Archived Documents */}
      {archivedDocuments.length > 0 && (
        <Collapsible open={showArchived} onOpenChange={setShowArchived}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm font-mono text-muted-foreground tracking-wider hover:text-foreground transition-colors w-full">
              <Archive className="h-3.5 w-3.5" />
              ARCHIVED ({archivedDocuments.length})
              <ChevronDown className={`h-3 w-3 transition-transform ${showArchived ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 mt-3 opacity-60">
              {archivedDocuments.map((doc) => (
                <div key={doc.id} className="rounded-lg border border-border bg-card/50 px-3 sm:px-4 py-3">
                  <div className="flex items-center justify-between gap-2 overflow-hidden">
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{doc.filename || "Untitled"}</p>
                        <p className="text-xs font-mono text-muted-foreground mt-0.5">
                          v{doc.version} · archived {new Date(doc.archived_at!).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 gap-1 font-mono text-[10px] shrink-0" onClick={() => handleRestore(doc)}>
                      <RotateCcw className="h-3 w-3" /> RESTORE
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      {reviewDocId && (
        <ExtractionReviewDialog
          open={!!reviewDocId}
          onOpenChange={(open) => {
            if (!open) {
              setReviewDocId(null);
              setReviewSummary(null);
            }
          }}
          documentId={reviewDocId}
          tourId={selectedTourId}
          extractionSummary={reviewSummary}
          onApproved={loadDocuments}
        />
      )}
      {techPackReview && (
        <TechPackReviewDialog
          open={!!techPackReview}
          onOpenChange={(open) => {
            if (!open) setTechPackReview(null);
          }}
          documentId={techPackReview.docId}
          tourId={selectedTourId}
          techSpecId={techPackReview.techSpecId}
          riskFlags={techPackReview.riskFlags}
          venueName={techPackReview.venueName}
          contactCount={techPackReview.contactCount}
          onApproved={loadDocuments}
        />
      )}

      {/* Archive Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive document?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.filename}" will be moved to the Archived folder. You can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && handleArchive(deleteTarget)}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <AlertDialog open={!!renameTarget} onOpenChange={(open) => { if (!open) { setRenameTarget(null); setRenameValue(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename document</AlertDialogTitle>
          </AlertDialogHeader>
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="Document name" className="font-mono text-sm" onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRename} disabled={!renameValue.trim()}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BunkDocuments;
