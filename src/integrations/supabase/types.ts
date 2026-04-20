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
      absences: {
        Row: {
          created_at: string
          created_by: string | null
          date_debut: string
          date_fin: string
          demi_journee: Database["public"]["Enums"]["demi_journee_type"] | null
          employe_id: string
          id: string
          motif: string | null
          type: Database["public"]["Enums"]["absence_type"]
          updated_at: string
          valide: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_debut: string
          date_fin: string
          demi_journee?: Database["public"]["Enums"]["demi_journee_type"] | null
          employe_id: string
          id?: string
          motif?: string | null
          type?: Database["public"]["Enums"]["absence_type"]
          updated_at?: string
          valide?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_debut?: string
          date_fin?: string
          demi_journee?: Database["public"]["Enums"]["demi_journee_type"] | null
          employe_id?: string
          id?: string
          motif?: string | null
          type?: Database["public"]["Enums"]["absence_type"]
          updated_at?: string
          valide?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "absences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
        ]
      }
      affaire_commentaires: {
        Row: {
          affaire_id: string
          attachments: Json
          author_id: string
          body: string
          created_at: string
          id: string
          mentions: string[]
          updated_at: string
        }
        Insert: {
          affaire_id: string
          attachments?: Json
          author_id: string
          body: string
          created_at?: string
          id?: string
          mentions?: string[]
          updated_at?: string
        }
        Update: {
          affaire_id?: string
          attachments?: Json
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          mentions?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      affaires: {
        Row: {
          chef_chantier_id: string | null
          client: string | null
          created_at: string
          date_debut: string | null
          date_demontage: string | null
          date_fin_prevue: string | null
          date_montage: string | null
          id: string
          lieu: string | null
          nom: string
          notes: string | null
          numero: string
          statut: Database["public"]["Enums"]["affaire_statut"]
          updated_at: string
        }
        Insert: {
          chef_chantier_id?: string | null
          client?: string | null
          created_at?: string
          date_debut?: string | null
          date_demontage?: string | null
          date_fin_prevue?: string | null
          date_montage?: string | null
          id?: string
          lieu?: string | null
          nom: string
          notes?: string | null
          numero: string
          statut?: Database["public"]["Enums"]["affaire_statut"]
          updated_at?: string
        }
        Update: {
          chef_chantier_id?: string | null
          client?: string | null
          created_at?: string
          date_debut?: string | null
          date_demontage?: string | null
          date_fin_prevue?: string | null
          date_montage?: string | null
          id?: string
          lieu?: string | null
          nom?: string
          notes?: string | null
          numero?: string
          statut?: Database["public"]["Enums"]["affaire_statut"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affaires_chef_chantier_id_fkey"
            columns: ["chef_chantier_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
        ]
      }
      assignations: {
        Row: {
          affaire_id: string
          created_at: string
          created_by: string | null
          date: string
          demi_journee: Database["public"]["Enums"]["demi_journee_type"]
          devis_id: string | null
          employe_id: string
          heure_debut: string | null
          heure_fin: string | null
          heures: number
          id: string
          metier_id: number
          notes: string | null
          updated_at: string
        }
        Insert: {
          affaire_id: string
          created_at?: string
          created_by?: string | null
          date: string
          demi_journee: Database["public"]["Enums"]["demi_journee_type"]
          devis_id?: string | null
          employe_id: string
          heure_debut?: string | null
          heure_fin?: string | null
          heures?: number
          id?: string
          metier_id: number
          notes?: string | null
          updated_at?: string
        }
        Update: {
          affaire_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          demi_journee?: Database["public"]["Enums"]["demi_journee_type"]
          devis_id?: string | null
          employe_id?: string
          heure_debut?: string | null
          heure_fin?: string | null
          heures?: number
          id?: string
          metier_id?: number
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignations_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "affaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignations_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "v_affaire_consommation"
            referencedColumns: ["affaire_id"]
          },
          {
            foreignKeyName: "assignations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignations_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "devis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignations_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "v_devis_consommation"
            referencedColumns: ["devis_id"]
          },
          {
            foreignKeyName: "assignations_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignations_metier_id_fkey"
            columns: ["metier_id"]
            isOneToOne: false
            referencedRelation: "metiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignations_metier_id_fkey"
            columns: ["metier_id"]
            isOneToOne: false
            referencedRelation: "v_devis_consommation"
            referencedColumns: ["metier_id"]
          },
        ]
      }
      devis: {
        Row: {
          affaire_id: string
          created_at: string
          date_signature: string | null
          fichier_source: string | null
          id: string
          libelle: string | null
          montant_ht: number | null
          numero: string
          statut: Database["public"]["Enums"]["devis_statut"]
          updated_at: string
        }
        Insert: {
          affaire_id: string
          created_at?: string
          date_signature?: string | null
          fichier_source?: string | null
          id?: string
          libelle?: string | null
          montant_ht?: number | null
          numero: string
          statut?: Database["public"]["Enums"]["devis_statut"]
          updated_at?: string
        }
        Update: {
          affaire_id?: string
          created_at?: string
          date_signature?: string | null
          fichier_source?: string | null
          id?: string
          libelle?: string | null
          montant_ht?: number | null
          numero?: string
          statut?: Database["public"]["Enums"]["devis_statut"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devis_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "affaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devis_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "v_affaire_consommation"
            referencedColumns: ["affaire_id"]
          },
        ]
      }
      devis_postes: {
        Row: {
          created_at: string
          devis_id: string
          heures_prevues: number
          id: string
          libelle_source: string | null
          metier_id: number
          montant_ht: number | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          devis_id: string
          heures_prevues?: number
          id?: string
          libelle_source?: string | null
          metier_id: number
          montant_ht?: number | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          devis_id?: string
          heures_prevues?: number
          id?: string
          libelle_source?: string | null
          metier_id?: number
          montant_ht?: number | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devis_postes_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "devis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devis_postes_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "v_devis_consommation"
            referencedColumns: ["devis_id"]
          },
          {
            foreignKeyName: "devis_postes_metier_id_fkey"
            columns: ["metier_id"]
            isOneToOne: false
            referencedRelation: "metiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devis_postes_metier_id_fkey"
            columns: ["metier_id"]
            isOneToOne: false
            referencedRelation: "v_devis_consommation"
            referencedColumns: ["metier_id"]
          },
        ]
      }
      employe_metiers: {
        Row: {
          employe_id: string
          id: number
          metier_id: number
        }
        Insert: {
          employe_id: string
          id?: number
          metier_id: number
        }
        Update: {
          employe_id?: string
          id?: number
          metier_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "employe_metiers_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employe_metiers_metier_id_fkey"
            columns: ["metier_id"]
            isOneToOne: false
            referencedRelation: "metiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employe_metiers_metier_id_fkey"
            columns: ["metier_id"]
            isOneToOne: false
            referencedRelation: "v_devis_consommation"
            referencedColumns: ["metier_id"]
          },
        ]
      }
      employes: {
        Row: {
          actif: boolean
          adresse: string | null
          agence_interim: string | null
          created_at: string
          date_entree: string | null
          date_naissance: string | null
          date_sortie: string | null
          email: string | null
          id: string
          is_apprenti: boolean
          metier_principal_id: number
          mobile: string | null
          nom: string
          non_staffing: boolean
          notes: string | null
          prenom: string
          profile_id: string | null
          sous_type_contrat: string | null
          telephone: string | null
          type_contrat: Database["public"]["Enums"]["contrat_type"]
          updated_at: string
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          agence_interim?: string | null
          created_at?: string
          date_entree?: string | null
          date_naissance?: string | null
          date_sortie?: string | null
          email?: string | null
          id?: string
          is_apprenti?: boolean
          metier_principal_id: number
          mobile?: string | null
          nom: string
          non_staffing?: boolean
          notes?: string | null
          prenom: string
          profile_id?: string | null
          sous_type_contrat?: string | null
          telephone?: string | null
          type_contrat?: Database["public"]["Enums"]["contrat_type"]
          updated_at?: string
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          agence_interim?: string | null
          created_at?: string
          date_entree?: string | null
          date_naissance?: string | null
          date_sortie?: string | null
          email?: string | null
          id?: string
          is_apprenti?: boolean
          metier_principal_id?: number
          mobile?: string | null
          nom?: string
          non_staffing?: boolean
          notes?: string | null
          prenom?: string
          profile_id?: string | null
          sous_type_contrat?: string | null
          telephone?: string | null
          type_contrat?: Database["public"]["Enums"]["contrat_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employes_metier_principal_id_fkey"
            columns: ["metier_principal_id"]
            isOneToOne: false
            referencedRelation: "metiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employes_metier_principal_id_fkey"
            columns: ["metier_principal_id"]
            isOneToOne: false
            referencedRelation: "v_devis_consommation"
            referencedColumns: ["metier_id"]
          },
          {
            foreignKeyName: "employes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      heures_saisies: {
        Row: {
          affaire_id: string
          assignation_id: string | null
          commentaire: string | null
          created_at: string
          date: string
          employe_id: string
          heure_debut: string | null
          heure_fin: string | null
          heures_reelles: number | null
          id: string
          motif_rejet: string | null
          motif_rejet_lu_le: string | null
          rejete_le: string | null
          rejete_par: string | null
          statut: Database["public"]["Enums"]["heures_statut"]
          updated_at: string
          valide_le: string | null
          valide_par: string | null
        }
        Insert: {
          affaire_id: string
          assignation_id?: string | null
          commentaire?: string | null
          created_at?: string
          date: string
          employe_id: string
          heure_debut?: string | null
          heure_fin?: string | null
          heures_reelles?: number | null
          id?: string
          motif_rejet?: string | null
          motif_rejet_lu_le?: string | null
          rejete_le?: string | null
          rejete_par?: string | null
          statut?: Database["public"]["Enums"]["heures_statut"]
          updated_at?: string
          valide_le?: string | null
          valide_par?: string | null
        }
        Update: {
          affaire_id?: string
          assignation_id?: string | null
          commentaire?: string | null
          created_at?: string
          date?: string
          employe_id?: string
          heure_debut?: string | null
          heure_fin?: string | null
          heures_reelles?: number | null
          id?: string
          motif_rejet?: string | null
          motif_rejet_lu_le?: string | null
          rejete_le?: string | null
          rejete_par?: string | null
          statut?: Database["public"]["Enums"]["heures_statut"]
          updated_at?: string
          valide_le?: string | null
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heures_saisies_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "affaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heures_saisies_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "v_affaire_consommation"
            referencedColumns: ["affaire_id"]
          },
          {
            foreignKeyName: "heures_saisies_assignation_id_fkey"
            columns: ["assignation_id"]
            isOneToOne: false
            referencedRelation: "assignations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heures_saisies_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heures_saisies_rejete_par_fkey"
            columns: ["rejete_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heures_saisies_valide_par_fkey"
            columns: ["valide_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      heures_saisies_historique: {
        Row: {
          ancien_statut: Database["public"]["Enums"]["heures_statut"] | null
          commentaire: string | null
          created_at: string
          heure_saisie_id: string
          id: string
          nouveau_statut: Database["public"]["Enums"]["heures_statut"]
          user_id: string | null
        }
        Insert: {
          ancien_statut?: Database["public"]["Enums"]["heures_statut"] | null
          commentaire?: string | null
          created_at?: string
          heure_saisie_id: string
          id?: string
          nouveau_statut: Database["public"]["Enums"]["heures_statut"]
          user_id?: string | null
        }
        Update: {
          ancien_statut?: Database["public"]["Enums"]["heures_statut"] | null
          commentaire?: string | null
          created_at?: string
          heure_saisie_id?: string
          id?: string
          nouveau_statut?: Database["public"]["Enums"]["heures_statut"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heures_saisies_historique_heure_saisie_id_fkey"
            columns: ["heure_saisie_id"]
            isOneToOne: false
            referencedRelation: "heures_saisies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heures_saisies_historique_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      metiers: {
        Row: {
          code: string
          couleur: string
          id: number
          libelle: string
          ordre: number
        }
        Insert: {
          code: string
          couleur: string
          id?: number
          libelle: string
          ordre?: number
        }
        Update: {
          code?: string
          couleur?: string
          id?: number
          libelle?: string
          ordre?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          lien: string | null
          lu: boolean
          lu_le: string | null
          message: string
          metadata: Json | null
          titre: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lien?: string | null
          lu?: boolean
          lu_le?: string | null
          message: string
          metadata?: Json | null
          titre: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lien?: string | null
          lu?: boolean
          lu_le?: string | null
          message?: string
          metadata?: Json | null
          titre?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_affaire_consommation: {
        Row: {
          affaire_id: string | null
          nom: string | null
          numero: string | null
          total_heures_assignees: number | null
          total_heures_prevues: number | null
        }
        Insert: {
          affaire_id?: string | null
          nom?: string | null
          numero?: string | null
          total_heures_assignees?: never
          total_heures_prevues?: never
        }
        Update: {
          affaire_id?: string | null
          nom?: string | null
          numero?: string | null
          total_heures_assignees?: never
          total_heures_prevues?: never
        }
        Relationships: []
      }
      v_devis_consommation: {
        Row: {
          affaire_id: string | null
          couleur: string | null
          devis_id: string | null
          devis_numero: string | null
          heures_assignees: number | null
          heures_prevues: number | null
          heures_restantes: number | null
          metier: string | null
          metier_id: number | null
          ordre: number | null
          pct_consomme: number | null
        }
        Relationships: [
          {
            foreignKeyName: "devis_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "affaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devis_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "v_affaire_consommation"
            referencedColumns: ["affaire_id"]
          },
        ]
      }
    }
    Functions: {
      create_notification: {
        Args: {
          _lien?: string
          _message: string
          _metadata?: Json
          _titre: string
          _type: Database["public"]["Enums"]["notification_type"]
          _user_id: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_chef_or_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      absence_type: "conges" | "formation" | "arret_maladie" | "rtt" | "autre"
      affaire_statut: "prospect" | "en_cours" | "termine" | "annule"
      app_role: "admin" | "chef_chantier" | "employe"
      contrat_type: "CDI" | "Interim" | "CDD" | "Independant"
      demi_journee_type: "AM" | "PM" | "JOURNEE"
      devis_statut: "brouillon" | "signe" | "facture"
      heures_statut: "brouillon" | "soumis" | "valide" | "rejete"
      notification_type:
        | "assignation_creee"
        | "assignation_modifiee"
        | "assignation_supprimee"
        | "heures_soumises"
        | "heures_validees"
        | "heures_rejetees"
        | "absence_demandee"
        | "absence_validee"
        | "conflit_staffing"
        | "depassement_budget"
        | "mention"
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
      absence_type: ["conges", "formation", "arret_maladie", "rtt", "autre"],
      affaire_statut: ["prospect", "en_cours", "termine", "annule"],
      app_role: ["admin", "chef_chantier", "employe"],
      contrat_type: ["CDI", "Interim", "CDD", "Independant"],
      demi_journee_type: ["AM", "PM", "JOURNEE"],
      devis_statut: ["brouillon", "signe", "facture"],
      heures_statut: ["brouillon", "soumis", "valide", "rejete"],
      notification_type: [
        "assignation_creee",
        "assignation_modifiee",
        "assignation_supprimee",
        "heures_soumises",
        "heures_validees",
        "heures_rejetees",
        "absence_demandee",
        "absence_validee",
        "conflit_staffing",
        "depassement_budget",
        "mention",
      ],
    },
  },
} as const
