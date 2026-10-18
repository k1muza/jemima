// Generated from the live schema — regenerate with `npm run db:types` (see README).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      catalogues: {
        Row: {
          colour_filter: string[];
          created_at: string;
          created_by: string | null;
          department: string;
          hide_sold_out: boolean;
          id: string;
          layout: string;
          name: string;
          product_ids: string[] | null;
          show_colours: boolean;
          show_cover: boolean;
          show_prices: boolean;
          subtitle: string;
          theme: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          colour_filter?: string[];
          created_at?: string;
          created_by?: string | null;
          department?: string;
          hide_sold_out?: boolean;
          id?: string;
          layout?: string;
          name?: string;
          product_ids?: string[] | null;
          show_colours?: boolean;
          show_cover?: boolean;
          show_prices?: boolean;
          subtitle?: string;
          theme?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          colour_filter?: string[];
          created_at?: string;
          created_by?: string | null;
          department?: string;
          hide_sold_out?: boolean;
          id?: string;
          layout?: string;
          name?: string;
          product_ids?: string[] | null;
          show_colours?: boolean;
          show_cover?: boolean;
          show_prices?: boolean;
          subtitle?: string;
          theme?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      inventory_skus: {
        Row: {
          cost_override_cents: number | null;
          id: string;
          low_stock_threshold_override: number | null;
          price_override_cents: number | null;
          quantity_on_hand: number;
          size_id: string;
          updated_at: string;
          variant_id: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          cost_override_cents?: number | null;
          id?: string;
          low_stock_threshold_override?: number | null;
          price_override_cents?: number | null;
          quantity_on_hand?: number;
          size_id: string;
          updated_at?: string;
          variant_id: string;
          version?: number;
        };
        Update: {
          cost_override_cents?: number | null;
          id?: string;
          low_stock_threshold_override?: number | null;
          price_override_cents?: number | null;
          quantity_on_hand?: number;
          size_id?: string;
          updated_at?: string;
          variant_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_skus_size_id_fkey";
            columns: ["size_id"];
            isOneToOne: false;
            referencedRelation: "product_sizes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_skus_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      product_costs: {
        Row: {
          default_cost_cents: number;
          product_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          default_cost_cents?: number;
          product_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          default_cost_cents?: number;
          product_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_costs_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: true;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_images: {
        Row: {
          created_at: string;
          cutout_enhanced_path: string | null;
          cutout_path: string | null;
          detected_hex: string | null;
          enhanced_path: string | null;
          file_size: number | null;
          height: number | null;
          id: string;
          ironed_path: string | null;
          mask_path: string | null;
          mime_type: string | null;
          product_id: string;
          refined_enhanced_path: string | null;
          refined_path: string | null;
          show_cutout: boolean;
          show_enhanced: boolean;
          show_ironed: boolean;
          sort_order: number;
          storage_path: string;
          uploaded_by: string | null;
          variant_id: string | null;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          cutout_enhanced_path?: string | null;
          cutout_path?: string | null;
          detected_hex?: string | null;
          enhanced_path?: string | null;
          file_size?: number | null;
          height?: number | null;
          id?: string;
          ironed_path?: string | null;
          mask_path?: string | null;
          mime_type?: string | null;
          product_id: string;
          refined_enhanced_path?: string | null;
          refined_path?: string | null;
          show_cutout?: boolean;
          show_enhanced?: boolean;
          show_ironed?: boolean;
          sort_order?: number;
          storage_path: string;
          uploaded_by?: string | null;
          variant_id?: string | null;
          width?: number | null;
        };
        Update: {
          created_at?: string;
          cutout_enhanced_path?: string | null;
          cutout_path?: string | null;
          detected_hex?: string | null;
          enhanced_path?: string | null;
          file_size?: number | null;
          height?: number | null;
          id?: string;
          ironed_path?: string | null;
          mask_path?: string | null;
          mime_type?: string | null;
          product_id?: string;
          refined_enhanced_path?: string | null;
          refined_path?: string | null;
          show_cutout?: boolean;
          show_enhanced?: boolean;
          show_ironed?: boolean;
          sort_order?: number;
          storage_path?: string;
          uploaded_by?: string | null;
          variant_id?: string | null;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_images_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
      product_sizes: {
        Row: {
          id: string;
          label: string;
          product_id: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          label: string;
          product_id: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          label?: string;
          product_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_sizes_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_types: {
        Row: {
          category: Database["public"]["Enums"]["product_category"];
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          category: Database["public"]["Enums"]["product_category"];
          name: string;
          sort_order?: number;
        };
        Update: {
          category?: Database["public"]["Enums"]["product_category"];
          name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      product_variants: {
        Row: {
          colour_detection_metadata: NonNullable<Json>;
          colour_hex: string;
          colour_name: string;
          colour_status: Database["public"]["Enums"]["colour_status"];
          created_at: string;
          id: string;
          product_id: string;
          sort_order: number;
          style_label: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          colour_detection_metadata?: NonNullable<Json>;
          colour_hex?: string;
          colour_name?: string;
          colour_status?: Database["public"]["Enums"]["colour_status"];
          created_at?: string;
          id?: string;
          product_id: string;
          sort_order?: number;
          style_label?: string;
          updated_at?: string;
        };
        Update: {
          colour_detection_metadata?: NonNullable<Json>;
          colour_hex?: string;
          colour_name?: string;
          colour_status?: Database["public"]["Enums"]["colour_status"];
          created_at?: string;
          id?: string;
          product_id?: string;
          sort_order?: number;
          style_label?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          category: Database["public"]["Enums"]["product_category"];
          created_at: string;
          created_by: string | null;
          default_price_cents: number;
          description: string;
          id: string;
          low_stock_threshold: number | null;
          name: string;
          product_code: string;
          sku: string;
          status: Database["public"]["Enums"]["product_status"];
          type: string;
          updated_at: string;
          updated_by: string | null;
          whatsapp_catalog_url: string | null;
        };
        ComputedFields: never;
        Insert: {
          category?: Database["public"]["Enums"]["product_category"];
          created_at?: string;
          created_by?: string | null;
          default_price_cents?: number;
          description?: string;
          id?: string;
          low_stock_threshold?: number | null;
          name?: string;
          product_code?: string;
          sku?: string;
          status?: Database["public"]["Enums"]["product_status"];
          type?: string;
          updated_at?: string;
          updated_by?: string | null;
          whatsapp_catalog_url?: string | null;
        };
        Update: {
          category?: Database["public"]["Enums"]["product_category"];
          created_at?: string;
          created_by?: string | null;
          default_price_cents?: number;
          description?: string;
          id?: string;
          low_stock_threshold?: number | null;
          name?: string;
          product_code?: string;
          sku?: string;
          status?: Database["public"]["Enums"]["product_status"];
          type?: string;
          updated_at?: string;
          updated_by?: string | null;
          whatsapp_catalog_url?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          can_edit_prices: boolean;
          can_view_costs: boolean;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          can_edit_prices?: boolean;
          can_view_costs?: boolean;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          can_edit_prices?: boolean;
          can_view_costs?: boolean;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      shop_settings: {
        Row: {
          auto_detect_colours: boolean;
          id: boolean;
          low_stock_threshold: number;
          max_photo_mb: number;
          require_note_for_corrections: boolean;
          shop_name: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          auto_detect_colours?: boolean;
          id?: boolean;
          low_stock_threshold?: number;
          max_photo_mb?: number;
          require_note_for_corrections?: boolean;
          shop_name?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          auto_detect_colours?: boolean;
          id?: boolean;
          low_stock_threshold?: number;
          max_photo_mb?: number;
          require_note_for_corrections?: boolean;
          shop_name?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      size_templates: {
        Row: {
          category: Database["public"]["Enums"]["product_category"];
          sizes: string[];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          category: Database["public"]["Enums"]["product_category"];
          sizes: string[];
          updated_at?: string;
        };
        Update: {
          category?: Database["public"]["Enums"]["product_category"];
          sizes?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      staff_invites: {
        Row: {
          can_edit_prices: boolean;
          can_view_costs: boolean;
          created_at: string;
          email: string;
          invited_by: string | null;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          can_edit_prices?: boolean;
          can_view_costs?: boolean;
          created_at?: string;
          email: string;
          invited_by?: string | null;
          name: string;
        };
        Update: {
          can_edit_prices?: boolean;
          can_view_costs?: boolean;
          created_at?: string;
          email?: string;
          invited_by?: string | null;
          name?: string;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          actor_id: string | null;
          actor_name: string;
          colour_name: string;
          created_at: string;
          delta: number;
          id: string;
          note: string;
          product_id: string | null;
          product_name: string;
          quantity_after: number;
          quantity_before: number;
          reason: Database["public"]["Enums"]["movement_reason"];
          size_label: string;
          sku_id: string | null;
          style_label: string;
          variant_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          actor_name?: string;
          colour_name?: string;
          created_at?: string;
          delta: number;
          id?: string;
          note?: string;
          product_id?: string | null;
          product_name?: string;
          quantity_after: number;
          quantity_before: number;
          reason: Database["public"]["Enums"]["movement_reason"];
          size_label: string;
          sku_id?: string | null;
          style_label?: string;
          variant_id?: string | null;
        };
        Update: {
          actor_id?: string | null;
          actor_name?: string;
          colour_name?: string;
          created_at?: string;
          delta?: number;
          id?: string;
          note?: string;
          product_id?: string | null;
          product_name?: string;
          quantity_after?: number;
          quantity_before?: number;
          reason?: Database["public"]["Enums"]["movement_reason"];
          size_label?: string;
          sku_id?: string | null;
          style_label?: string;
          variant_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "inventory_skus";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      adjust_stock: {
        Args: {
          p_delta: number;
          p_expected_before?: number;
          p_movement_id: string;
          p_note?: string;
          p_reason: Database["public"]["Enums"]["movement_reason"];
          p_size_label: string;
          p_variant_id: string;
        };
        Returns: {
          actor_id: string | null;
          actor_name: string;
          colour_name: string;
          created_at: string;
          delta: number;
          id: string;
          note: string;
          product_id: string | null;
          product_name: string;
          quantity_after: number;
          quantity_before: number;
          reason: Database["public"]["Enums"]["movement_reason"];
          size_label: string;
          sku_id: string | null;
          style_label: string;
          variant_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "stock_movements";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      can_edit_prices: { Args: Record<PropertyKey, never>; Returns: boolean };
      can_view_costs: { Args: Record<PropertyKey, never>; Returns: boolean };
      delete_or_archive_product: {
        Args: { p_product_id: string };
        Returns: string;
      };
      is_owner: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      log_stock_write_off: {
        Args: { p_note: string; p_size_id: string; p_variant_id: string };
        Returns: undefined;
      };
      set_product_category: {
        Args: {
          p_category: Database["public"]["Enums"]["product_category"];
          p_product_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "owner" | "staff" | "pending";
      colour_status: "detected" | "needs_review" | "corrected" | "unavailable";
      movement_reason:
        | "initial_stock"
        | "restock"
        | "correction"
        | "damage"
        | "other";
      product_category: "Clothing" | "Shoes";
      product_status: "draft" | "active" | "archived";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "staff", "pending"],
      colour_status: ["detected", "needs_review", "corrected", "unavailable"],
      movement_reason: [
        "initial_stock",
        "restock",
        "correction",
        "damage",
        "other",
      ],
      product_category: ["Clothing", "Shoes"],
      product_status: ["draft", "active", "archived"],
    },
  },
} as const;
