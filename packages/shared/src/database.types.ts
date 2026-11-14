export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      agreement_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
          version: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agreement_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agreements: {
        Row: {
          created_at: string
          id: string
          pdf_path: string | null
          rental_id: string
          signature_path: string | null
          signed_at: string | null
          terms_hash: string | null
          terms_snapshot: Json
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          pdf_path?: string | null
          rental_id: string
          signature_path?: string | null
          signed_at?: string | null
          terms_hash?: string | null
          terms_snapshot: Json
          updated_at?: string
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          pdf_path?: string | null
          rental_id?: string
          signature_path?: string | null
          signed_at?: string | null
          terms_hash?: string | null
          terms_snapshot?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agreements_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          at: string
          before: Json | null
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      booking_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          pickup_location_id: string | null
          scooter_id: string | null
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          pickup_location_id?: string | null
          scooter_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          pickup_location_id?: string | null
          scooter_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "pickup_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_scooter_id_fkey"
            columns: ["scooter_id"]
            isOneToOne: false
            referencedRelation: "scooters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      handover_records: {
        Row: {
          accessories: string | null
          battery_condition: string | null
          charger_ok: boolean | null
          created_at: string
          customer_ack_at: string | null
          damage_notes: string | null
          id: string
          kind: Database["public"]["Enums"]["handover_kind"]
          outstanding_amount: number
          photo_paths: string[]
          recorded_by: string | null
          rental_id: string
          scooter_condition: string | null
          updated_at: string
        }
        Insert: {
          accessories?: string | null
          battery_condition?: string | null
          charger_ok?: boolean | null
          created_at?: string
          customer_ack_at?: string | null
          damage_notes?: string | null
          id?: string
          kind: Database["public"]["Enums"]["handover_kind"]
          outstanding_amount?: number
          photo_paths?: string[]
          recorded_by?: string | null
          rental_id: string
          scooter_condition?: string | null
          updated_at?: string
        }
        Update: {
          accessories?: string | null
          battery_condition?: string | null
          charger_ok?: boolean | null
          created_at?: string
          customer_ack_at?: string | null
          damage_notes?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["handover_kind"]
          outstanding_amount?: number
          photo_paths?: string[]
          recorded_by?: string | null
          rental_id?: string
          scooter_condition?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "handover_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_records_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_documents: {
        Row: {
          created_at: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          file_path: string
          id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["doc_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          file_path: string
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          file_path?: string
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          channel: string
          created_at: string
          data: Json
          id: string
          push_error: string | null
          push_sent_at: string | null
          read_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          data?: Json
          id?: string
          push_error?: string | null
          push_sent_at?: string | null
          read_at?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          data?: Json
          id?: string
          push_error?: string | null
          push_sent_at?: string | null
          read_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          branch_id: string | null
          created_at: string
          failure_reason: string | null
          id: string
          late_fee_amount: number
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          receipt_no: string | null
          receipt_path: string | null
          recorded_by: string | null
          rental_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          type: Database["public"]["Enums"]["payment_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          branch_id?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          late_fee_amount?: number
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          receipt_no?: string | null
          receipt_path?: string | null
          recorded_by?: string | null
          rental_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          type?: Database["public"]["Enums"]["payment_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          late_fee_amount?: number
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          receipt_no?: string | null
          receipt_path?: string | null
          recorded_by?: string | null
          rental_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          type?: Database["public"]["Enums"]["payment_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_locations: {
        Row: {
          address: string
          branch_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          address: string
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          address?: string
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_locations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          consent_at: string | null
          created_at: string
          deletion_requested_at: string | null
          delivery_platform:
            | Database["public"]["Enums"]["delivery_platform"]
            | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          fcm_token: string | null
          full_name: string | null
          id: string
          is_active: boolean
          kyc_reject_reason: string | null
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          phone: string | null
          photo_path: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          consent_at?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          delivery_platform?:
            | Database["public"]["Enums"]["delivery_platform"]
            | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          fcm_token?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          kyc_reject_reason?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          phone?: string | null
          photo_path?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          consent_at?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          delivery_platform?:
            | Database["public"]["Enums"]["delivery_platform"]
            | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          fcm_token?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          kyc_reject_reason?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          phone?: string | null
          photo_path?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      rentals: {
        Row: {
          booking_request_id: string | null
          branch_id: string | null
          created_at: string
          deposit_amount: number
          end_reason: string | null
          ended_at: string | null
          id: string
          next_due_date: string | null
          pickup_location_id: string | null
          renewal_block_reason: string | null
          renewal_blocked: boolean
          scooter_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["rental_status"]
          updated_at: string
          user_id: string
          weekly_rent: number
        }
        Insert: {
          booking_request_id?: string | null
          branch_id?: string | null
          created_at?: string
          deposit_amount?: number
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          next_due_date?: string | null
          pickup_location_id?: string | null
          renewal_block_reason?: string | null
          renewal_blocked?: boolean
          scooter_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["rental_status"]
          updated_at?: string
          user_id: string
          weekly_rent: number
        }
        Update: {
          booking_request_id?: string | null
          branch_id?: string | null
          created_at?: string
          deposit_amount?: number
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          next_due_date?: string | null
          pickup_location_id?: string | null
          renewal_block_reason?: string | null
          renewal_blocked?: boolean
          scooter_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["rental_status"]
          updated_at?: string
          user_id?: string
          weekly_rent?: number
        }
        Relationships: [
          {
            foreignKeyName: "rentals_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "pickup_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_scooter_id_fkey"
            columns: ["scooter_id"]
            isOneToOne: false
            referencedRelation: "scooters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scooters: {
        Row: {
          battery_details: string | null
          battery_no: string | null
          branch_id: string | null
          chassis_no: string | null
          code: string
          created_at: string
          id: string
          maintenance_notes: string | null
          model: string
          motor_no: string | null
          photo_paths: string[]
          status: Database["public"]["Enums"]["scooter_status"]
          updated_at: string
          weekly_rent: number | null
        }
        Insert: {
          battery_details?: string | null
          battery_no?: string | null
          branch_id?: string | null
          chassis_no?: string | null
          code: string
          created_at?: string
          id?: string
          maintenance_notes?: string | null
          model: string
          motor_no?: string | null
          photo_paths?: string[]
          status?: Database["public"]["Enums"]["scooter_status"]
          updated_at?: string
          weekly_rent?: number | null
        }
        Update: {
          battery_details?: string | null
          battery_no?: string | null
          branch_id?: string | null
          chassis_no?: string | null
          code?: string
          created_at?: string
          id?: string
          maintenance_notes?: string | null
          model?: string
          motor_no?: string | null
          photo_paths?: string[]
          status?: Database["public"]["Enums"]["scooter_status"]
          updated_at?: string
          weekly_rent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scooters_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          admin_notes: string | null
          assigned_to: string | null
          category: Database["public"]["Enums"]["service_category"]
          created_at: string
          description: string
          id: string
          photo_paths: string[]
          rental_id: string | null
          status: Database["public"]["Enums"]["service_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          assigned_to?: string | null
          category: Database["public"]["Enums"]["service_category"]
          created_at?: string
          description: string
          id?: string
          photo_paths?: string[]
          rental_id?: string | null
          status?: Database["public"]["Enums"]["service_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["service_category"]
          created_at?: string
          description?: string
          id?: string
          photo_paths?: string[]
          rental_id?: string | null
          status?: Database["public"]["Enums"]["service_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_rental_id_fkey"
            columns: ["rental_id"]
            isOneToOne: false
            referencedRelation: "rentals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          company_address: string | null
          company_cin: string | null
          company_gstin: string | null
          company_name: string
          created_at: string
          deposit_amount: number
          grace_days: number
          id: number
          late_fee_per_day: number
          support_email: string | null
          support_phone: string | null
          support_whatsapp: string | null
          updated_at: string
          weekly_rent: number
        }
        Insert: {
          company_address?: string | null
          company_cin?: string | null
          company_gstin?: string | null
          company_name?: string
          created_at?: string
          deposit_amount?: number
          grace_days?: number
          id?: number
          late_fee_per_day?: number
          support_email?: string | null
          support_phone?: string | null
          support_whatsapp?: string | null
          updated_at?: string
          weekly_rent?: number
        }
        Update: {
          company_address?: string | null
          company_cin?: string | null
          company_gstin?: string | null
          company_name?: string
          created_at?: string
          deposit_amount?: number
          grace_days?: number
          id?: number
          late_fee_per_day?: number
          support_email?: string | null
          support_phone?: string | null
          support_whatsapp?: string | null
          updated_at?: string
          weekly_rent?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decide_kyc: {
        Args: { p_approve: boolean; p_reason?: string; p_user: string }
        Returns: undefined
      }
      enter_trusted: { Args: never; Returns: undefined }
      has_role: {
        Args: { roles: Database["public"]["Enums"]["user_role"][] }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
      is_trusted_context: { Args: never; Returns: boolean }
      notify: {
        Args: {
          p_body: string
          p_channel?: string
          p_data?: Json
          p_title: string
          p_user: string
        }
        Returns: string
      }
      record_consent: { Args: never; Returns: undefined }
      request_account_deletion: { Args: never; Returns: undefined }
      require_staff: { Args: never; Returns: undefined }
      review_kyc_document: {
        Args: { p_approve: boolean; p_doc: string; p_note?: string }
        Returns: undefined
      }
      set_customer_active: {
        Args: { p_active: boolean; p_user: string }
        Returns: undefined
      }
      storage_owner_folder: { Args: { object_name: string }; Returns: boolean }
      submit_kyc: {
        Args: never
        Returns: Database["public"]["Enums"]["kyc_status"]
      }
    }
    Enums: {
      booking_status: "pending" | "approved" | "rejected" | "cancelled"
      delivery_platform:
        | "blinkit"
        | "zepto"
        | "swiggy_instamart"
        | "swiggy"
        | "zomato"
        | "other"
      doc_status: "pending" | "approved" | "rejected"
      doc_type:
        | "aadhaar"
        | "pan"
        | "address_proof"
        | "driving_licence"
        | "other"
      handover_kind: "handover" | "return"
      kyc_status:
        | "not_submitted"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
      payment_method: "upi_gateway" | "cash" | "offline_upi" | "bank"
      payment_status: "created" | "paid" | "failed" | "refunded"
      payment_type: "rent" | "deposit" | "late_fee" | "other"
      rental_status:
        | "pending_agreement"
        | "pending_handover"
        | "active"
        | "overdue"
        | "returned"
        | "terminated"
      scooter_status:
        | "available"
        | "reserved"
        | "rented"
        | "under_maintenance"
        | "retired"
      service_category:
        | "battery"
        | "charging"
        | "motor"
        | "brakes"
        | "tyres"
        | "complaint"
        | "other"
      service_status:
        | "open"
        | "assigned"
        | "in_progress"
        | "resolved"
        | "closed"
      user_role: "customer" | "staff" | "manager" | "owner"
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
      booking_status: ["pending", "approved", "rejected", "cancelled"],
      delivery_platform: [
        "blinkit",
        "zepto",
        "swiggy_instamart",
        "swiggy",
        "zomato",
        "other",
      ],
      doc_status: ["pending", "approved", "rejected"],
      doc_type: ["aadhaar", "pan", "address_proof", "driving_licence", "other"],
      handover_kind: ["handover", "return"],
      kyc_status: [
        "not_submitted",
        "submitted",
        "under_review",
        "approved",
        "rejected",
      ],
      payment_method: ["upi_gateway", "cash", "offline_upi", "bank"],
      payment_status: ["created", "paid", "failed", "refunded"],
      payment_type: ["rent", "deposit", "late_fee", "other"],
      rental_status: [
        "pending_agreement",
        "pending_handover",
        "active",
        "overdue",
        "returned",
        "terminated",
      ],
      scooter_status: [
        "available",
        "reserved",
        "rented",
        "under_maintenance",
        "retired",
      ],
      service_category: [
        "battery",
        "charging",
        "motor",
        "brakes",
        "tyres",
        "complaint",
        "other",
      ],
      service_status: ["open", "assigned", "in_progress", "resolved", "closed"],
      user_role: ["customer", "staff", "manager", "owner"],
    },
  },
} as const

