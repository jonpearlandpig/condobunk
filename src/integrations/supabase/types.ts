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
      akb_change_log: {
        Row: {
          action: string
          affects_money: boolean
          affects_safety: boolean
          affects_time: boolean
          change_detail: Json | null
          change_reason: string | null
          change_summary: string | null
          created_at: string
          entity_id: string
          entity_type: string
          event_date: string | null
          id: string
          notified: boolean
          severity: string
          tour_id: string
          user_id: string
        }
        Insert: {
          action: string
          affects_money?: boolean
          affects_safety?: boolean
          affects_time?: boolean
          change_detail?: Json | null
          change_reason?: string | null
          change_summary?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          event_date?: string | null
          id?: string
          notified?: boolean
          severity?: string
          tour_id: string
          user_id: string
        }
        Update: {
          action?: string
          affects_money?: boolean
          affects_safety?: boolean
          affects_time?: boolean
          change_detail?: Json | null
          change_reason?: string | null
          change_summary?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_date?: string | null
          id?: string
          notified?: boolean
          severity?: string
          tour_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "akb_change_log_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
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
          metadata: Json | null
          name: string
          phone: string | null
          role: string | null
          scope: Database["public"]["Enums"]["contact_scope"]
          source_doc_id: string | null
          tour_id: string
          venue: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json | null
          name: string
          phone?: string | null
          role?: string | null
          scope?: Database["public"]["Enums"]["contact_scope"]
          source_doc_id?: string | null
          tour_id: string
          venue?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          phone?: string | null
          role?: string | null
          scope?: Database["public"]["Enums"]["contact_scope"]
          source_doc_id?: string | null
          tour_id?: string
          venue?: string | null
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
      demo_activations: {
        Row: {
          activated_at: string
          deactivated_at: string | null
          expires_at: string
          id: string
          user_email: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          activated_at?: string
          deactivated_at?: string | null
          expires_at?: string
          id?: string
          user_email?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          activated_at?: string
          deactivated_at?: string | null
          expires_at?: string
          id?: string
          user_email?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          created_at: string
          id: string
          message_text: string
          read_at: string | null
          recipient_id: string
          sender_id: string
          tour_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_text: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
          tour_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_text?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          archived_at: string | null
          created_at: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          file_path: string | null
          filename: string | null
          id: string
          is_active: boolean
          raw_text: string | null
          replaces_doc_id: string | null
          tour_id: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          file_path?: string | null
          filename?: string | null
          id?: string
          is_active?: boolean
          raw_text?: string | null
          replaces_doc_id?: string | null
          tour_id: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          file_path?: string | null
          filename?: string | null
          id?: string
          is_active?: boolean
          raw_text?: string | null
          replaces_doc_id?: string | null
          tour_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_replaces_doc_id_fkey"
            columns: ["replaces_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reminders: {
        Row: {
          created_at: string
          enabled: boolean
          event_id: string
          id: string
          phone: string
          remind_before_minutes: number
          remind_type: string
          tour_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          event_id: string
          id?: string
          phone: string
          remind_before_minutes?: number
          remind_type?: string
          tour_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          event_id?: string
          id?: string
          phone?: string
          remind_before_minutes?: number
          remind_type?: string
          tour_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "schedule_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reminders_tour_id_fkey"
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
      guest_list_allotments: {
        Row: {
          auto_notify_box_office: boolean
          box_office_email: string | null
          box_office_phone: string | null
          city: string | null
          created_at: string
          created_by: string
          deadline: string | null
          event_date: string
          event_id: string | null
          id: string
          per_person_max: number
          pickup_instructions: string | null
          total_tickets: number
          tour_id: string
          venue: string
        }
        Insert: {
          auto_notify_box_office?: boolean
          box_office_email?: string | null
          box_office_phone?: string | null
          city?: string | null
          created_at?: string
          created_by: string
          deadline?: string | null
          event_date: string
          event_id?: string | null
          id?: string
          per_person_max?: number
          pickup_instructions?: string | null
          total_tickets?: number
          tour_id: string
          venue: string
        }
        Update: {
          auto_notify_box_office?: boolean
          box_office_email?: string | null
          box_office_phone?: string | null
          city?: string | null
          created_at?: string
          created_by?: string
          deadline?: string | null
          event_date?: string
          event_id?: string | null
          id?: string
          per_person_max?: number
          pickup_instructions?: string | null
          total_tickets?: number
          tour_id?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_list_allotments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "schedule_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_list_allotments_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_list_requests: {
        Row: {
          allotment_id: string | null
          approved_by: string | null
          created_at: string
          guest_names: string
          id: string
          pickup_info_sent: boolean
          requester_name: string | null
          requester_phone: string | null
          requester_user_id: string | null
          resolved_at: string | null
          status: string
          status_reason: string | null
          ticket_count: number
          tour_id: string
        }
        Insert: {
          allotment_id?: string | null
          approved_by?: string | null
          created_at?: string
          guest_names: string
          id?: string
          pickup_info_sent?: boolean
          requester_name?: string | null
          requester_phone?: string | null
          requester_user_id?: string | null
          resolved_at?: string | null
          status?: string
          status_reason?: string | null
          ticket_count?: number
          tour_id: string
        }
        Update: {
          allotment_id?: string | null
          approved_by?: string | null
          created_at?: string
          guest_names?: string
          id?: string
          pickup_info_sent?: boolean
          requester_name?: string | null
          requester_phone?: string | null
          requester_user_id?: string | null
          resolved_at?: string | null
          status?: string
          status_reason?: string | null
          ticket_count?: number
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_list_requests_allotment_id_fkey"
            columns: ["allotment_id"]
            isOneToOne: false
            referencedRelation: "guest_list_allotments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_list_requests_tour_id_fkey"
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
      notification_preferences: {
        Row: {
          created_at: string
          day_window: number
          id: string
          min_severity: string
          money_always: boolean
          notify_contact_changes: boolean
          notify_finance_changes: boolean
          notify_schedule_changes: boolean
          notify_venue_changes: boolean
          safety_always: boolean
          time_always: boolean
          tour_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_window?: number
          id?: string
          min_severity?: string
          money_always?: boolean
          notify_contact_changes?: boolean
          notify_finance_changes?: boolean
          notify_schedule_changes?: boolean
          notify_venue_changes?: boolean
          safety_always?: boolean
          time_always?: boolean
          tour_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_window?: number
          id?: string
          min_severity?: string
          money_always?: boolean
          notify_contact_changes?: boolean
          notify_finance_changes?: boolean
          notify_schedule_changes?: boolean
          notify_venue_changes?: boolean
          safety_always?: boolean
          time_always?: boolean
          tour_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          hand_preference: string | null
          id: string
          phone: string | null
          telauthorium_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          hand_preference?: string | null
          id: string
          phone?: string | null
          telauthorium_id?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          hand_preference?: string | null
          id?: string
          phone?: string | null
          telauthorium_id?: string
        }
        Relationships: []
      }
      schedule_events: {
        Row: {
          city: string | null
          confidence_score: number | null
          created_at: string
          created_by: string | null
          curfew: string | null
          doors: string | null
          end_time: string | null
          event_date: string | null
          id: string
          is_stop_override: boolean
          load_in: string | null
          notes: string | null
          show_time: string | null
          soundcheck: string | null
          source_doc_id: string | null
          tour_id: string
          updated_at: string
          updated_by: string | null
          venue: string | null
        }
        Insert: {
          city?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          curfew?: string | null
          doors?: string | null
          end_time?: string | null
          event_date?: string | null
          id?: string
          is_stop_override?: boolean
          load_in?: string | null
          notes?: string | null
          show_time?: string | null
          soundcheck?: string | null
          source_doc_id?: string | null
          tour_id: string
          updated_at?: string
          updated_by?: string | null
          venue?: string | null
        }
        Update: {
          city?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          curfew?: string | null
          doors?: string | null
          end_time?: string | null
          event_date?: string | null
          id?: string
          is_stop_override?: boolean
          load_in?: string | null
          notes?: string | null
          show_time?: string | null
          soundcheck?: string | null
          source_doc_id?: string | null
          tour_id?: string
          updated_at?: string
          updated_by?: string | null
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
      scheduled_messages: {
        Row: {
          created_at: string
          id: string
          is_self: boolean
          message_text: string
          send_at: string
          sent: boolean
          to_phone: string
          tour_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_self?: boolean
          message_text: string
          send_at: string
          sent?: boolean
          to_phone: string
          tour_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_self?: boolean
          message_text?: string
          send_at?: string
          sent?: boolean
          to_phone?: string
          tour_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      sent_reminders: {
        Row: {
          event_id: string
          id: string
          phone: string
          remind_type: string
          reminder_id: string | null
          sent_at: string
        }
        Insert: {
          event_id: string
          id?: string
          phone: string
          remind_type: string
          reminder_id?: string | null
          sent_at?: string
        }
        Update: {
          event_id?: string
          id?: string
          phone?: string
          remind_type?: string
          reminder_id?: string | null
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sent_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "schedule_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sent_reminders_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "event_reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      site_inquiries: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
        }
        Relationships: []
      }
      sms_inbound: {
        Row: {
          category: string
          created_at: string
          from_phone: string
          id: string
          message_text: string
          sender_name: string | null
          tour_id: string | null
          user_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          from_phone: string
          id?: string
          message_text: string
          sender_name?: string | null
          tour_id?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          from_phone?: string
          id?: string
          message_text?: string
          sender_name?: string | null
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
      sync_logs: {
        Row: {
          conflicts_created: number | null
          contacts_upserted: number | null
          error_message: string | null
          events_upserted: number | null
          finance_upserted: number | null
          finished_at: string | null
          gaps_created: number | null
          id: string
          integration_id: string
          raw_payload: Json | null
          started_at: string
          status: Database["public"]["Enums"]["sync_status"]
          tour_id: string
        }
        Insert: {
          conflicts_created?: number | null
          contacts_upserted?: number | null
          error_message?: string | null
          events_upserted?: number | null
          finance_upserted?: number | null
          finished_at?: string | null
          gaps_created?: number | null
          id?: string
          integration_id: string
          raw_payload?: Json | null
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          tour_id: string
        }
        Update: {
          conflicts_created?: number | null
          contacts_upserted?: number | null
          error_message?: string | null
          events_upserted?: number | null
          finance_upserted?: number | null
          finished_at?: string | null
          gaps_created?: number | null
          id?: string
          integration_id?: string
          raw_payload?: Json | null
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          tour_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "tour_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_logs_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tela_action_log: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          outcome: string
          tour_id: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          outcome: string
          tour_id: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          outcome?: string
          tour_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tela_action_log_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tela_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tela_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "tela_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      tela_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          tour_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          tour_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          tour_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tela_threads_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tldr_cache: {
        Row: {
          generated_at: string
          id: string
          lines: Json
          tour_ids: string
          user_id: string
        }
        Insert: {
          generated_at?: string
          id?: string
          lines?: Json
          tour_ids: string
          user_id: string
        }
        Update: {
          generated_at?: string
          id?: string
          lines?: Json
          tour_ids?: string
          user_id?: string
        }
        Relationships: []
      }
      tour_escalation_tags: {
        Row: {
          created_at: string
          id: string
          route_to_contact: string | null
          route_to_role: string | null
          source_doc_id: string | null
          tag: string
          tour_id: string
          trigger_topic: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          route_to_contact?: string | null
          route_to_role?: string | null
          source_doc_id?: string | null
          tag: string
          tour_id: string
          trigger_topic?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          route_to_contact?: string | null
          route_to_role?: string | null
          source_doc_id?: string | null
          tag?: string
          tour_id?: string
          trigger_topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_escalation_tags_source_doc_id_fkey"
            columns: ["source_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_escalation_tags_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_integrations: {
        Row: {
          api_key_encrypted: string | null
          api_secret_encrypted: string | null
          config: Json | null
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          last_sync_at: string | null
          last_sync_status: Database["public"]["Enums"]["sync_status"]
          provider: Database["public"]["Enums"]["integration_provider"]
          tour_id: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          api_key_encrypted?: string | null
          api_secret_encrypted?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_sync_at?: string | null
          last_sync_status?: Database["public"]["Enums"]["sync_status"]
          provider: Database["public"]["Enums"]["integration_provider"]
          tour_id: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          api_key_encrypted?: string | null
          api_secret_encrypted?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_sync_at?: string | null
          last_sync_status?: Database["public"]["Enums"]["sync_status"]
          provider?: Database["public"]["Enums"]["integration_provider"]
          tour_id?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_integrations_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_invites: {
        Row: {
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["tour_role"]
          token: string
          tour_id: string
          tour_name: string | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          email: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["tour_role"]
          token?: string
          tour_id: string
          tour_name?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["tour_role"]
          token?: string
          tour_id?: string
          tour_name?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_invites_tour_id_fkey"
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
          {
            foreignKeyName: "tour_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_metadata: {
        Row: {
          akb_id: string | null
          akb_purpose: string | null
          artist: string | null
          authority: string | null
          change_policy: string | null
          created_at: string
          date_range_end: string | null
          date_range_start: string | null
          id: string
          primary_interface: string | null
          region: string | null
          season: string | null
          showtime_standard: string | null
          source_doc_id: string | null
          tour_code: string | null
          tour_id: string
          updated_at: string
        }
        Insert: {
          akb_id?: string | null
          akb_purpose?: string | null
          artist?: string | null
          authority?: string | null
          change_policy?: string | null
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          id?: string
          primary_interface?: string | null
          region?: string | null
          season?: string | null
          showtime_standard?: string | null
          source_doc_id?: string | null
          tour_code?: string | null
          tour_id: string
          updated_at?: string
        }
        Update: {
          akb_id?: string | null
          akb_purpose?: string | null
          artist?: string | null
          authority?: string | null
          change_policy?: string | null
          created_at?: string
          date_range_end?: string | null
          date_range_start?: string | null
          id?: string
          primary_interface?: string | null
          region?: string | null
          season?: string | null
          showtime_standard?: string | null
          source_doc_id?: string | null
          tour_code?: string | null
          tour_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_metadata_source_doc_id_fkey"
            columns: ["source_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_metadata_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: true
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_notification_defaults: {
        Row: {
          created_at: string
          day_window: number
          id: string
          min_severity: string
          notify_contact_changes: boolean
          notify_finance_changes: boolean
          notify_schedule_changes: boolean
          notify_venue_changes: boolean
          tour_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_window?: number
          id?: string
          min_severity?: string
          notify_contact_changes?: boolean
          notify_finance_changes?: boolean
          notify_schedule_changes?: boolean
          notify_venue_changes?: boolean
          tour_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_window?: number
          id?: string
          min_severity?: string
          notify_contact_changes?: boolean
          notify_finance_changes?: boolean
          notify_schedule_changes?: boolean
          notify_venue_changes?: boolean
          tour_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_notification_defaults_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: true
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_policies: {
        Row: {
          created_at: string
          id: string
          policy_data: Json
          policy_type: Database["public"]["Enums"]["policy_type"]
          source_doc_id: string | null
          tour_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          policy_data?: Json
          policy_type: Database["public"]["Enums"]["policy_type"]
          source_doc_id?: string | null
          tour_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          policy_data?: Json
          policy_type?: Database["public"]["Enums"]["policy_type"]
          source_doc_id?: string | null
          tour_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_policies_source_doc_id_fkey"
            columns: ["source_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_policies_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_routing: {
        Row: {
          bus_notes: string | null
          city: string | null
          confirmed: boolean
          created_at: string
          event_date: string | null
          hotel_checkin: string | null
          hotel_checkout: string | null
          hotel_confirmation: string | null
          hotel_name: string | null
          id: string
          routing_notes: string | null
          source_doc_id: string | null
          tour_id: string
          truck_notes: string | null
        }
        Insert: {
          bus_notes?: string | null
          city?: string | null
          confirmed?: boolean
          created_at?: string
          event_date?: string | null
          hotel_checkin?: string | null
          hotel_checkout?: string | null
          hotel_confirmation?: string | null
          hotel_name?: string | null
          id?: string
          routing_notes?: string | null
          source_doc_id?: string | null
          tour_id: string
          truck_notes?: string | null
        }
        Update: {
          bus_notes?: string | null
          city?: string | null
          confirmed?: boolean
          created_at?: string
          event_date?: string | null
          hotel_checkin?: string | null
          hotel_checkout?: string | null
          hotel_confirmation?: string | null
          hotel_name?: string | null
          id?: string
          routing_notes?: string | null
          source_doc_id?: string | null
          tour_id?: string
          truck_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tour_routing_source_doc_id_fkey"
            columns: ["source_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_routing_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_travel: {
        Row: {
          arrival: string | null
          confirmation: string | null
          created_at: string
          departure: string | null
          description: string | null
          hotel_checkin: string | null
          hotel_checkout: string | null
          hotel_name: string | null
          id: string
          portal_url: string | null
          source_doc_id: string | null
          special_notices: string | null
          tour_id: string
          travel_date: string | null
          travel_type: Database["public"]["Enums"]["travel_type"]
        }
        Insert: {
          arrival?: string | null
          confirmation?: string | null
          created_at?: string
          departure?: string | null
          description?: string | null
          hotel_checkin?: string | null
          hotel_checkout?: string | null
          hotel_name?: string | null
          id?: string
          portal_url?: string | null
          source_doc_id?: string | null
          special_notices?: string | null
          tour_id: string
          travel_date?: string | null
          travel_type?: Database["public"]["Enums"]["travel_type"]
        }
        Update: {
          arrival?: string | null
          confirmation?: string | null
          created_at?: string
          departure?: string | null
          description?: string | null
          hotel_checkin?: string | null
          hotel_checkout?: string | null
          hotel_name?: string | null
          id?: string
          portal_url?: string | null
          source_doc_id?: string | null
          special_notices?: string | null
          tour_id?: string
          travel_date?: string | null
          travel_type?: Database["public"]["Enums"]["travel_type"]
        }
        Relationships: [
          {
            foreignKeyName: "tour_travel_source_doc_id_fkey"
            columns: ["source_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_travel_tour_id_fkey"
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
      upgrade_requests: {
        Row: {
          id: string
          requested_at: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          tour_id: string
          user_email: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          id?: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tour_id: string
          user_email?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          id?: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tour_id?: string
          user_email?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upgrade_requests_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      user_artifacts: {
        Row: {
          artifact_type: string
          content: string | null
          created_at: string
          id: string
          title: string
          tour_id: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          artifact_type?: string
          content?: string | null
          created_at?: string
          id?: string
          title: string
          tour_id?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          artifact_type?: string
          content?: string | null
          created_at?: string
          id?: string
          title?: string
          tour_id?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_artifacts_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      user_presence: {
        Row: {
          is_online: boolean
          last_active_at: string
          user_id: string
        }
        Insert: {
          is_online?: boolean
          last_active_at?: string
          user_id: string
        }
        Update: {
          is_online?: boolean
          last_active_at?: string
          user_id?: string
        }
        Relationships: []
      }
      venue_advance_notes: {
        Row: {
          city: string | null
          created_at: string
          event_date: string | null
          id: string
          normalized_venue_name: string
          source_doc_id: string | null
          tour_id: string
          updated_at: string
          van_data: Json
          venue_name: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          event_date?: string | null
          id?: string
          normalized_venue_name: string
          source_doc_id?: string | null
          tour_id: string
          updated_at?: string
          van_data?: Json
          venue_name: string
        }
        Update: {
          city?: string | null
          created_at?: string
          event_date?: string | null
          id?: string
          normalized_venue_name?: string
          source_doc_id?: string | null
          tour_id?: string
          updated_at?: string
          van_data?: Json
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_advance_notes_source_doc_id_fkey"
            columns: ["source_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_advance_notes_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_risk_flags: {
        Row: {
          category: string
          created_at: string
          id: string
          resolved: boolean
          risk_detail: string | null
          risk_title: string
          severity: Database["public"]["Enums"]["risk_severity"]
          tech_spec_id: string
          tour_id: string
          venue_name: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          resolved?: boolean
          risk_detail?: string | null
          risk_title: string
          severity?: Database["public"]["Enums"]["risk_severity"]
          tech_spec_id: string
          tour_id: string
          venue_name: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          resolved?: boolean
          risk_detail?: string | null
          risk_title?: string
          severity?: Database["public"]["Enums"]["risk_severity"]
          tech_spec_id?: string
          tour_id?: string
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_risk_flags_tech_spec_id_fkey"
            columns: ["tech_spec_id"]
            isOneToOne: false
            referencedRelation: "venue_tech_specs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_risk_flags_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_scores: {
        Row: {
          compatibility_factors: Json | null
          compatibility_score: number | null
          created_at: string
          crew_stress_factors: Json | null
          crew_stress_score: number | null
          financial_factors: Json | null
          financial_sensitivity_score: number | null
          id: string
          risk_factors: Json | null
          risk_score: number | null
          tech_spec_id: string
          tour_id: string
          updated_at: string
          venue_name: string
        }
        Insert: {
          compatibility_factors?: Json | null
          compatibility_score?: number | null
          created_at?: string
          crew_stress_factors?: Json | null
          crew_stress_score?: number | null
          financial_factors?: Json | null
          financial_sensitivity_score?: number | null
          id?: string
          risk_factors?: Json | null
          risk_score?: number | null
          tech_spec_id: string
          tour_id: string
          updated_at?: string
          venue_name: string
        }
        Update: {
          compatibility_factors?: Json | null
          compatibility_score?: number | null
          created_at?: string
          crew_stress_factors?: Json | null
          crew_stress_score?: number | null
          financial_factors?: Json | null
          financial_sensitivity_score?: number | null
          id?: string
          risk_factors?: Json | null
          risk_score?: number | null
          tech_spec_id?: string
          tour_id?: string
          updated_at?: string
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_scores_tech_spec_id_fkey"
            columns: ["tech_spec_id"]
            isOneToOne: true
            referencedRelation: "venue_tech_specs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_scores_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_tech_specs: {
        Row: {
          ada_accessibility: Json | null
          comms_infrastructure: Json | null
          contact_chain_of_command: Json | null
          content_media_policy: Json | null
          created_at: string
          dock_load_in: Json | null
          environmental_conditions: Json | null
          financial_settlement: Json | null
          hospitality_catering: Json | null
          id: string
          insurance_liability: Json | null
          it_network: Json | null
          labor_union: Json | null
          lighting_audio: Json | null
          load_out_constraints: Json | null
          local_ordinances: Json | null
          normalized_venue_name: string
          permanent_installations: Json | null
          power: Json | null
          production_compatibility: Json | null
          rigging_system: Json | null
          safety_compliance: Json | null
          security_crowd_control: Json | null
          source_doc_id: string | null
          stage_specs: Json | null
          tour_id: string
          transportation_logistics: Json | null
          updated_at: string
          venue_history: Json | null
          venue_identity: Json | null
          venue_name: string
          wardrobe_laundry: Json | null
        }
        Insert: {
          ada_accessibility?: Json | null
          comms_infrastructure?: Json | null
          contact_chain_of_command?: Json | null
          content_media_policy?: Json | null
          created_at?: string
          dock_load_in?: Json | null
          environmental_conditions?: Json | null
          financial_settlement?: Json | null
          hospitality_catering?: Json | null
          id?: string
          insurance_liability?: Json | null
          it_network?: Json | null
          labor_union?: Json | null
          lighting_audio?: Json | null
          load_out_constraints?: Json | null
          local_ordinances?: Json | null
          normalized_venue_name: string
          permanent_installations?: Json | null
          power?: Json | null
          production_compatibility?: Json | null
          rigging_system?: Json | null
          safety_compliance?: Json | null
          security_crowd_control?: Json | null
          source_doc_id?: string | null
          stage_specs?: Json | null
          tour_id: string
          transportation_logistics?: Json | null
          updated_at?: string
          venue_history?: Json | null
          venue_identity?: Json | null
          venue_name: string
          wardrobe_laundry?: Json | null
        }
        Update: {
          ada_accessibility?: Json | null
          comms_infrastructure?: Json | null
          contact_chain_of_command?: Json | null
          content_media_policy?: Json | null
          created_at?: string
          dock_load_in?: Json | null
          environmental_conditions?: Json | null
          financial_settlement?: Json | null
          hospitality_catering?: Json | null
          id?: string
          insurance_liability?: Json | null
          it_network?: Json | null
          labor_union?: Json | null
          lighting_audio?: Json | null
          load_out_constraints?: Json | null
          local_ordinances?: Json | null
          normalized_venue_name?: string
          permanent_installations?: Json | null
          power?: Json | null
          production_compatibility?: Json | null
          rigging_system?: Json | null
          safety_compliance?: Json | null
          security_crowd_control?: Json | null
          source_doc_id?: string | null
          stage_specs?: Json | null
          tour_id?: string
          transportation_logistics?: Json | null
          updated_at?: string
          venue_history?: Json | null
          venue_identity?: Json | null
          venue_name?: string
          wardrobe_laundry?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_tech_specs_source_doc_id_fkey"
            columns: ["source_doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_tech_specs_tour_id_fkey"
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
      accept_tour_invite: { Args: { _token: string }; Returns: Json }
      activate_demo_mode: { Args: never; Returns: Json }
      approve_upgrade_request: {
        Args: { _request_id: string }
        Returns: boolean
      }
      claim_contact_tours: { Args: never; Returns: Json }
      cleanup_expired_demos: { Args: never; Returns: undefined }
      deactivate_demo_mode: { Args: never; Returns: boolean }
      deny_upgrade_request: { Args: { _request_id: string }; Returns: boolean }
      is_tour_admin_or_mgmt: { Args: { _tour_id: string }; Returns: boolean }
      is_tour_member: { Args: { _tour_id: string }; Returns: boolean }
      match_contact_tours: { Args: { _email: string }; Returns: string[] }
      remove_tour_member: {
        Args: { _target_user_id: string; _tour_id: string }
        Returns: boolean
      }
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
      contact_scope: "TOUR" | "VENUE"
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
      integration_provider: "MASTER_TOUR" | "GENERIC_WEBHOOK" | "CSV_IMPORT"
      policy_type:
        | "GUEST_COMP"
        | "SAFETY"
        | "SOP_PRODUCTION"
        | "SOP_AUDIO"
        | "SOP_LIGHTING_VIDEO"
        | "SOP_SECURITY"
        | "SOP_MERCH"
        | "SOP_VIP"
        | "SOP_HOSPITALITY"
        | "SOP_TRANSPORTATION"
      risk_severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      sms_status: "queued" | "sent" | "failed"
      sync_status: "IDLE" | "SYNCING" | "SUCCESS" | "FAILED"
      tour_role: "TA" | "MGMT" | "CREW" | "DEMO"
      tour_status: "ACTIVE" | "ARCHIVED"
      travel_type: "FLIGHT" | "BUS" | "VAN" | "HOTEL" | "REHEARSAL" | "OTHER"
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
      contact_scope: ["TOUR", "VENUE"],
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
      integration_provider: ["MASTER_TOUR", "GENERIC_WEBHOOK", "CSV_IMPORT"],
      policy_type: [
        "GUEST_COMP",
        "SAFETY",
        "SOP_PRODUCTION",
        "SOP_AUDIO",
        "SOP_LIGHTING_VIDEO",
        "SOP_SECURITY",
        "SOP_MERCH",
        "SOP_VIP",
        "SOP_HOSPITALITY",
        "SOP_TRANSPORTATION",
      ],
      risk_severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      sms_status: ["queued", "sent", "failed"],
      sync_status: ["IDLE", "SYNCING", "SUCCESS", "FAILED"],
      tour_role: ["TA", "MGMT", "CREW", "DEMO"],
      tour_status: ["ACTIVE", "ARCHIVED"],
      travel_type: ["FLIGHT", "BUS", "VAN", "HOTEL", "REHEARSAL", "OTHER"],
    },
  },
} as const
