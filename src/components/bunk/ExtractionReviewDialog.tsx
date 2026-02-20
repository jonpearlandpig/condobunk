import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  Calendar,
  Users,
  Loader2,
  Trash2,
  MapPin,
} from "lucide-react";

interface ExtractionReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  tourId: string;
  extractionSummary: {
    doc_type: string;
    extracted_count: number;
    summary: {
      events: number;
      contacts: number;
      travel: number;
      finance: number;
      protocols: number;
      venues: number;
    };
  } | null;
  onApproved: () => void;
}

interface EventRow {
  id: string;
  event_date: string | null;
  city: string | null;
  venue: string | null;
  load_in: string | null;
  show_time: string | null;
  notes: string | null;
}

interface ContactRow {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  scope: string;
  venue: string | null;
}

const ExtractionReviewDialog = ({
  open,
  onOpenChange,
  documentId,
  tourId,
  extractionSummary,
  onApproved,
}: ExtractionReviewDialogProps) => {
  const { toast } = useToast();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [deletedEventIds, setDeletedEventIds] = useState<Set<string>>(new Set());
  const [deletedContactIds, setDeletedContactIds] = useState<Set<string>>(new Set());
  const [editedEvents, setEditedEvents] = useState<Record<string, Partial<EventRow>>>({});
  const [editedContacts, setEditedContacts] = useState<Record<string, Partial<ContactRow>>>({});

  useEffect(() => {
    if (open && documentId) {
      loadExtractedData();
    }
  }, [open, documentId]);

  const loadExtractedData = async () => {
    setLoading(true);
    const [eventsRes, contactsRes] = await Promise.all([
      supabase
        .from("schedule_events")
        .select("id, event_date, city, venue, load_in, show_time, notes")
        .eq("source_doc_id", documentId)
        .order("event_date"),
      supabase
        .from("contacts")
        .select("id, name, role, phone, email, scope, venue")
        .eq("source_doc_id", documentId)
        .order("name"),
    ]);
    setEvents((eventsRes.data as EventRow[]) || []);
    setContacts((contactsRes.data as ContactRow[]) || []);
    setDeletedEventIds(new Set());
    setDeletedContactIds(new Set());
    setEditedEvents({});
    setEditedContacts({});
    setLoading(false);
  };

  const updateEventField = (id: string, field: keyof EventRow, value: string) => {
    setEditedEvents((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const updateContactField = (id: string, field: keyof ContactRow, value: string) => {
    setEditedContacts((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const toggleDeleteEvent = (id: string) => {
    setDeletedEventIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleDeleteContact = (id: string) => {
    setDeletedContactIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      // Delete removed items
      if (deletedEventIds.size > 0) {
        await supabase
          .from("schedule_events")
          .delete()
          .in("id", Array.from(deletedEventIds));
      }
      if (deletedContactIds.size > 0) {
        await supabase
          .from("contacts")
          .delete()
          .in("id", Array.from(deletedContactIds));
      }

      // Apply edits
      for (const [id, fields] of Object.entries(editedEvents)) {
        if (deletedEventIds.has(id)) continue;
        await supabase.from("schedule_events").update(fields).eq("id", id);
      }
      for (const [id, fields] of Object.entries(editedContacts)) {
        if (deletedContactIds.has(id)) continue;
        const { scope, ...safeFields } = fields;
        await supabase.from("contacts").update(safeFields).eq("id", id);
      }

      // Deactivate old docs of same type, activate this one
      const docType = extractionSummary?.doc_type;
      if (docType) {
        await supabase
          .from("documents")
          .update({ is_active: false })
          .eq("tour_id", tourId)
          .eq("doc_type", docType as any)
          .neq("id", documentId);
      }
      await supabase
        .from("documents")
        .update({ is_active: true })
        .eq("id", documentId);

      toast({ title: "Approved into AKB", description: "Extraction reviewed and activated." });
      onApproved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Approval failed", description: err.message, variant: "destructive" });
    } finally {
      setApproving(false);
    }
  };

  const activeEvents = events.filter((e) => !deletedEventIds.has(e.id));
  const activeContacts = contacts.filter((c) => !deletedContactIds.has(c.id));

  const formatTime = (ts: string | null) => {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    } catch {
      return ts;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono tracking-tight">
            Review Extraction
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            Edit or remove items before approving into the AKB. Strikethrough items will be deleted.
          </DialogDescription>
          {extractionSummary && (
            <div className="flex gap-2 flex-wrap pt-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                {extractionSummary.doc_type}
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px]">
                {extractionSummary.extracted_count} items
              </Badge>
            </div>
          )}
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="events" className="flex-1 min-h-0">
            <TabsList className="font-mono text-xs">
              <TabsTrigger value="events" className="gap-1.5">
                <Calendar className="h-3 w-3" />
                Events ({activeEvents.length})
              </TabsTrigger>
              <TabsTrigger value="contacts" className="gap-1.5">
                <Users className="h-3 w-3" />
                Contacts ({activeContacts.length})
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 mt-3" style={{ maxHeight: "50vh" }}>
              <TabsContent value="events" className="mt-0 space-y-2">
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-mono py-4 text-center">
                    No schedule events extracted
                  </p>
                ) : (
                  events.map((evt) => {
                    const isDeleted = deletedEventIds.has(evt.id);
                    const edited = editedEvents[evt.id] || {};
                    return (
                      <div
                        key={evt.id}
                        className={`rounded-lg border border-border p-3 space-y-2 transition-opacity ${
                          isDeleted ? "opacity-40 line-through" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium">
                              {evt.event_date || "No date"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTime(evt.load_in)} → {formatTime(evt.show_time)}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleDeleteEvent(evt.id)}
                          >
                            <Trash2 className={`h-3 w-3 ${isDeleted ? "text-destructive" : "text-muted-foreground"}`} />
                          </Button>
                        </div>
                        {!isDeleted && (
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              className="h-7 text-xs font-mono"
                              placeholder="Venue"
                              defaultValue={evt.venue || ""}
                              onChange={(e) => updateEventField(evt.id, "venue", e.target.value)}
                            />
                            <Input
                              className="h-7 text-xs font-mono"
                              placeholder="City"
                              defaultValue={evt.city || ""}
                              onChange={(e) => updateEventField(evt.id, "city", e.target.value)}
                            />
                          </div>
                        )}
                        {!isDeleted && evt.notes && (
                          <pre className="text-[10px] font-mono text-muted-foreground bg-muted/50 rounded p-2 max-h-20 overflow-auto whitespace-pre-wrap">
                            {evt.notes.slice(0, 500)}
                          </pre>
                        )}
                      </div>
                    );
                  })
                )}
              </TabsContent>

              <TabsContent value="contacts" className="mt-0 space-y-2">
                {contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-mono py-4 text-center">
                    No contacts extracted
                  </p>
                ) : (
                  contacts.map((c) => {
                    const isDeleted = deletedContactIds.has(c.id);
                    return (
                      <div
                        key={c.id}
                        className={`rounded-lg border border-border p-3 transition-opacity ${
                          isDeleted ? "opacity-40 line-through" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{c.name}</span>
                            {c.scope === "VENUE" && (
                              <Badge variant="outline" className="font-mono text-[9px] gap-1">
                                <MapPin className="h-2.5 w-2.5" />
                                {c.venue || "VENUE"}
                              </Badge>
                            )}
                            {c.scope === "TOUR" && (
                              <Badge variant="outline" className="font-mono text-[9px] bg-primary/10 text-primary">
                                TOUR TEAM
                              </Badge>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleDeleteContact(c.id)}
                          >
                            <Trash2 className={`h-3 w-3 ${isDeleted ? "text-destructive" : "text-muted-foreground"}`} />
                          </Button>
                        </div>
                        {!isDeleted && (
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              className="h-7 text-xs font-mono"
                              placeholder="Role"
                              defaultValue={c.role || ""}
                              onChange={(e) => updateContactField(c.id, "role", e.target.value)}
                            />
                            <Input
                              className="h-7 text-xs font-mono"
                              placeholder="Phone"
                              defaultValue={c.phone || ""}
                              onChange={(e) => updateContactField(c.id, "phone", e.target.value)}
                            />
                            <Input
                              className="h-7 text-xs font-mono"
                              placeholder="Email"
                              defaultValue={c.email || ""}
                              onChange={(e) => updateContactField(c.id, "email", e.target.value)}
                            />
                            <Input
                              className="h-7 text-xs font-mono"
                              placeholder="Venue (if venue contact)"
                              defaultValue={c.venue || ""}
                              onChange={(e) => updateContactField(c.id, "venue", e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}

        <DialogFooter className="pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-mono text-xs">
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={approving || loading}
            className="font-mono text-xs gap-1.5"
          >
            {approving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Approve into AKB
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExtractionReviewDialog;
