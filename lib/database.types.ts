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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_configs: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          published_at: string | null
          status: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data: Json
          id?: string
          published_at?: string | null
          status: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          published_at?: string | null
          status?: string
          version?: number
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          config_version: number | null
          conversation_id: string | null
          created_at: string
          error: string | null
          id: string
          input: Json | null
          latency_ms: number | null
          output: string | null
          tokens_in: number | null
          tokens_out: number | null
          tool_calls: Json | null
        }
        Insert: {
          config_version?: number | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json | null
          latency_ms?: number | null
          output?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          tool_calls?: Json | null
        }
        Update: {
          config_version?: number | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json | null
          latency_ms?: number | null
          output?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          contact_id: string
          conversation_id: string | null
          created_at: string
          end_at: string
          google_event_id: string | null
          id: string
          meet_link: string | null
          modality: string
          notes: string | null
          service: string
          start_at: string
          status: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          conversation_id?: string | null
          created_at?: string
          end_at: string
          google_event_id?: string | null
          id?: string
          meet_link?: string | null
          modality: string
          notes?: string | null
          service: string
          start_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          conversation_id?: string | null
          created_at?: string
          end_at?: string
          google_event_id?: string | null
          id?: string
          meet_link?: string | null
          modality?: string
          notes?: string | null
          service?: string
          start_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          bsuid: string | null
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          phone: string | null
          updated_at: string
          username: string | null
          wa_id: string | null
        }
        Insert: {
          bsuid?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
          username?: string | null
          wa_id?: string | null
        }
        Update: {
          bsuid?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          updated_at?: string
          username?: string | null
          wa_id?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          bot_enabled: boolean
          contact_id: string
          created_at: string
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_processed_inbound_at: string | null
          needs_human: boolean
          processing_lock_until: string | null
          status: string
          summary: string | null
          unread_count: number
        }
        Insert: {
          bot_enabled?: boolean
          contact_id: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_processed_inbound_at?: string | null
          needs_human?: boolean
          processing_lock_until?: string | null
          status?: string
          summary?: string | null
          unread_count?: number
        }
        Update: {
          bot_enabled?: boolean
          contact_id?: string
          created_at?: string
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_processed_inbound_at?: string | null
          needs_human?: boolean
          processing_lock_until?: string | null
          status?: string
          summary?: string | null
          unread_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          actor: string
          created_at: string
          from_stage_id: string | null
          id: string
          lead_id: string
          payload: Json | null
          to_stage_id: string | null
          type: string
        }
        Insert: {
          actor: string
          created_at?: string
          from_stage_id?: string | null
          id?: string
          lead_id: string
          payload?: Json | null
          to_stage_id?: string | null
          type: string
        }
        Update: {
          actor?: string
          created_at?: string
          from_stage_id?: string | null
          id?: string
          lead_id?: string
          payload?: Json | null
          to_stage_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          invoices_per_month: number | null
          owner: string | null
          service_interest: string | null
          stage_id: string | null
          suggested_plan: string | null
          summary: string | null
          temperature: string | null
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          invoices_per_month?: number | null
          owner?: string | null
          service_interest?: string | null
          stage_id?: string | null
          suggested_plan?: string | null
          summary?: string | null
          temperature?: string | null
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          invoices_per_month?: number | null
          owner?: string | null
          service_interest?: string | null
          stage_id?: string | null
          suggested_plan?: string | null
          summary?: string | null
          temperature?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          direction: string
          error: string | null
          id: string
          media_id: string | null
          raw: Json | null
          received_at: string
          sender: string
          status: string
          storage_path: string | null
          transcript: string | null
          type: string
          wamid: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          media_id?: string | null
          raw?: Json | null
          received_at?: string
          sender: string
          status?: string
          storage_path?: string | null
          transcript?: string | null
          type: string
          wamid?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          media_id?: string | null
          raw?: Json | null
          received_at?: string
          sender?: string
          status?: string
          storage_path?: string | null
          transcript?: string | null
          type?: string
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          id: string
          is_lost: boolean
          is_won: boolean
          key: string
          name: string
          position: number
        }
        Insert: {
          id?: string
          is_lost?: boolean
          is_won?: boolean
          key: string
          name: string
          position: number
        }
        Update: {
          id?: string
          is_lost?: boolean
          is_won?: boolean
          key?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_conversation_lock: {
        Args: { p_conversation_id: string; p_lock_duration_seconds: number }
        Returns: boolean
      }
      ingest_inbound_message: {
        Args: {
          p_body?: string | null
          p_bsuid?: string | null
          p_media_id?: string | null
          p_name?: string | null
          p_phone?: string | null
          p_raw?: Json
          p_sent_at?: string
          p_type?: string
          p_username?: string | null
          p_wamid: string
        }
        Returns: {
          contact_id: string
          conversation_id: string
          is_new_message: boolean
        }[]
      }
      merge_contacts: {
        Args: { p_primary_contact_id: string; p_secondary_contact_id: string }
        Returns: string
      }
      release_conversation_lock: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      test_fn: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
