import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTour } from "@/hooks/useTour";
import type { ShowAdvance, AdvanceReadiness } from "@/stores/advanceStore";
import { format } from "date-fns";
import { Plus, CalendarDays, MapPin, ChevronRight, Loader2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const readinessColor: Record<string, string> = {
  ready: "bg-success/15 text-success border-success/30",
  needs_review: "bg-warning/15 text-warning border-warning/30",
  not_ready: "bg-destructive/15 text-destructive border-destructive/30",
};

const readinessLabel: Record<string, string> = {
  ready: "Ready",
  needs_review: "Needs Review",
  not_ready: "Not Ready",
};

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-info/15 text-info",
  locked: "bg-primary/15 text-primary",
  ready: "bg-success/15 text-success",
};

export default function AdvanceLedger() {
  const { user } = useAuth();
  const { tours } = useTour();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tourId = tours[0]?.id;
  const [createOpen, setCreateOpen] = useState(false);
  const [newVenue, setNewVenue] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newDate, setNewDate] = useState("");

  const { data: advances, isLoading } = useQuery({
    queryKey: ["show-advances", tourId],
    queryFn: async () => {
      if (!tourId) return [];
      const { data, error } = await supabase
        .from("show_advances")
        .select("*")
        .eq("tour_id", tourId)
        .order("event_date", { ascending: true });
      if (error) throw error;
      return data as ShowAdvance[];
    },
    enabled: !!tourId,
  });

  const { data: readiness } = useQuery({
    queryKey: ["advance-readiness", tourId],
    queryFn: async () => {
      if (!tourId) return [];
      const { data, error } = await supabase
        .from("v_show_advance_readiness")
        .select("*")
        .eq("tour_id", tourId);
      if (error) throw error;
      return data as AdvanceReadiness[];
    },
    enabled: !!tourId,
  });

  const readinessMap = new Map(readiness?.map((r) => [r.show_advance_id, r]));

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!tourId || !user) throw new Error("Missing tour or user");
      const tidSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data, error } = await supabase
        .from("show_advances")
        .insert({
          tid: `TID-ADV-${tidSuffix}`,
          taid: `TAID-ADV-${tidSuffix}`,
          tour_id: tourId,
          venue_name: newVenue || null,
          venue_city: newCity || null,
          event_date: newDate || null,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["show-advances"] });
      queryClient.invalidateQueries({ queryKey: ["advance-readiness"] });
      setCreateOpen(false);
      setNewVenue("");
      setNewCity("");
      setNewDate("");
      toast.success("Show advance created");
      navigate(`/bunk/advance/${data.id}`);
    },
    onError: (err: any) => toast.error("Failed to create", { description: err.message }),
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold font-[var(--font-display)]">Advance Ledger</h1>
            <p className="text-xs text-muted-foreground font-mono tracking-wider">
              SHOW ADVANCE RECORDS
            </p>
          </div>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              New Show
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Show Advance</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="venue">Venue Name</Label>
                <Input id="venue" value={newVenue} onChange={(e) => setNewVenue(e.target.value)} placeholder="e.g. Madison Square Garden" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="e.g. New York, NY" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date">Event Date</Label>
                <Input id="date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </div>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="w-full">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !advances?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No show advances yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create your first show advance to start tracking</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {advances.map((adv) => {
            const r = readinessMap.get(adv.id);
            return (
              <Card
                key={adv.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => navigate(`/bunk/advance/${adv.id}`)}
              >
                <CardContent className="flex items-center gap-4 py-3 px-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {adv.venue_name || "Untitled Show"}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${statusColor[adv.status]}`}>
                        {adv.status.toUpperCase()}
                      </Badge>
                      {r && (
                        <Badge variant="outline" className={`text-[10px] ${readinessColor[r.readiness_status]}`}>
                          {readinessLabel[r.readiness_status]}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {adv.event_date && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {format(new Date(adv.event_date), "MMM d, yyyy")}
                        </span>
                      )}
                      {adv.venue_city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {adv.venue_city}
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-muted-foreground/50">{adv.tid}</span>
                    </div>
                  </div>
                  {r && (
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      {r.critical_unresolved_count > 0 && (
                        <span className="text-destructive font-mono">{r.critical_unresolved_count} critical</span>
                      )}
                      {r.red_flag_open_count > 0 && (
                        <span className="text-destructive font-mono">{r.red_flag_open_count} 🔴</span>
                      )}
                    </div>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
