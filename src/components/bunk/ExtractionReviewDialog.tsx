import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  CheckCircle2,
  Calendar,
  Users,
  Loader2,
  Trash2,
  MapPin,
  Undo2,
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

      for (const [id, fields] of Object.entries(editedEvents)) {
        if (deletedEventIds.has(id)) continue;
        await supabase.from("schedule_events").update(fields).eq("id", id);
      }
      for (const [id, fields] of Object.entries(editedContacts)) {
        if (deletedContactIds.has(id)) continue;
        const { scope, ...safeFields } = fields;
        await supabase.from("contacts").update(safeFields).eq("id", id);
      }

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

  const formatDate = (d: string | null) => {
    if (!d) return "No date";
    try {
      const date = new Date(d + "T00:00:00");
      return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    } catch {
      return d;
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[95dvh] flex flex-col">
        <DrawerHeader className="pb-3 border-b border-border shrink-0">
          <DrawerTitle className="font-mono tracking-tight text-lg">
            Review Extraction
          </DrawerTitle>
          <DrawerDescription className="font-mono text-xs text-muted-foreground">
            Edit or remove before approving into AKB
          </DrawerDescription>
          {extractionSummary && (
            <div className="flex gap-2 flex-wrap pt-1">
              <Badge variant="outline" className="font-mono text-[11px]">
                {extractionSummary.doc_type}
              </Badge>
              <Badge variant="outline" className="font-mono text-[11px]">
                {extractionSummary.extracted_count} items
              </Badge>
              {deletedEventIds.size + deletedContactIds.size > 0 && (
                <Badge variant="destructive" className="font-mono text-[11px]">
                  {deletedEventIds.size + deletedContactIds.size} removing
                </Badge>
              )}
            </div>
          )}
        </DrawerHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="events" className="flex-1 flex flex-col min-h-0 px-4 pt-3">
            <TabsList className="font-mono text-sm w-full shrink-0">
              <TabsTrigger value="events" className="gap-1.5 flex-1">
                <Calendar className="h-3.5 w-3.5" />
                Events ({activeEvents.length})
              </TabsTrigger>
              <TabsTrigger value="contacts" className="gap-1.5 flex-1">
                <Users className="h-3.5 w-3.5" />
                Contacts ({activeContacts.length})
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 mt-3">
              <TabsContent value="events" className="mt-0 space-y-3 pb-4">
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-mono py-8 text-center">
                    No schedule events extracted
                  </p>
                ) : (
                  events.map((evt) => {
                    const isDeleted = deletedEventIds.has(evt.id);
                    return (
                      <div
                        key={evt.id}
                        className={`rounded-xl border border-border p-4 space-y-3 transition-all ${
                          isDeleted ? "opacity-30 bg-destructive/5" : "bg-card"
                        }`}
                      >
                        {/* Header row */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-sm font-semibold text-foreground">
                              {formatDate(evt.event_date)}
                            </span>
                            {(evt.load_in || evt.show_time) && (
                              <span className="font-mono text-xs text-muted-foreground ml-2">
                                {formatTime(evt.load_in)}{evt.load_in && evt.show_time ? " → " : ""}{formatTime(evt.show_time)}
                              </span>
                            )}
                          </div>
                          <Button
                            size="icon"
                            variant={isDeleted ? "destructive" : "ghost"}
                            className="h-9 w-9 shrink-0"
                            onClick={() => toggleDeleteEvent(evt.id)}
                          >
                            {isDeleted ? (
                              <Undo2 className="h-4 w-4" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>

                        {/* Editable fields */}
                        {!isDeleted && (
                          <div className="space-y-2">
                            <div>
                              <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Venue</label>
                              <Input
                                className="h-10 text-sm font-mono"
                                placeholder="Venue name"
                                defaultValue={evt.venue || ""}
                                onChange={(e) => updateEventField(evt.id, "venue", e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">City</label>
                              <Input
                                className="h-10 text-sm font-mono"
                                placeholder="City"
                                defaultValue={evt.city || ""}
                                onChange={(e) => updateEventField(evt.id, "city", e.target.value)}
                              />
                            </div>
                          </div>
                        )}

                        {/* Notes preview */}
                        {!isDeleted && evt.notes && (
                          <pre className="text-xs font-mono text-muted-foreground bg-muted/40 rounded-lg p-3 max-h-16 overflow-auto whitespace-pre-wrap leading-relaxed">
                            {evt.notes.slice(0, 300)}
                          </pre>
                        )}
                      </div>
                    );
                  })
                )}
              </TabsContent>

              <TabsContent value="contacts" className="mt-0 space-y-3 pb-4">
                {contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground font-mono py-8 text-center">
                    No contacts extracted
                  </p>
                ) : (
                  contacts.map((c) => {
                    const isDeleted = deletedContactIds.has(c.id);
                    return (
                      <div
                        key={c.id}
                        className={`rounded-xl border border-border p-4 transition-all ${
                          isDeleted ? "opacity-30 bg-destructive/5" : "bg-card"
                        }`}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-sm font-semibold truncate">{c.name}</span>
                            {c.scope === "VENUE" && (
                              <Badge variant="outline" className="font-mono text-[10px] gap-1 shrink-0">
                                <MapPin className="h-2.5 w-2.5" />
                                {c.venue || "VENUE"}
                              </Badge>
                            )}
                            {c.scope === "TOUR" && (
                              <Badge variant="outline" className="font-mono text-[10px] bg-primary/10 text-primary shrink-0">
                                TOUR
                              </Badge>
                            )}
                          </div>
                          <Button
                            size="icon"
                            variant={isDeleted ? "destructive" : "ghost"}
                            className="h-9 w-9 shrink-0"
                            onClick={() => toggleDeleteContact(c.id)}
                          >
                            {isDeleted ? (
                              <Undo2 className="h-4 w-4" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>

                        {/* Editable fields */}
                        {!isDeleted && (
                          <div className="space-y-2">
                            <div>
                              <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Role</label>
                              <Input
                                className="h-10 text-sm font-mono"
                                placeholder="Role"
                                defaultValue={c.role || ""}
                                onChange={(e) => updateContactField(c.id, "role", e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Phone</label>
                              <Input
                                className="h-10 text-sm font-mono"
                                placeholder="Phone"
                                defaultValue={c.phone || ""}
                                onChange={(e) => updateContactField(c.id, "phone", e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Email</label>
                              <Input
                                className="h-10 text-sm font-mono"
                                placeholder="Email"
                                defaultValue={c.email || ""}
                                onChange={(e) => updateContactField(c.id, "email", e.target.value)}
                              />
                            </div>
                            {c.scope === "VENUE" && (
                              <div>
                                <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Venue</label>
                                <Input
                                  className="h-10 text-sm font-mono"
                                  placeholder="Venue"
                                  defaultValue={c.venue || ""}
                                  onChange={(e) => updateContactField(c.id, "venue", e.target.value)}
                                />
                              </div>
                            )}
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

        <DrawerFooter className="shrink-0 border-t border-border pt-3 pb-6 flex-row gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="font-mono text-sm flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={approving || loading}
            className="font-mono text-sm gap-2 flex-1"
          >
            {approving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approve
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default ExtractionReviewDialog;
