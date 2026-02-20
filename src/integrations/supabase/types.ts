export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      calendar_conflicts: {
        Row: {
          conflict_type: Database["public"]["Enums"]["conflict_type"]
          created_at: string
          event_id: string | null
          id: string
          resolved: boolean
          severity: Database["public"]["Enums"]["conflict_severity"]
          tour_id: string
        }
        Insert: {
          conflict_type: Database["public"]["Enums"]["conflict_type"]
          created_at?: string
          event_id?: string | null
          id?: string
          resolved?: boolean
          severity?: Database["public"]["Enums"]["conflict_severity"]
          tour_id: string
        }
        Update: {
          conflict_type?: Database["public"]["Enums"]["conflict_type"]
          created_at?: string
          event_id?: string | null
          id?: string
          resolved?: boolean
          severity?: Database["public"]["Enums"]["conflict_severity"]
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_conflicts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "schedule_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_conflicts_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          role: string | null
          source_doc_id: string | null
          tour_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          source_doc_id?: string | null
          tour_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          source_doc_id?: string | null
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_source_doc_id_fkey"
            columns: ["source_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          file_path: string | null
          filename: string | null
          id: string
          is_active: boolean
          raw_text: string | null
          tour_id: string
          version: number
        }
        Insert: {
          created_at?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          file_path?: string | null
          filename?: string | null
          id?: string
          is_active?: boolean
          raw_text?: string | null
          tour_id: string
          version?: number
        }
        Update: {
          created_at?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          file_path?: string | null
          filename?: string | null
          id?: string
          is_active?: boolean
          raw_text?: string | null
          tour_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_lines: {
        Row: {
          amount: number | null
          category: string | null
          created_at: string
          id: string
          line_date: string | null
          tour_id: string
          venue: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          created_at?: string
          id?: string
          line_date?: string | null
          tour_id: string
          venue?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          created_at?: string
          id?: string
          line_date?: string | null
          tour_id?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_lines_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_gaps: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          question: string
          resolved: boolean
          tour_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          question: string
          resolved?: boolean
          tour_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          question?: string
          resolved?: boolean
          tour_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_gaps_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      schedule_events: {
        Row: {
          city: string | null
          confidence_score: number | null
          created_at: string
          end_time: string | null
          event_date: string | null
          id: string
          load_in: string | null
          notes: string | null
          show_time: string | null
          source_doc_id: string | null
          tour_id: string
          venue: string | null
        }
        Insert: {
          city?: string | null
          confidence_score?: number | null
          created_at?: string
          end_time?: string | null
          event_date?: string | null
          id?: string
          load_in?: string | null
          notes?: string | null
          show_time?: string | null
          source_doc_id?: string | null
          tour_id: string
          venue?: string | null
        }
        Update: {
          city?: string | null
          confidence_score?: number | null
          created_at?: string
          end_time?: string | null
          event_date?: string | null
          id?: string
          load_in?: string | null
          notes?: string | null
          show_time?: string | null
          source_doc_id?: string | null
          tour_id?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_events_source_doc_id_fkey"
            columns: ["source_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_events_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_inbound: {
        Row: {
          created_at: string
          from_phone: string
          id: string
          message_text: string
          tour_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          from_phone: string
          id?: string
          message_text: string
          tour_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          from_phone?: string
          id?: string
          message_text?: string
          tour_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_inbound_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_outbound: {
        Row: {
          created_at: string
          id: string
          message_text: string
          status: Database["public"]["Enums"]["sms_status"]
          to_phone: string
          tour_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_text: string
          status?: Database["public"]["Enums"]["sms_status"]
          to_phone: string
          tour_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_text?: string
          status?: Database["public"]["Enums"]["sms_status"]
          to_phone?: string
          tour_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_outbound_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["tour_role"]
          tour_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["tour_role"]
          tour_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["tour_role"]
          tour_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_members_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          akb_state: Database["public"]["Enums"]["akb_state"]
          created_at: string
          id: string
          name: string
          owner_id: string
          status: Database["public"]["Enums"]["tour_status"]
        }
        Insert: {
          akb_state?: Database["public"]["Enums"]["akb_state"]
          created_at?: string
          id?: string
          name: string
          owner_id: string
          status?: Database["public"]["Enums"]["tour_status"]
        }
        Update: {
          akb_state?: Database["public"]["Enums"]["akb_state"]
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          status?: Database["public"]["Enums"]["tour_status"]
        }
        Relationships: []
      }
      travel_windows: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          start_date: string | null
          tour_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          start_date?: string | null
          tour_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          start_date?: string | null
          tour_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_windows_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_tour_admin_or_mgmt: { Args: { _tour_id: string }; Returns: boolean }
      is_tour_member: { Args: { _tour_id: string }; Returns: boolean }
    }
    Enums: {
      akb_state: "BUILDING" | "SOVEREIGN" | "CONFLICT"
      conflict_severity: "LOW" | "MEDIUM" | "HIGH"
      conflict_type:
        | "OVERLAP_SHOW_TIMES"
        | "MISSING_LOAD_IN"
        | "TRAVEL_OVERLAP_EVENT"
        | "DUPLICATE_VENUE_SAME_DATE"
        | "DATE_PARSE_AMBIGUITY"
        | "DUPLICATE_CONTACT_DIFFERENT_ROLE"
        | "MISSING_REQUIRED_FIELDS"
      doc_type:
        | "SCHEDULE"
        | "CONTACTS"
        | "RUN_OF_SHOW"
        | "TECH"
        | "FINANCE"
        | "TRAVEL"
        | "LOGISTICS"
        | "HOSPITALITY"
        | "CAST"
        | "VENUE"
        | "UNKNOWN"
      sms_status: "queued" | "sent" | "failed"
      tour_role: "TA" | "MGMT" | "CREW"
      tour_status: "ACTIVE" | "ARCHIVED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      akb_state: ["BUILDING", "SOVEREIGN", "CONFLICT"],
      conflict_severity: ["LOW", "MEDIUM", "HIGH"],
      conflict_type: [
        "OVERLAP_SHOW_TIMES",
        "MISSING_LOAD_IN",
        "TRAVEL_OVERLAP_EVENT",
        "DUPLICATE_VENUE_SAME_DATE",
        "DATE_PARSE_AMBIGUITY",
        "DUPLICATE_CONTACT_DIFFERENT_ROLE",
        "MISSING_REQUIRED_FIELDS",
      ],
      doc_type: [
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
        "UNKNOWN",
      ],
      sms_status: ["queued", "sent", "failed"],
      tour_role: ["TA", "MGMT", "CREW"],
      tour_status: ["ACTIVE", "ARCHIVED"],
    },
  },
} as const
