import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ChevronRight, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTour } from "@/hooks/useTour";
import { motion, AnimatePresence } from "framer-motion";

const docTypes = [
  "SCHEDULE",
  "CONTACTS",
  "RUN_OF_SHOW",
  "TECH",
  "FINANCE",
  "TRAVEL",
  "LOGISTICS",
  "HOSPITALITY",
  "CAST",
  "VENUE",
];

const domainQuestions: Record<string, string> = {
  SCHEDULE: "We're missing schedule coverage. What schedule documents do we need to upload?",
  CONTACTS: "No contacts artifacts in the AKB. What contact sheets should we gather?",
  RUN_OF_SHOW: "Run of show is not covered. What do we need to build this out?",
  TECH: "No tech packs in the AKB yet. What venue tech specs should we collect?",
  FINANCE: "Finance domain is empty. What financial documents should we upload?",
  TRAVEL: "Travel is not covered. What travel documents or itineraries do we need?",
  LOGISTICS: "Logistics has no artifacts. What logistics documents should we gather?",
  HOSPITALITY: "Hospitality domain is empty. What hospitality riders or docs are needed?",
  CAST: "Cast information is missing. What cast/artist documents should we upload?",
  VENUE: "Venue domain needs coverage. What venue-specific documents do we need?",
};

interface DocInfo {
  id: string;
  filename: string | null;
  doc_type: string;
  created_at: string;
}

const BunkCoverage = () => {
  const { selectedTourId } = useTour();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [expandedType, setExpandedType] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedTourId) return;
    const load = async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, filename, doc_type, created_at")
        .eq("tour_id", selectedTourId)
        .eq("is_active", true)
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      setDocs(data || []);
    };
    load();
  }, [selectedTourId]);

  const groupedDocs: Record<string, DocInfo[]> = {};
  docs.forEach((d) => {
    if (!groupedDocs[d.doc_type]) groupedDocs[d.doc_type] = [];
    groupedDocs[d.doc_type].push(d);
  });

  const coveredCount = docTypes.filter((t) => (groupedDocs[t]?.length || 0) > 0).length;
  const pct = Math.round((coveredCount / docTypes.length) * 100);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AKB Coverage</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          {coveredCount}/{docTypes.length} domains covered — {pct}%
        </p>
      </div>

      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="space-y-2">
        {docTypes.map((type) => {
          const items = groupedDocs[type] || [];
          const covered = items.length > 0;
          const expanded = expandedType === type;

          return (
            <div key={type}>
              <button
                onClick={() => setExpandedType(expanded ? null : type)}
                className={`w-full flex items-center justify-between rounded-lg border bg-card px-5 py-3 transition-colors text-left ${
                  covered
                    ? "border-success/30 hover:border-success/50"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  {covered ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                  )}
                  <span className="font-mono text-sm">{type}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`font-mono text-[10px] tracking-wider font-semibold ${
                      covered ? "text-success" : "text-muted-foreground"
                    }`}
                  >
                    {covered
                      ? `${items.length} ARTIFACT${items.length > 1 ? "S" : ""}`
                      : "NOT COVERED"}
                  </span>
                  <ChevronDown
                    className={`h-3 w-3 text-muted-foreground transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>

              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="ml-7 mt-1 mb-2 space-y-1.5">
                      {covered ? (
                        items.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center gap-2 px-3 py-2 rounded border border-border/50 bg-muted/30"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
                            <span className="text-xs font-mono text-foreground/80 truncate flex-1">
                              {doc.filename || "Untitled"}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                              {new Date(doc.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="px-3 py-3 rounded border border-dashed border-primary/20 bg-primary/5">
                          <p className="text-xs font-mono text-muted-foreground mb-2">
                            No {type.toLowerCase().replace(/_/g, " ")} artifacts in the AKB yet.
                          </p>
                          <button
                            onClick={() =>
                              navigate(
                                `/bunk/chat?q=${encodeURIComponent(
                                  domainQuestions[type] || `How do we cover ${type}?`
                                )}`
                              )
                            }
                            className="inline-flex items-center gap-1.5 text-[11px] font-mono tracking-wider text-primary hover:text-primary/80 transition-colors"
                          >
                            <ChevronRight className="h-3 w-3" />
                            ASK TELA
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BunkCoverage;
