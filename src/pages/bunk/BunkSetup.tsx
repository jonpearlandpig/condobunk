import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radio,
  Upload,
  Loader2,
  CheckCircle2,
  FileText,
  Zap,
  ArrowRight,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Step = "create" | "upload" | "confirm";

interface UploadedDoc {
  id: string;
  filename: string;
  doc_type: string;
  extracted: boolean;
}

const STEPS: { key: Step; label: string; number: number }[] = [
  { key: "create", label: "CREATE TOUR", number: 1 },
  { key: "upload", label: "UPLOAD DOCS", number: 2 },
  { key: "confirm", label: "CONFIRM", number: 3 },
];

const BunkSetup = () => {
  const { user } = useAuth();
  const { reload, setSelectedTourId } = useTour();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("create");
  const [tourName, setTourName] = useState("");
  const [tourId, setTourId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);

  const createTour = async () => {
    if (!tourName.trim() || !user) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("tours")
        .insert({ name: tourName.trim(), owner_id: user.id })
        .select("id")
        .single();
      if (error) throw error;
      setTourId(data.id);
      setSelectedTourId(data.id);
      reload();
      toast({ title: "Tour created" });
      setStep("upload");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !tourId || !user) return;
      setUploading(true);
      try {
        const rawText = await file.text();
        const { count } = await supabase
          .from("documents")
          .select("*", { count: "exact", head: true })
          .eq("tour_id", tourId);
        const nextVersion = (count ?? 0) + 1;

        const filePath = `${tourId}/${Date.now()}_${file.name}`;
        const { error: storageErr } = await supabase.storage
          .from("document-files")
          .upload(filePath, file);
        if (storageErr) throw storageErr;

        const { data, error: docErr } = await supabase
          .from("documents")
          .insert({
            tour_id: tourId,
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

  const runExtraction = async (docId: string) => {
    setExtracting(docId);
    try {
      const { data, error } = await supabase.functions.invoke("extract-document", {
        body: { document_id: docId },
      });
      if (error) throw error;
      setDocs((prev) =>
        prev.map((d) =>
          d.id === docId ? { ...d, doc_type: data.doc_type, extracted: true } : d
        )
      );
      toast({ title: "Extracted", description: `${data.doc_type} — ${data.extracted_count} items` });
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
        {step === "create" && (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="rounded-lg border border-border bg-card p-8 space-y-6"
          >
            <div className="text-center">
              <Radio className="h-10 w-10 text-primary mx-auto mb-3" />
              <h2 className="text-xl font-bold">Name Your Tour</h2>
              <p className="text-sm text-muted-foreground font-mono mt-1">
                Step 1 of 3 — takes about 60 seconds total
              </p>
            </div>
            <div className="space-y-3">
              <Input
                value={tourName}
                onChange={(e) => setTourName(e.target.value)}
                placeholder="Summer 2026 World Tour"
                className="bg-muted font-mono text-sm text-center"
                onKeyDown={(e) => e.key === "Enter" && createTour()}
                autoFocus
              />
              <Button
                onClick={createTour}
                disabled={creating || !tourName.trim()}
                className="w-full font-mono text-xs tracking-wider gap-2"
              >
                {creating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ArrowRight className="h-3 w-3" />
                )}
                {creating ? "CREATING..." : "CREATE & CONTINUE"}
              </Button>
            </div>
          </motion.div>
        )}

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
              <h2 className="text-xl font-bold">Upload Documents</h2>
              <p className="text-sm text-muted-foreground font-mono mt-1">
                Drop your schedule, contacts, finance files
              </p>
            </div>

            {/* Upload zone */}
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center relative">
              <input
                type="file"
                accept=".txt,.csv,.tsv,.md,.doc,.docx,.pdf"
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
                Admin setup complete — review and launch
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
                  TOUR
                </span>
                <span className="text-sm font-medium">{tourName}</span>
              </div>
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
