import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Loader2,
  CheckCircle2,
  FileText,
  Zap,
  ArrowRight,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Step = "upload" | "confirm";

interface UploadedDoc {
  id: string;
  filename: string;
  doc_type: string;
  extracted: boolean;
}

const STEPS: { key: Step; label: string; number: number }[] = [
  { key: "upload", label: "UPLOAD DOCS", number: 1 },
  { key: "confirm", label: "CONFIRM", number: 2 },
];

const BunkSetup = () => {
  const { user } = useAuth();
  const { reload, setSelectedTourId } = useTour();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("upload");
  const [tourId, setTourId] = useState<string | null>(null);
  const [tourName, setTourName] = useState("New Tour");
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [extractedContacts, setExtractedContacts] = useState<
    { name: string; role?: string }[]
  >([]);

  // Check if user already belongs to a tour with a given name
  const checkDuplicateTour = async (name: string): Promise<{ id: string; name: string } | null> => {
    if (!user) return null;
    const { data: memberRows } = await supabase
      .from("tour_members")
      .select("tour_id")
      .eq("user_id", user.id);
    if (!memberRows || memberRows.length === 0) return null;

    const tourIds = memberRows.map((m) => m.tour_id);
    const { data: existing } = await supabase
      .from("tours")
      .select("id, name")
      .in("id", tourIds)
      .eq("status", "ACTIVE");
    if (!existing) return null;

    const match = existing.find(
      (t) => t.name.toLowerCase().trim() === name.toLowerCase().trim()
    );
    return match ? { id: match.id, name: match.name } : null;
  };

  // Auto-create tour on first upload (placeholder name)
  const ensureTour = async (): Promise<string | null> => {
    if (tourId) return tourId;
    if (!user) return null;
    try {
      console.log("[BunkSetup] Creating tour for user:", user.id);
      const { data, error, status } = await supabase
        .from("tours")
        .insert({ name: "New Tour", owner_id: user.id })
        .select("id")
        .single();
      console.log("[BunkSetup] Tour insert result:", { data, error, status });
      if (error) throw error;
      setTourId(data.id);
      setSelectedTourId(data.id);
      reload();
      return data.id;
    } catch (err: any) {
      console.error("[BunkSetup] Tour creation failed:", err);
      toast({ title: "Upload failed", description: "Failed to create tour: " + err.message, variant: "destructive" });
      return null;
    }
  };

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !user) return;
      setUploading(true);
      try {
        const activeTourId = await ensureTour();
        if (!activeTourId) throw new Error("Failed to create tour");

        const isTextFile = /\.(txt|csv|tsv|md)$/i.test(file.name);
        let rawText: string | null = null;
        if (isTextFile) {
          rawText = await file.text();
        }
        const { count } = await supabase
          .from("documents")
          .select("*", { count: "exact", head: true })
          .eq("tour_id", activeTourId);
        const nextVersion = (count ?? 0) + 1;

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${activeTourId}/${Date.now()}_${safeName}`;
        const { error: storageErr } = await supabase.storage
          .from("document-files")
          .upload(filePath, file);
        if (storageErr) throw storageErr;

        const { data, error: docErr } = await supabase
          .from("documents")
          .insert({
            tour_id: activeTourId,
            filename: file.name,
            file_path: filePath,
            raw_text: rawText,
            version: nextVersion,
            doc_type: "UNKNOWN" as const,
            is_active: false,
          })
          .select("id")
          .single();
        if (docErr) throw docErr;

        setDocs((prev) => [
          ...prev,
          { id: data.id, filename: file.name, doc_type: "UNKNOWN", extracted: false },
        ]);
        toast({ title: "Uploaded", description: file.name });
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [tourId, user]
  );

  // Check if extraction succeeded on the backend despite client disconnect
  const checkExtractionResult = async (docId: string): Promise<boolean> => {
    const { data: doc } = await supabase
      .from("documents")
      .select("doc_type, is_active")
      .eq("id", docId)
      .single();
    return !!(doc && doc.doc_type !== "UNKNOWN");
  };

  const handleExtractionSuccess = async (docId: string, docType: string, tourName_?: string) => {
    setDocs((prev) =>
      prev.map((d) =>
        d.id === docId ? { ...d, doc_type: docType, extracted: true } : d
      )
    );

    if (tourName_) setTourName(tourName_);

    // Fetch contacts for display
    if (tourId) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("name, role")
        .eq("tour_id", tourId)
        .limit(10);
      if (contacts && contacts.length > 0) setExtractedContacts(contacts);
    }

    // Refresh tour name from DB and check for duplicates
    if (tourId) {
      const { data: freshTour } = await supabase
        .from("tours")
        .select("name")
        .eq("id", tourId)
        .single();
      if (freshTour && freshTour.name !== "New Tour") {
        setTourName(freshTour.name);
        // Warn if another tour with the same name already exists
        const dup = await checkDuplicateTour(freshTour.name);
        if (dup && dup.id !== tourId) {
          toast({
            title: "Duplicate tour detected",
            description: `A tour named "${dup.name}" already exists. You may want to join that tour instead of creating a new one.`,
            variant: "destructive",
          });
        }
      }
    }
  };

  const runExtraction = async (docId: string) => {
    setExtracting(docId);
    try {
      const { data, error } = await invokeWithTimeout(
        "extract-document",
        { document_id: docId }
      );

      if (error) {
        // Connection may have dropped but extraction could have succeeded on the backend.
        // Poll the document row to check.
        console.log("[BunkSetup] Extraction call failed, checking if backend succeeded...", error.message);
        let recovered = false;
        for (let attempt = 0; attempt < 6; attempt++) {
          await new Promise((r) => setTimeout(r, 5000)); // wait 5s between checks
          const ok = await checkExtractionResult(docId);
          if (ok) {
            const { data: doc } = await supabase
              .from("documents")
              .select("doc_type")
              .eq("id", docId)
              .single();
            if (doc) {
              await handleExtractionSuccess(docId, doc.doc_type);
              toast({ title: "Extracted", description: `${doc.doc_type} — extraction completed (recovered after timeout)` });
              recovered = true;
              break;
            }
          }
        }
        if (!recovered) throw error;
        return;
      }

      await handleExtractionSuccess(docId, data.doc_type, data.tour_name);

      const parts = [];
      if (data.summary?.events) parts.push(`${data.summary.events} dates`);
      if (data.summary?.contacts) parts.push(`${data.summary.contacts} contacts`);
      if (data.summary?.travel) parts.push(`${data.summary.travel} travel items`);
      if (data.summary?.finance) parts.push(`${data.summary.finance} finance lines`);
      if (data.summary?.protocols) parts.push(`${data.summary.protocols} protocols`);
      if (data.summary?.venues) parts.push(`${data.summary.venues} venues`);
      const desc = parts.length > 0 ? parts.join(", ") : `${data.extracted_count} items`;
      toast({ title: "Extracted", description: `${data.doc_type} — ${desc}` });
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(null);
    }
  };

  const finishSetup = () => {
    if (tourId) setSelectedTourId(tourId);
    navigate("/bunk");
  };

  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Progress */}
      <div className="flex items-center justify-between">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2 flex-1">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center font-mono text-xs font-bold border ${
                i < currentStepIndex
                  ? "bg-success text-success-foreground border-success"
                  : i === currentStepIndex
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {i < currentStepIndex ? <CheckCircle2 className="h-4 w-4" /> : s.number}
            </div>
            <span
              className={`font-mono text-[10px] tracking-wider ${
                i <= currentStepIndex ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-px mx-2 ${
                  i < currentStepIndex ? "bg-success" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        {step === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="rounded-lg border border-border bg-card p-8 space-y-6"
          >
            <div className="text-center">
              <Upload className="h-10 w-10 text-primary mx-auto mb-3" />
              <h2 className="text-xl font-bold">Upload Tour Documents</h2>
              <p className="text-sm text-muted-foreground font-mono mt-1">
                Drop your schedule, contacts, finance files — we'll pull the tour name & staff automatically
              </p>
            </div>

            {/* Upload zone */}
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center relative">
              <input
                type="file"
                accept=".txt,.csv,.tsv,.md,.doc,.docx,.pdf,.xlsx,.xls"
                onChange={handleFileUpload}
                disabled={uploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              {uploading ? (
                <Loader2 className="h-6 w-6 text-primary mx-auto animate-spin" />
              ) : (
                <FileText className="h-6 w-6 text-muted-foreground/40 mx-auto" />
              )}
              <p className="text-xs text-muted-foreground font-mono mt-2">
                {uploading ? "Uploading..." : "Click or drop a file"}
              </p>
            </div>

            {/* Uploaded docs */}
            {docs.length > 0 && (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {doc.extracted ? (
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm font-medium truncate">{doc.filename}</span>
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] tracking-wider shrink-0"
                      >
                        {doc.doc_type}
                      </Badge>
                    </div>
                    {!doc.extracted && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-mono text-[10px] h-7 gap-1 shrink-0"
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
                  </div>
                ))}
              </div>
            )}

            {/* Extracted tour name preview */}
            {tourName !== "New Tour" && (
              <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-3">
                <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
                  DETECTED TOUR NAME
                </span>
                <p className="text-sm font-bold mt-0.5">{tourName}</p>
              </div>
            )}

            {/* Extracted contacts preview */}
            {extractedContacts.length > 0 && (
              <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 space-y-1">
                <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
                  DETECTED STAFF / CONTACTS
                </span>
                {extractedContacts.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{c.name}</span>
                    {c.role && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {c.role}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep("confirm")}
                className="flex-1 font-mono text-xs tracking-wider"
                disabled={docs.length === 0}
              >
                SKIP EXTRACTION
              </Button>
              <Button
                onClick={() => setStep("confirm")}
                disabled={docs.length === 0}
                className="flex-1 font-mono text-xs tracking-wider gap-2"
              >
                <ArrowRight className="h-3 w-3" />
                CONTINUE
              </Button>
            </div>
          </motion.div>
        )}

        {step === "confirm" && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="rounded-lg border border-border bg-card p-8 space-y-6"
          >
            <div className="text-center">
              <Rocket className="h-10 w-10 text-success mx-auto mb-3" />
              <h2 className="text-xl font-bold">Tour Ready</h2>
              <p className="text-sm text-muted-foreground font-mono mt-1">
                Review extracted info and launch
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
                  TOUR
                </span>
                <span className="text-sm font-medium">{tourName}</span>
              </div>
              {extractedContacts.length > 0 && (
                <div>
                  <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
                    STAFF
                  </span>
                  <div className="mt-1 space-y-1">
                    {extractedContacts.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span>{c.name}</span>
                        {c.role && (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {c.role}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
                  DOCUMENTS
                </span>
                <span className="text-sm font-medium">{docs.length} uploaded</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
                  EXTRACTED
                </span>
                <span className="text-sm font-medium">
                  {docs.filter((d) => d.extracted).length} / {docs.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
                  STATUS
                </span>
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] tracking-wider bg-info/20 text-info border-info/30"
                >
                  BUILDING
                </Badge>
              </div>
            </div>

            <Button
              onClick={finishSetup}
              className="w-full font-mono text-xs tracking-wider gap-2"
            >
              <Rocket className="h-3 w-3" />
              LAUNCH OPERATIONS CENTER
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BunkSetup;
