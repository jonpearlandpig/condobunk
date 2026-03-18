import { create } from "zustand";

export type AdvanceFieldStatus = "confirmed" | "needs_confirmation" | "conflict" | "not_provided" | "not_applicable";
export type AdvanceFlagLevel = "red" | "yellow" | "green" | "none";
export type AdvanceFlagSeverity = "red" | "yellow" | "green";
export type AdvanceFlagStatus = "open" | "resolved" | "ignored";
export type ShowAdvanceStatus = "draft" | "in_review" | "locked" | "ready";
export type SourceType = "transcript" | "manual_note" | "doc_upload" | "email_note";
export type Criticality = "critical" | "important" | "standard";
export type ReadinessStatus = "ready" | "needs_review" | "not_ready";

export interface ShowAdvance {
  id: string;
  tid: string;
  taid: string;
  tour_id: string;
  show_id: string | null;
  event_date: string | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_state: string | null;
  status: ShowAdvanceStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  last_reviewed_by: string | null;
}

export interface AdvanceField {
  id: string;
  show_advance_id: string;
  section_key: string;
  field_key: string;
  canonical_label: string;
  current_value: string | null;
  value_unit: string | null;
  status: AdvanceFieldStatus;
  flag_level: AdvanceFlagLevel;
  confidence_score: number | null;
  locked_boolean: boolean;
  updated_at: string;
  updated_by: string | null;
  section_criticality: Criticality;
  field_criticality: Criticality;
  money_sensitive_boolean: boolean;
}

export interface AdvanceSource {
  id: string;
  show_advance_id: string;
  source_type: SourceType;
  source_title: string | null;
  source_datetime: string | null;
  source_owner: string | null;
  raw_text: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface AdvanceFlag {
  id: string;
  show_advance_id: string;
  severity: AdvanceFlagSeverity;
  category: string | null;
  title: string;
  description: string | null;
  linked_field_key: string | null;
  source_ids: string[] | null;
  status: AdvanceFlagStatus;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface AdvanceReadiness {
  show_advance_id: string;
  tour_id: string;
  status: ShowAdvanceStatus;
  critical_unresolved_count: number;
  red_flag_open_count: number;
  readiness_status: ReadinessStatus;
}

export type VenueDocCategory = "tech_packet" | "production_book" | "rigging_guide" | "venue_map" | "power_sheet" | "equipment_list";
export type TourDocCategory = "production_rider" | "rigging_plot" | "input_list" | "patch_list";
export type TourDocProcessingStatus = "uploaded" | "processing" | "complete" | "failed";
export type VenueDocProcessingStatus = "uploaded" | "processing" | "complete" | "failed";

export interface AdvanceVenueDoc {
  id: string;
  show_advance_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  document_category: VenueDocCategory;
  uploaded_by: string | null;
  uploaded_at: string;
  processing_status: VenueDocProcessingStatus;
  processing_error: string | null;
  processed_at: string | null;
}

export interface AdvanceVenueExtraction {
  id: string;
  show_advance_id: string;
  document_id: string;
  extracted_data: Record<string, any>;
  extraction_confidence: Record<string, any>;
  processed_at: string;
}

export interface IntelligenceItem {
  text: string;
  category?: string;
  confidence?: string;
  source_doc?: string;
}

export interface AdvanceIntelligenceReport {
  id: string;
  show_advance_id: string;
  venue_capability_summary: string | null;
  comparison_results: any[];
  green_lights: IntelligenceItem[];
  yellow_flags: IntelligenceItem[];
  red_flags: IntelligenceItem[];
  missing_unknown: IntelligenceItem[];
  draft_advance_questions: IntelligenceItem[];
  draft_internal_notes: IntelligenceItem[];
  edited_questions: IntelligenceItem[] | null;
  edited_internal_notes: IntelligenceItem[] | null;
  generated_at: string;
  updated_at: string;
  generated_by: string | null;
}

interface AdvanceStore {
  selectedShowId: string | null;
  setSelectedShowId: (id: string | null) => void;
}

export const useAdvanceStore = create<AdvanceStore>((set) => ({
  selectedShowId: null,
  setSelectedShowId: (id) => set({ selectedShowId: id }),
}));
