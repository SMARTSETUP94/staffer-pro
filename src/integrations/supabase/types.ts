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
      adresses_favorites: {
        Row: {
          adresse_complete: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          nom: string
          type: Database["public"]["Enums"]["adresse_favorite_type"]
          updated_at: string
        }
        Insert: {
          adresse_complete: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nom: string
          type?: Database["public"]["Enums"]["adresse_favorite_type"]
          updated_at?: string
        }
        Update: {
          adresse_complete?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nom?: string
          type?: Database["public"]["Enums"]["adresse_favorite_type"]
          updated_at?: string
        }
        Relationships: []
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
          charge_affaires_id: string | null
          chef_chantier_id: string | null
          client: string | null
          code_opportunite: string | null
          created_at: string
          date_debut: string | null
          date_demontage: string | null
          date_fin_prevue: string | null
          date_montage: string | null
          date_opportunite: string | null
          id: string
          lieu: string | null
          nom: string
          notes: string | null
          numero: string
          phase: Database["public"]["Enums"]["affaire_phase"]
          signed_at: string | null
          statut: Database["public"]["Enums"]["affaire_statut"]
          statut_opportunite:
            | Database["public"]["Enums"]["opportunite_statut"]
            | null
          taille: Database["public"]["Enums"]["opportunite_taille"] | null
          updated_at: string
        }
        Insert: {
          charge_affaires_id?: string | null
          chef_chantier_id?: string | null
          client?: string | null
          code_opportunite?: string | null
          created_at?: string
          date_debut?: string | null
          date_demontage?: string | null
          date_fin_prevue?: string | null
          date_montage?: string | null
          date_opportunite?: string | null
          id?: string
          lieu?: string | null
          nom: string
          notes?: string | null
          numero: string
          phase?: Database["public"]["Enums"]["affaire_phase"]
          signed_at?: string | null
          statut?: Database["public"]["Enums"]["affaire_statut"]
          statut_opportunite?:
            | Database["public"]["Enums"]["opportunite_statut"]
            | null
          taille?: Database["public"]["Enums"]["opportunite_taille"] | null
          updated_at?: string
        }
        Update: {
          charge_affaires_id?: string | null
          chef_chantier_id?: string | null
          client?: string | null
          code_opportunite?: string | null
          created_at?: string
          date_debut?: string | null
          date_demontage?: string | null
          date_fin_prevue?: string | null
          date_montage?: string | null
          date_opportunite?: string | null
          id?: string
          lieu?: string | null
          nom?: string
          notes?: string | null
          numero?: string
          phase?: Database["public"]["Enums"]["affaire_phase"]
          signed_at?: string | null
          statut?: Database["public"]["Enums"]["affaire_statut"]
          statut_opportunite?:
            | Database["public"]["Enums"]["opportunite_statut"]
            | null
          taille?: Database["public"]["Enums"]["opportunite_taille"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affaires_charge_affaires_id_fkey"
            columns: ["charge_affaires_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          confirmee_le: string | null
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
          metier_id: number | null
          motif_refus: string | null
          notes: string | null
          refusee_le: string | null
          statut_confirmation: Database["public"]["Enums"]["confirmation_status"]
          updated_at: string
        }
        Insert: {
          affaire_id: string
          confirmee_le?: string | null
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
          metier_id?: number | null
          motif_refus?: string | null
          notes?: string | null
          refusee_le?: string | null
          statut_confirmation?: Database["public"]["Enums"]["confirmation_status"]
          updated_at?: string
        }
        Update: {
          affaire_id?: string
          confirmee_le?: string | null
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
          metier_id?: number | null
          motif_refus?: string | null
          notes?: string | null
          refusee_le?: string | null
          statut_confirmation?: Database["public"]["Enums"]["confirmation_status"]
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
          date_debut_phase: string | null
          date_fin_phase: string | null
          date_signature: string | null
          fichier_source: string | null
          id: string
          libelle: string | null
          livre_le: string | null
          livre_par: string | null
          montant_ht: number | null
          numero: string
          statut: Database["public"]["Enums"]["devis_statut"]
          updated_at: string
        }
        Insert: {
          affaire_id: string
          created_at?: string
          date_debut_phase?: string | null
          date_fin_phase?: string | null
          date_signature?: string | null
          fichier_source?: string | null
          id?: string
          libelle?: string | null
          livre_le?: string | null
          livre_par?: string | null
          montant_ht?: number | null
          numero: string
          statut?: Database["public"]["Enums"]["devis_statut"]
          updated_at?: string
        }
        Update: {
          affaire_id?: string
          created_at?: string
          date_debut_phase?: string | null
          date_fin_phase?: string | null
          date_signature?: string | null
          fichier_source?: string | null
          id?: string
          libelle?: string | null
          livre_le?: string | null
          livre_par?: string | null
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
          {
            foreignKeyName: "devis_livre_par_fkey"
            columns: ["livre_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      devis_imports: {
        Row: {
          affaire_id: string | null
          affaire_nom: string | null
          affaire_numero: string | null
          created_at: string
          devis_id: string | null
          devis_numero: string | null
          fichier_hash: string
          fichier_nom: string
          id: string
          postes_count: number
          total_heures: number
          total_montant_ht: number | null
          user_id: string
        }
        Insert: {
          affaire_id?: string | null
          affaire_nom?: string | null
          affaire_numero?: string | null
          created_at?: string
          devis_id?: string | null
          devis_numero?: string | null
          fichier_hash: string
          fichier_nom: string
          id?: string
          postes_count?: number
          total_heures?: number
          total_montant_ht?: number | null
          user_id: string
        }
        Update: {
          affaire_id?: string | null
          affaire_nom?: string | null
          affaire_numero?: string | null
          created_at?: string
          devis_id?: string | null
          devis_numero?: string | null
          fichier_hash?: string
          fichier_nom?: string
          id?: string
          postes_count?: number
          total_heures?: number
          total_montant_ht?: number | null
          user_id?: string
        }
        Relationships: []
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
          categories_permis: Database["public"]["Enums"]["categorie_permis"][]
          created_at: string
          date_entree: string | null
          date_naissance: string | null
          date_sortie: string | null
          email: string | null
          est_livreur: boolean
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
          categories_permis?: Database["public"]["Enums"]["categorie_permis"][]
          created_at?: string
          date_entree?: string | null
          date_naissance?: string | null
          date_sortie?: string | null
          email?: string | null
          est_livreur?: boolean
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
          categories_permis?: Database["public"]["Enums"]["categorie_permis"][]
          created_at?: string
          date_entree?: string | null
          date_naissance?: string | null
          date_sortie?: string | null
          email?: string | null
          est_livreur?: boolean
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
      feedbacks: {
        Row: {
          author_id: string
          created_at: string
          description: string
          id: string
          notes_admin: string | null
          page_url: string | null
          priorite: Database["public"]["Enums"]["feedback_priorite"]
          resolved_at: string | null
          resolved_by: string | null
          screenshot_path: string | null
          statut: Database["public"]["Enums"]["feedback_statut"]
          titre: string
          type: Database["public"]["Enums"]["feedback_type"]
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          author_id: string
          created_at?: string
          description: string
          id?: string
          notes_admin?: string | null
          page_url?: string | null
          priorite?: Database["public"]["Enums"]["feedback_priorite"]
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_path?: string | null
          statut?: Database["public"]["Enums"]["feedback_statut"]
          titre: string
          type?: Database["public"]["Enums"]["feedback_type"]
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          author_id?: string
          created_at?: string
          description?: string
          id?: string
          notes_admin?: string | null
          page_url?: string | null
          priorite?: Database["public"]["Enums"]["feedback_priorite"]
          resolved_at?: string | null
          resolved_by?: string | null
          screenshot_path?: string | null
          statut?: Database["public"]["Enums"]["feedback_statut"]
          titre?: string
          type?: Database["public"]["Enums"]["feedback_type"]
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_resolved_by_fkey"
            columns: ["resolved_by"]
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
          devis_id: string | null
          employe_id: string
          heure_debut: string | null
          heure_fin: string | null
          heures_nuit: number
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
          devis_id?: string | null
          employe_id: string
          heure_debut?: string | null
          heure_fin?: string | null
          heures_nuit?: number
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
          devis_id?: string | null
          employe_id?: string
          heure_debut?: string | null
          heure_fin?: string | null
          heures_nuit?: number
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
            foreignKeyName: "heures_saisies_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "devis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heures_saisies_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "v_devis_consommation"
            referencedColumns: ["devis_id"]
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
      lieux: {
        Row: {
          actif: boolean
          adresse_complete: string
          created_at: string
          id: string
          label: string
          latitude: number | null
          longitude: number | null
          type: Database["public"]["Enums"]["lieu_type"]
          updated_at: string
        }
        Insert: {
          actif?: boolean
          adresse_complete: string
          created_at?: string
          id?: string
          label: string
          latitude?: number | null
          longitude?: number | null
          type: Database["public"]["Enums"]["lieu_type"]
          updated_at?: string
        }
        Update: {
          actif?: boolean
          adresse_complete?: string
          created_at?: string
          id?: string
          label?: string
          latitude?: number | null
          longitude?: number | null
          type?: Database["public"]["Enums"]["lieu_type"]
          updated_at?: string
        }
        Relationships: []
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
      opportunites_imports: {
        Row: {
          created_at: string
          created_count: number
          errored_count: number
          fichier_hash: string
          fichier_nom: string
          id: string
          rows_count: number
          updated_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          created_count?: number
          errored_count?: number
          fichier_hash: string
          fichier_nom: string
          id?: string
          rows_count?: number
          updated_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          created_count?: number
          errored_count?: number
          fichier_hash?: string
          fichier_nom?: string
          id?: string
          rows_count?: number
          updated_count?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          derniere_connexion_le: string | null
          email: string
          full_name: string | null
          id: string
          matricule_silae: string | null
          password_set_at: string | null
          password_set_done: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          derniere_connexion_le?: string | null
          email: string
          full_name?: string | null
          id: string
          matricule_silae?: string | null
          password_set_at?: string | null
          password_set_done?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          derniere_connexion_le?: string | null
          email?: string
          full_name?: string | null
          id?: string
          matricule_silae?: string | null
          password_set_at?: string | null
          password_set_done?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      swap_requests: {
        Row: {
          appliquee_le: string | null
          chef_decide_le: string | null
          chef_decide_par: string | null
          chef_motif: string | null
          collegue_decide_le: string | null
          collegue_motif: string | null
          created_at: string
          from_assignation_id: string
          from_employe_id: string
          id: string
          motif_demande: string | null
          statut: Database["public"]["Enums"]["swap_status"]
          to_assignation_id: string | null
          to_employe_id: string
          type: Database["public"]["Enums"]["swap_type"]
          updated_at: string
        }
        Insert: {
          appliquee_le?: string | null
          chef_decide_le?: string | null
          chef_decide_par?: string | null
          chef_motif?: string | null
          collegue_decide_le?: string | null
          collegue_motif?: string | null
          created_at?: string
          from_assignation_id: string
          from_employe_id: string
          id?: string
          motif_demande?: string | null
          statut?: Database["public"]["Enums"]["swap_status"]
          to_assignation_id?: string | null
          to_employe_id: string
          type?: Database["public"]["Enums"]["swap_type"]
          updated_at?: string
        }
        Update: {
          appliquee_le?: string | null
          chef_decide_le?: string | null
          chef_decide_par?: string | null
          chef_motif?: string | null
          collegue_decide_le?: string | null
          collegue_motif?: string | null
          created_at?: string
          from_assignation_id?: string
          from_employe_id?: string
          id?: string
          motif_demande?: string | null
          statut?: Database["public"]["Enums"]["swap_status"]
          to_assignation_id?: string | null
          to_employe_id?: string
          type?: Database["public"]["Enums"]["swap_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_requests_chef_decide_par_fkey"
            columns: ["chef_decide_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_from_assignation_id_fkey"
            columns: ["from_assignation_id"]
            isOneToOne: false
            referencedRelation: "assignations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_from_employe_id_fkey"
            columns: ["from_employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_to_assignation_id_fkey"
            columns: ["to_assignation_id"]
            isOneToOne: false
            referencedRelation: "assignations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_to_employe_id_fkey"
            columns: ["to_employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
        ]
      }
      trajets: {
        Row: {
          adresse_arrivee: string
          adresse_arrivee_favorite_id: string | null
          adresse_depart: string
          adresse_depart_favorite_id: string | null
          affaire_id: string | null
          categorie: Database["public"]["Enums"]["trajet_categorie"]
          chauffeur_id: string | null
          created_at: string
          created_by: string | null
          date: string
          heure_arrivee: string | null
          heure_depart: string | null
          id: string
          kilometrage: number | null
          notes: string | null
          parent_trajet_id: string | null
          soustraitance_envoye_le: string | null
          statut_soustraitance: Database["public"]["Enums"]["trajet_statut_soustraitance"]
          updated_at: string
          vehicule_id: string | null
        }
        Insert: {
          adresse_arrivee: string
          adresse_arrivee_favorite_id?: string | null
          adresse_depart: string
          adresse_depart_favorite_id?: string | null
          affaire_id?: string | null
          categorie?: Database["public"]["Enums"]["trajet_categorie"]
          chauffeur_id?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          heure_arrivee?: string | null
          heure_depart?: string | null
          id?: string
          kilometrage?: number | null
          notes?: string | null
          parent_trajet_id?: string | null
          soustraitance_envoye_le?: string | null
          statut_soustraitance?: Database["public"]["Enums"]["trajet_statut_soustraitance"]
          updated_at?: string
          vehicule_id?: string | null
        }
        Update: {
          adresse_arrivee?: string
          adresse_arrivee_favorite_id?: string | null
          adresse_depart?: string
          adresse_depart_favorite_id?: string | null
          affaire_id?: string | null
          categorie?: Database["public"]["Enums"]["trajet_categorie"]
          chauffeur_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          heure_arrivee?: string | null
          heure_depart?: string | null
          id?: string
          kilometrage?: number | null
          notes?: string | null
          parent_trajet_id?: string | null
          soustraitance_envoye_le?: string | null
          statut_soustraitance?: Database["public"]["Enums"]["trajet_statut_soustraitance"]
          updated_at?: string
          vehicule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trajets_adresse_arrivee_favorite_id_fkey"
            columns: ["adresse_arrivee_favorite_id"]
            isOneToOne: false
            referencedRelation: "adresses_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trajets_adresse_depart_favorite_id_fkey"
            columns: ["adresse_depart_favorite_id"]
            isOneToOne: false
            referencedRelation: "adresses_favorites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trajets_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "affaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trajets_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "v_affaire_consommation"
            referencedColumns: ["affaire_id"]
          },
          {
            foreignKeyName: "trajets_chauffeur_id_fkey"
            columns: ["chauffeur_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trajets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trajets_parent_trajet_id_fkey"
            columns: ["parent_trajet_id"]
            isOneToOne: false
            referencedRelation: "trajets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trajets_vehicule_id_fkey"
            columns: ["vehicule_id"]
            isOneToOne: false
            referencedRelation: "v_vehicules_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trajets_vehicule_id_fkey"
            columns: ["vehicule_id"]
            isOneToOne: false
            referencedRelation: "vehicules"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          activated_at: string | null
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["user_status"]
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["user_status"]
          user_id: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["user_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicule_chauffeurs_autorises: {
        Row: {
          created_at: string
          employe_id: string
          id: number
          vehicule_id: string
        }
        Insert: {
          created_at?: string
          employe_id: string
          id?: number
          vehicule_id: string
        }
        Update: {
          created_at?: string
          employe_id?: string
          id?: number
          vehicule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicule_chauffeurs_autorises_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicule_chauffeurs_autorises_vehicule_id_fkey"
            columns: ["vehicule_id"]
            isOneToOne: false
            referencedRelation: "v_vehicules_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicule_chauffeurs_autorises_vehicule_id_fkey"
            columns: ["vehicule_id"]
            isOneToOne: false
            referencedRelation: "vehicules"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicules: {
        Row: {
          actif: boolean
          capacite_passagers: number | null
          cout_journalier_eur: number | null
          created_at: string
          date_controle_technique: string | null
          date_debut_location: string | null
          date_expiration_assurance: string | null
          date_fin_location: string | null
          date_prochaine_revision: string | null
          fournisseur_location: string | null
          id: string
          immatriculation: string | null
          marque: string | null
          modele: string | null
          nom: string
          notes: string | null
          permis_requis: Database["public"]["Enums"]["permis_type"]
          poids_max_kg: number | null
          prestataire_location: string | null
          proprietaire: Database["public"]["Enums"]["vehicule_proprietaire"]
          reference_contrat: string | null
          type: Database["public"]["Enums"]["vehicule_type"]
          updated_at: string
          volume_m3: number | null
        }
        Insert: {
          actif?: boolean
          capacite_passagers?: number | null
          cout_journalier_eur?: number | null
          created_at?: string
          date_controle_technique?: string | null
          date_debut_location?: string | null
          date_expiration_assurance?: string | null
          date_fin_location?: string | null
          date_prochaine_revision?: string | null
          fournisseur_location?: string | null
          id?: string
          immatriculation?: string | null
          marque?: string | null
          modele?: string | null
          nom: string
          notes?: string | null
          permis_requis?: Database["public"]["Enums"]["permis_type"]
          poids_max_kg?: number | null
          prestataire_location?: string | null
          proprietaire?: Database["public"]["Enums"]["vehicule_proprietaire"]
          reference_contrat?: string | null
          type: Database["public"]["Enums"]["vehicule_type"]
          updated_at?: string
          volume_m3?: number | null
        }
        Update: {
          actif?: boolean
          capacite_passagers?: number | null
          cout_journalier_eur?: number | null
          created_at?: string
          date_controle_technique?: string | null
          date_debut_location?: string | null
          date_expiration_assurance?: string | null
          date_fin_location?: string | null
          date_prochaine_revision?: string | null
          fournisseur_location?: string | null
          id?: string
          immatriculation?: string | null
          marque?: string | null
          modele?: string | null
          nom?: string
          notes?: string | null
          permis_requis?: Database["public"]["Enums"]["permis_type"]
          poids_max_kg?: number | null
          prestataire_location?: string | null
          proprietaire?: Database["public"]["Enums"]["vehicule_proprietaire"]
          reference_contrat?: string | null
          type?: Database["public"]["Enums"]["vehicule_type"]
          updated_at?: string
          volume_m3?: number | null
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
          total_heures_reelles_soumises: number | null
          total_heures_reelles_validees: number | null
        }
        Insert: {
          affaire_id?: string | null
          nom?: string | null
          numero?: string | null
          total_heures_assignees?: never
          total_heures_prevues?: never
          total_heures_reelles_soumises?: never
          total_heures_reelles_validees?: never
        }
        Update: {
          affaire_id?: string | null
          nom?: string | null
          numero?: string | null
          total_heures_assignees?: never
          total_heures_prevues?: never
          total_heures_reelles_soumises?: never
          total_heures_reelles_validees?: never
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
          heures_reelles_soumises: number | null
          heures_reelles_validees: number | null
          heures_restantes: number | null
          heures_restantes_vs_validees: number | null
          metier: string | null
          metier_id: number | null
          ordre: number | null
          pct_consomme: number | null
          pct_consomme_reel: number | null
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
      v_feedbacks_public: {
        Row: {
          author_id: string | null
          created_at: string | null
          description: string | null
          id: string | null
          page_url: string | null
          priorite: Database["public"]["Enums"]["feedback_priorite"] | null
          resolved_at: string | null
          screenshot_path: string | null
          statut: Database["public"]["Enums"]["feedback_statut"] | null
          titre: string | null
          type: Database["public"]["Enums"]["feedback_type"] | null
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          author_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          page_url?: string | null
          priorite?: Database["public"]["Enums"]["feedback_priorite"] | null
          resolved_at?: string | null
          screenshot_path?: string | null
          statut?: Database["public"]["Enums"]["feedback_statut"] | null
          titre?: string | null
          type?: Database["public"]["Enums"]["feedback_type"] | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          author_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          page_url?: string | null
          priorite?: Database["public"]["Enums"]["feedback_priorite"] | null
          resolved_at?: string | null
          screenshot_path?: string | null
          statut?: Database["public"]["Enums"]["feedback_statut"] | null
          titre?: string | null
          type?: Database["public"]["Enums"]["feedback_type"] | null
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_vehicules_public: {
        Row: {
          actif: boolean | null
          capacite_passagers: number | null
          created_at: string | null
          date_controle_technique: string | null
          date_debut_location: string | null
          date_expiration_assurance: string | null
          date_fin_location: string | null
          date_prochaine_revision: string | null
          id: string | null
          immatriculation: string | null
          marque: string | null
          modele: string | null
          nom: string | null
          notes: string | null
          permis_requis: Database["public"]["Enums"]["permis_type"] | null
          poids_max_kg: number | null
          proprietaire:
            | Database["public"]["Enums"]["vehicule_proprietaire"]
            | null
          type: Database["public"]["Enums"]["vehicule_type"] | null
          updated_at: string | null
          volume_m3: number | null
        }
        Insert: {
          actif?: boolean | null
          capacite_passagers?: number | null
          created_at?: string | null
          date_controle_technique?: string | null
          date_debut_location?: string | null
          date_expiration_assurance?: string | null
          date_fin_location?: string | null
          date_prochaine_revision?: string | null
          id?: string | null
          immatriculation?: string | null
          marque?: string | null
          modele?: string | null
          nom?: string | null
          notes?: string | null
          permis_requis?: Database["public"]["Enums"]["permis_type"] | null
          poids_max_kg?: number | null
          proprietaire?:
            | Database["public"]["Enums"]["vehicule_proprietaire"]
            | null
          type?: Database["public"]["Enums"]["vehicule_type"] | null
          updated_at?: string | null
          volume_m3?: number | null
        }
        Update: {
          actif?: boolean | null
          capacite_passagers?: number | null
          created_at?: string | null
          date_controle_technique?: string | null
          date_debut_location?: string | null
          date_expiration_assurance?: string | null
          date_fin_location?: string | null
          date_prochaine_revision?: string | null
          id?: string | null
          immatriculation?: string | null
          marque?: string | null
          modele?: string | null
          nom?: string | null
          notes?: string | null
          permis_requis?: Database["public"]["Enums"]["permis_type"] | null
          poids_max_kg?: number | null
          proprietaire?:
            | Database["public"]["Enums"]["vehicule_proprietaire"]
            | null
          type?: Database["public"]["Enums"]["vehicule_type"] | null
          updated_at?: string | null
          volume_m3?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      acknowledge_heures_rejet: {
        Args: { _saisie_id: string }
        Returns: {
          affaire_id: string
          assignation_id: string | null
          commentaire: string | null
          created_at: string
          date: string
          devis_id: string | null
          employe_id: string
          heure_debut: string | null
          heure_fin: string | null
          heures_nuit: number
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
        SetofOptions: {
          from: "*"
          to: "heures_saisies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      create_opportunite: {
        Args: {
          _charge_affaires_id: string
          _client: string
          _code: string
          _commentaires?: string
          _date_opportunite: string
          _nom: string
          _taille: Database["public"]["Enums"]["opportunite_taille"]
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
      import_devis_atomique:
        | {
            Args: {
              _affaire_id: string
              _date_demontage: string
              _date_montage: string
              _devis: Json
              _new_affaire: Json
              _postes: Json
            }
            Returns: Json
          }
        | {
            Args: {
              _affaire_id: string
              _date_demontage: string
              _date_montage: string
              _devis: Json
              _fichier_hash?: string
              _new_affaire: Json
              _postes: Json
            }
            Returns: Json
          }
      is_admin: { Args: never; Returns: boolean }
      is_chef_or_admin: { Args: never; Returns: boolean }
      is_devis_termine: { Args: { _devis_id: string }; Returns: boolean }
      next_affaire_numero: { Args: { _prefix: number }; Returns: string }
      set_vehicule_chauffeurs_autorises: {
        Args: { _employe_ids: string[]; _vehicule_id: string }
        Returns: undefined
      }
      sign_opportunite: {
        Args: { _affaire_id: string; _new_code: string }
        Returns: string
      }
    }
    Enums: {
      absence_type: "conges" | "formation" | "arret_maladie" | "rtt" | "autre"
      adresse_favorite_type: "entrepot" | "client" | "fournisseur" | "autre"
      affaire_phase: "opportunite" | "signe"
      affaire_statut: "prospect" | "en_cours" | "termine" | "annule"
      app_role: "admin" | "chef_chantier" | "employe"
      categorie_permis: "B" | "C" | "CE" | "D"
      confirmation_status:
        | "non_requise"
        | "en_attente"
        | "confirmee"
        | "refusee"
      contrat_type: "CDI" | "Interim" | "CDD" | "Independant"
      demi_journee_type: "AM" | "PM" | "JOURNEE"
      devis_statut:
        | "brouillon"
        | "signe"
        | "facture"
        | "en_cours"
        | "termine"
        | "cloture"
      feedback_priorite: "basse" | "moyenne" | "haute" | "critique"
      feedback_statut: "nouveau" | "en_cours" | "resolu" | "ferme" | "rejete"
      feedback_type: "bug" | "idee" | "amelioration" | "question"
      heures_statut: "brouillon" | "soumis" | "valide" | "rejete"
      lieu_type: "atelier" | "stockage"
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
      opportunite_statut: "a_faire" | "envoye" | "gagne" | "perdu" | "termine"
      opportunite_taille:
        | "tres_petit"
        | "petit"
        | "moyen"
        | "gros"
        | "tres_gros"
      permis_type: "B" | "C" | "CE"
      swap_status:
        | "proposee"
        | "acceptee_collegue"
        | "refusee_collegue"
        | "validee_chef"
        | "rejetee_chef"
        | "appliquee"
        | "annulee"
      swap_type: "delegation" | "echange"
      trajet_categorie:
        | "pose"
        | "depose"
        | "livraison_fourniture"
        | "recuperation_materiel"
        | "autre"
      trajet_statut_soustraitance:
        | "non"
        | "a_sous_traiter"
        | "devis_envoye"
        | "confirme"
      user_status: "invite" | "actif" | "desactive"
      vehicule_proprietaire: "interne" | "location" | "sous_traitance"
      vehicule_type: "VL" | "M3_20" | "poids_lourd"
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
      adresse_favorite_type: ["entrepot", "client", "fournisseur", "autre"],
      affaire_phase: ["opportunite", "signe"],
      affaire_statut: ["prospect", "en_cours", "termine", "annule"],
      app_role: ["admin", "chef_chantier", "employe"],
      categorie_permis: ["B", "C", "CE", "D"],
      confirmation_status: [
        "non_requise",
        "en_attente",
        "confirmee",
        "refusee",
      ],
      contrat_type: ["CDI", "Interim", "CDD", "Independant"],
      demi_journee_type: ["AM", "PM", "JOURNEE"],
      devis_statut: [
        "brouillon",
        "signe",
        "facture",
        "en_cours",
        "termine",
        "cloture",
      ],
      feedback_priorite: ["basse", "moyenne", "haute", "critique"],
      feedback_statut: ["nouveau", "en_cours", "resolu", "ferme", "rejete"],
      feedback_type: ["bug", "idee", "amelioration", "question"],
      heures_statut: ["brouillon", "soumis", "valide", "rejete"],
      lieu_type: ["atelier", "stockage"],
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
      opportunite_statut: ["a_faire", "envoye", "gagne", "perdu", "termine"],
      opportunite_taille: ["tres_petit", "petit", "moyen", "gros", "tres_gros"],
      permis_type: ["B", "C", "CE"],
      swap_status: [
        "proposee",
        "acceptee_collegue",
        "refusee_collegue",
        "validee_chef",
        "rejetee_chef",
        "appliquee",
        "annulee",
      ],
      swap_type: ["delegation", "echange"],
      trajet_categorie: [
        "pose",
        "depose",
        "livraison_fourniture",
        "recuperation_materiel",
        "autre",
      ],
      trajet_statut_soustraitance: [
        "non",
        "a_sous_traiter",
        "devis_envoye",
        "confirme",
      ],
      user_status: ["invite", "actif", "desactive"],
      vehicule_proprietaire: ["interne", "location", "sous_traitance"],
      vehicule_type: ["VL", "M3_20", "poids_lourd"],
    },
  },
} as const
