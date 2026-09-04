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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      avisos: {
        Row: {
          antecipacao_min: number
          ativo: boolean
          created_at: string
          documento_id: string | null
          id: string
          local: string | null
          origem: string | null
          quando: string
          tipo: string
          titulo: string
          updated_at: string
          user_id: string
          viagem_id: string | null
        }
        Insert: {
          antecipacao_min?: number
          ativo?: boolean
          created_at?: string
          documento_id?: string | null
          id?: string
          local?: string | null
          origem?: string | null
          quando: string
          tipo?: string
          titulo: string
          updated_at?: string
          user_id?: string
          viagem_id?: string | null
        }
        Update: {
          antecipacao_min?: number
          ativo?: boolean
          created_at?: string
          documento_id?: string | null
          id?: string
          local?: string | null
          origem?: string | null
          quando?: string
          tipo?: string
          titulo?: string
          updated_at?: string
          user_id?: string
          viagem_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avisos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          created_at: string
          ficheiro_path: string | null
          id: string
          nome: string
          origem: string
          qr_conteudo: string | null
          recebido_em: string | null
          remetente_email: string | null
          tipo: string
          user_id: string
          viagem_id: string
          voo_id: string | null
        }
        Insert: {
          created_at?: string
          ficheiro_path?: string | null
          id?: string
          nome: string
          origem?: string
          qr_conteudo?: string | null
          recebido_em?: string | null
          remetente_email?: string | null
          tipo?: string
          user_id?: string
          viagem_id: string
          voo_id?: string | null
        }
        Update: {
          created_at?: string
          ficheiro_path?: string | null
          id?: string
          nome?: string
          origem?: string
          qr_conteudo?: string | null
          recebido_em?: string | null
          remetente_email?: string | null
          tipo?: string
          user_id?: string
          viagem_id?: string
          voo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_voo_id_fkey"
            columns: ["voo_id"]
            isOneToOne: false
            referencedRelation: "voos"
            referencedColumns: ["id"]
          },
        ]
      }
      preferencias_avisos: {
        Row: {
          antecipacao_padrao_min: number
          avisos_ativos: boolean
          created_at: string
          push_ativado: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          antecipacao_padrao_min?: number
          avisos_ativos?: boolean
          created_at?: string
          push_ativado?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          antecipacao_padrao_min?: number
          avisos_ativos?: boolean
          created_at?: string
          push_ativado?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
        }
        Relationships: []
      }
      push_subscricoes: {
        Row: {
          ativo: boolean
          atualizado_em: string
          auth: string
          criado_em: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          auth: string
          criado_em?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          auth?: string
          criado_em?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reservas: {
        Row: {
          companhia: string | null
          confirmada_em: string | null
          created_at: string
          data_partida: string | null
          data_regresso: string | null
          deeplink: string | null
          destino: string
          estado: string
          fornecedor: string
          id: string
          moeda: string
          notas: string | null
          numero_voo: string | null
          origem: string
          preco: number | null
          referencia: string | null
          updated_at: string
          user_id: string
          viagem_id: string | null
          voo_id: string | null
        }
        Insert: {
          companhia?: string | null
          confirmada_em?: string | null
          created_at?: string
          data_partida?: string | null
          data_regresso?: string | null
          deeplink?: string | null
          destino: string
          estado?: string
          fornecedor?: string
          id?: string
          moeda?: string
          notas?: string | null
          numero_voo?: string | null
          origem: string
          preco?: number | null
          referencia?: string | null
          updated_at?: string
          user_id?: string
          viagem_id?: string | null
          voo_id?: string | null
        }
        Update: {
          companhia?: string | null
          confirmada_em?: string | null
          created_at?: string
          data_partida?: string | null
          data_regresso?: string | null
          deeplink?: string | null
          destino?: string
          estado?: string
          fornecedor?: string
          id?: string
          moeda?: string
          notas?: string | null
          numero_voo?: string | null
          origem?: string
          preco?: number | null
          referencia?: string | null
          updated_at?: string
          user_id?: string
          viagem_id?: string | null
          voo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservas_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_voo_id_fkey"
            columns: ["voo_id"]
            isOneToOne: false
            referencedRelation: "voos"
            referencedColumns: ["id"]
          },
        ]
      }
      viagens: {
        Row: {
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          destino: string | null
          estado: string
          id: string
          notas: string | null
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          destino?: string | null
          estado?: string
          id?: string
          notas?: string | null
          titulo: string
          user_id?: string
        }
        Update: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          destino?: string | null
          estado?: string
          id?: string
          notas?: string | null
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      voos: {
        Row: {
          chegada: string | null
          companhia: string | null
          created_at: string
          destino: string
          id: string
          moeda: string
          numero_voo: string | null
          origem: string
          partida: string | null
          preco: number | null
          referencia: string | null
          user_id: string
          viagem_id: string
        }
        Insert: {
          chegada?: string | null
          companhia?: string | null
          created_at?: string
          destino: string
          id?: string
          moeda?: string
          numero_voo?: string | null
          origem: string
          partida?: string | null
          preco?: number | null
          referencia?: string | null
          user_id?: string
          viagem_id: string
        }
        Update: {
          chegada?: string | null
          companhia?: string | null
          created_at?: string
          destino?: string
          id?: string
          moeda?: string
          numero_voo?: string | null
          origem?: string
          partida?: string | null
          preco?: number | null
          referencia?: string | null
          user_id?: string
          viagem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voos_viagem_id_fkey"
            columns: ["viagem_id"]
            isOneToOne: false
            referencedRelation: "viagens"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
