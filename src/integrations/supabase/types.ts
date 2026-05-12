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
      affaire_documents: {
        Row: {
          affaire_id: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          filename: string
          id: string
          mime_type: string
          objet_id: string | null
          prise_le: string | null
          storage_path: string
          taille_bytes: number
          updated_at: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          affaire_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          filename: string
          id?: string
          mime_type: string
          objet_id?: string | null
          prise_le?: string | null
          storage_path: string
          taille_bytes: number
          updated_at?: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          affaire_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          filename?: string
          id?: string
          mime_type?: string
          objet_id?: string | null
          prise_le?: string | null
          storage_path?: string
          taille_bytes?: number
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "affaire_documents_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "affaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affaire_documents_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "v_affaire_consommation"
            referencedColumns: ["affaire_id"]
          },
          {
            foreignKeyName: "affaire_documents_objet_id_fkey"
            columns: ["objet_id"]
            isOneToOne: false
            referencedRelation: "fabrication_objets"
            referencedColumns: ["id"]
          },
        ]
      }
      affaire_equipe_historique: {
        Row: {
          a_ete_absent: boolean
          a_refuse: boolean
          affaire_cloturee: boolean
          affaire_id: string
          affaire_numero: string | null
          affaire_statut: string | null
          chef_id: string
          chef_role: string
          client: string | null
          created_at: string
          date_debut_affaire: string | null
          date_fin_affaire: string | null
          dernier_jour: string | null
          derniere_assignation_at: string | null
          employe_id: string
          id: string
          metier_principal_id: number | null
          nb_demi_jours: number
          nb_jours_distincts: number
          phase: string | null
          premier_jour: string | null
          presence_pct_moyen: number
          type_contrat: string | null
          typologie: string | null
          updated_at: string
        }
        Insert: {
          a_ete_absent?: boolean
          a_refuse?: boolean
          affaire_cloturee?: boolean
          affaire_id: string
          affaire_numero?: string | null
          affaire_statut?: string | null
          chef_id: string
          chef_role: string
          client?: string | null
          created_at?: string
          date_debut_affaire?: string | null
          date_fin_affaire?: string | null
          dernier_jour?: string | null
          derniere_assignation_at?: string | null
          employe_id: string
          id?: string
          metier_principal_id?: number | null
          nb_demi_jours?: number
          nb_jours_distincts?: number
          phase?: string | null
          premier_jour?: string | null
          presence_pct_moyen?: number
          type_contrat?: string | null
          typologie?: string | null
          updated_at?: string
        }
        Update: {
          a_ete_absent?: boolean
          a_refuse?: boolean
          affaire_cloturee?: boolean
          affaire_id?: string
          affaire_numero?: string | null
          affaire_statut?: string | null
          chef_id?: string
          chef_role?: string
          client?: string | null
          created_at?: string
          date_debut_affaire?: string | null
          date_fin_affaire?: string | null
          dernier_jour?: string | null
          derniere_assignation_at?: string | null
          employe_id?: string
          id?: string
          metier_principal_id?: number | null
          nb_demi_jours?: number
          nb_jours_distincts?: number
          phase?: string | null
          premier_jour?: string | null
          presence_pct_moyen?: number
          type_contrat?: string | null
          typologie?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      affaires: {
        Row: {
          charge_affaires_id: string | null
          chef_chantier_id: string | null
          chef_projet_id: string | null
          client: string | null
          code_opportunite: string | null
          created_at: string
          date_debut: string | null
          date_demontage: string | null
          date_fin_prevue: string | null
          date_montage: string | null
          date_opportunite: string | null
          date_pat: string | null
          heures_prevues_demontage: number
          heures_prevues_montage: number
          id: string
          lieu: string | null
          nom: string
          notes: string | null
          numero: string
          phase: Database["public"]["Enums"]["affaire_phase"]
          responsable_demontage_id: string | null
          responsable_montage_id: string | null
          signed_at: string | null
          statut: Database["public"]["Enums"]["affaire_statut"]
          statut_opportunite:
            | Database["public"]["Enums"]["opportunite_statut"]
            | null
          taille: Database["public"]["Enums"]["opportunite_taille"] | null
          typologie: string | null
          typologie_future: string | null
          updated_at: string
        }
        Insert: {
          charge_affaires_id?: string | null
          chef_chantier_id?: string | null
          chef_projet_id?: string | null
          client?: string | null
          code_opportunite?: string | null
          created_at?: string
          date_debut?: string | null
          date_demontage?: string | null
          date_fin_prevue?: string | null
          date_montage?: string | null
          date_opportunite?: string | null
          date_pat?: string | null
          heures_prevues_demontage?: number
          heures_prevues_montage?: number
          id?: string
          lieu?: string | null
          nom: string
          notes?: string | null
          numero: string
          phase?: Database["public"]["Enums"]["affaire_phase"]
          responsable_demontage_id?: string | null
          responsable_montage_id?: string | null
          signed_at?: string | null
          statut?: Database["public"]["Enums"]["affaire_statut"]
          statut_opportunite?:
            | Database["public"]["Enums"]["opportunite_statut"]
            | null
          taille?: Database["public"]["Enums"]["opportunite_taille"] | null
          typologie?: string | null
          typologie_future?: string | null
          updated_at?: string
        }
        Update: {
          charge_affaires_id?: string | null
          chef_chantier_id?: string | null
          chef_projet_id?: string | null
          client?: string | null
          code_opportunite?: string | null
          created_at?: string
          date_debut?: string | null
          date_demontage?: string | null
          date_fin_prevue?: string | null
          date_montage?: string | null
          date_opportunite?: string | null
          date_pat?: string | null
          heures_prevues_demontage?: number
          heures_prevues_montage?: number
          id?: string
          lieu?: string | null
          nom?: string
          notes?: string | null
          numero?: string
          phase?: Database["public"]["Enums"]["affaire_phase"]
          responsable_demontage_id?: string | null
          responsable_montage_id?: string | null
          signed_at?: string | null
          statut?: Database["public"]["Enums"]["affaire_statut"]
          statut_opportunite?:
            | Database["public"]["Enums"]["opportunite_statut"]
            | null
          taille?: Database["public"]["Enums"]["opportunite_taille"] | null
          typologie?: string | null
          typologie_future?: string | null
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
          {
            foreignKeyName: "affaires_chef_projet_id_fkey"
            columns: ["chef_projet_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affaires_responsable_demontage_id_fkey"
            columns: ["responsable_demontage_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affaires_responsable_montage_id_fkey"
            columns: ["responsable_montage_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignation_objets: {
        Row: {
          assignation_id: string
          created_at: string
          created_by: string | null
          objet_id: string
        }
        Insert: {
          assignation_id: string
          created_at?: string
          created_by?: string | null
          objet_id: string
        }
        Update: {
          assignation_id?: string
          created_at?: string
          created_by?: string | null
          objet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignation_objets_assignation_id_fkey"
            columns: ["assignation_id"]
            isOneToOne: false
            referencedRelation: "assignations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignation_objets_objet_id_fkey"
            columns: ["objet_id"]
            isOneToOne: false
            referencedRelation: "fabrication_objets"
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
          est_chef_jour: boolean
          heure_debut: string | null
          heure_fin: string | null
          heures: number
          id: string
          metier_id: number | null
          motif_refus: string | null
          notes: string | null
          refusee_le: string | null
          staffing_plan_id: string | null
          statut_confirmation: Database["public"]["Enums"]["confirmation_status"]
          type_operation: string | null
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
          est_chef_jour?: boolean
          heure_debut?: string | null
          heure_fin?: string | null
          heures?: number
          id?: string
          metier_id?: number | null
          motif_refus?: string | null
          notes?: string | null
          refusee_le?: string | null
          staffing_plan_id?: string | null
          statut_confirmation?: Database["public"]["Enums"]["confirmation_status"]
          type_operation?: string | null
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
          est_chef_jour?: boolean
          heure_debut?: string | null
          heure_fin?: string | null
          heures?: number
          id?: string
          metier_id?: number | null
          motif_refus?: string | null
          notes?: string | null
          refusee_le?: string | null
          staffing_plan_id?: string | null
          statut_confirmation?: Database["public"]["Enums"]["confirmation_status"]
          type_operation?: string | null
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
          {
            foreignKeyName: "assignations_staffing_plan_id_fkey"
            columns: ["staffing_plan_id"]
            isOneToOne: false
            referencedRelation: "staffing_plan"
            referencedColumns: ["id"]
          },
        ]
      }
      chantier_metier_config: {
        Row: {
          affaire_id: string
          be_override: boolean
          capa_max_jour: number
          created_at: string
          duree_cible_j: number
          fenetre_end: string | null
          fenetre_start: string | null
          id: string
          lissage_active: boolean
          metier_id: number
          nb_pers_cible: number
          override_reason: string | null
          total_h_calc: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          affaire_id: string
          be_override?: boolean
          capa_max_jour?: number
          created_at?: string
          duree_cible_j?: number
          fenetre_end?: string | null
          fenetre_start?: string | null
          id?: string
          lissage_active?: boolean
          metier_id: number
          nb_pers_cible?: number
          override_reason?: string | null
          total_h_calc?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          affaire_id?: string
          be_override?: boolean
          capa_max_jour?: number
          created_at?: string
          duree_cible_j?: number
          fenetre_end?: string | null
          fenetre_start?: string | null
          id?: string
          lissage_active?: boolean
          metier_id?: number
          nb_pers_cible?: number
          override_reason?: string | null
          total_h_calc?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chantier_metier_config_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "affaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chantier_metier_config_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "v_affaire_consommation"
            referencedColumns: ["affaire_id"]
          },
          {
            foreignKeyName: "chantier_metier_config_metier_id_fkey"
            columns: ["metier_id"]
            isOneToOne: false
            referencedRelation: "metiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chantier_metier_config_metier_id_fkey"
            columns: ["metier_id"]
            isOneToOne: false
            referencedRelation: "v_devis_consommation"
            referencedColumns: ["metier_id"]
          },
        ]
      }
      content_astuces: {
        Row: {
          active: boolean
          auteur: string | null
          categorie: string
          created_at: string
          created_by: string | null
          id: string
          texte: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          auteur?: string | null
          categorie?: string
          created_at?: string
          created_by?: string | null
          id?: string
          texte: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          auteur?: string | null
          categorie?: string
          created_at?: string
          created_by?: string | null
          id?: string
          texte?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_quiz: {
        Row: {
          active: boolean
          bonne_reponse_index: number
          categorie: string
          created_at: string
          created_by: string | null
          difficulte: string
          explication: string | null
          id: string
          question: string
          reponses: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          bonne_reponse_index: number
          categorie?: string
          created_at?: string
          created_by?: string | null
          difficulte?: string
          explication?: string | null
          id?: string
          question: string
          reponses: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          bonne_reponse_index?: number
          categorie?: string
          created_at?: string
          created_by?: string | null
          difficulte?: string
          explication?: string | null
          id?: string
          question?: string
          reponses?: Json
          updated_at?: string
        }
        Relationships: []
      }
      contrat_templates: {
        Row: {
          actif: boolean
          contenu_html: string
          contenu_json: Json | null
          created_at: string
          created_by: string | null
          id: string
          nom: string
          notes: string | null
          updated_at: string
          version_int: number
        }
        Insert: {
          actif?: boolean
          contenu_html: string
          contenu_json?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          nom: string
          notes?: string | null
          updated_at?: string
          version_int: number
        }
        Update: {
          actif?: boolean
          contenu_html?: string
          contenu_json?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          nom?: string
          notes?: string | null
          updated_at?: string
          version_int?: number
        }
        Relationships: []
      }
      contrats_intermittents: {
        Row: {
          chantier_id: string
          created_at: string
          created_by: string | null
          date_debut: string
          date_fin: string
          employee_id: string
          forfait: boolean
          heures_estimees: number | null
          id: string
          pdf_hash_sha256: string | null
          pdf_v1_url: string | null
          pdf_v2_url: string | null
          pdf_v3_url: string | null
          staffing_id: string | null
          statut: Database["public"]["Enums"]["contrat_intermittent_statut"]
          taux_horaire_brut: number | null
          template_version_id: string | null
          updated_at: string
        }
        Insert: {
          chantier_id: string
          created_at?: string
          created_by?: string | null
          date_debut: string
          date_fin: string
          employee_id: string
          forfait?: boolean
          heures_estimees?: number | null
          id?: string
          pdf_hash_sha256?: string | null
          pdf_v1_url?: string | null
          pdf_v2_url?: string | null
          pdf_v3_url?: string | null
          staffing_id?: string | null
          statut?: Database["public"]["Enums"]["contrat_intermittent_statut"]
          taux_horaire_brut?: number | null
          template_version_id?: string | null
          updated_at?: string
        }
        Update: {
          chantier_id?: string
          created_at?: string
          created_by?: string | null
          date_debut?: string
          date_fin?: string
          employee_id?: string
          forfait?: boolean
          heures_estimees?: number | null
          id?: string
          pdf_hash_sha256?: string | null
          pdf_v1_url?: string | null
          pdf_v2_url?: string | null
          pdf_v3_url?: string | null
          staffing_id?: string | null
          statut?: Database["public"]["Enums"]["contrat_intermittent_statut"]
          taux_horaire_brut?: number | null
          template_version_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrats_intermittents_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "affaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrats_intermittents_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "v_affaire_consommation"
            referencedColumns: ["affaire_id"]
          },
          {
            foreignKeyName: "contrats_intermittents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrats_intermittents_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "contrat_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contrats_signatures: {
        Row: {
          client_ip: string | null
          contrat_id: string
          created_at: string
          id: string
          pdf_hash_sha256: string | null
          role_signature: Database["public"]["Enums"]["signataire_role"]
          signataire_id: string
          signature_image_url: string | null
          signed_at: string
          user_agent: string | null
        }
        Insert: {
          client_ip?: string | null
          contrat_id: string
          created_at?: string
          id?: string
          pdf_hash_sha256?: string | null
          role_signature: Database["public"]["Enums"]["signataire_role"]
          signataire_id: string
          signature_image_url?: string | null
          signed_at?: string
          user_agent?: string | null
        }
        Update: {
          client_ip?: string | null
          contrat_id?: string
          created_at?: string
          id?: string
          pdf_hash_sha256?: string | null
          role_signature?: Database["public"]["Enums"]["signataire_role"]
          signataire_id?: string
          signature_image_url?: string | null
          signed_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrats_signatures_contrat_id_fkey"
            columns: ["contrat_id"]
            isOneToOne: false
            referencedRelation: "contrats_intermittents"
            referencedColumns: ["id"]
          },
        ]
      }
      devis: {
        Row: {
          affaire_id: string
          archive: boolean
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
          archive?: boolean
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
          archive?: boolean
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
      devis_deletion_log: {
        Row: {
          action: string
          affaire_id: string | null
          affaire_numero: string | null
          created_at: string
          deleted_by: string
          deleted_by_email: string | null
          devis_id: string
          devis_numero: string | null
          fichier_hash: string | null
          fichier_nom: string | null
          heures_preservees: number
          heures_supprimees: number
          id: string
          objets_archives: number
          objets_supprimes: number
          postes_supprimes: number
        }
        Insert: {
          action: string
          affaire_id?: string | null
          affaire_numero?: string | null
          created_at?: string
          deleted_by: string
          deleted_by_email?: string | null
          devis_id: string
          devis_numero?: string | null
          fichier_hash?: string | null
          fichier_nom?: string | null
          heures_preservees?: number
          heures_supprimees?: number
          id?: string
          objets_archives?: number
          objets_supprimes?: number
          postes_supprimes?: number
        }
        Update: {
          action?: string
          affaire_id?: string | null
          affaire_numero?: string | null
          created_at?: string
          deleted_by?: string
          deleted_by_email?: string | null
          devis_id?: string
          devis_numero?: string | null
          fichier_hash?: string | null
          fichier_nom?: string | null
          heures_preservees?: number
          heures_supprimees?: number
          id?: string
          objets_archives?: number
          objets_supprimes?: number
          postes_supprimes?: number
        }
        Relationships: []
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
          niveau: Database["public"]["Enums"]["competence_niveau"]
        }
        Insert: {
          employe_id: string
          id?: number
          metier_id: number
          niveau?: Database["public"]["Enums"]["competence_niveau"]
        }
        Update: {
          employe_id?: string
          id?: number
          metier_id?: number
          niveau?: Database["public"]["Enums"]["competence_niveau"]
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
          competences_polyvalentes: Json
          created_at: string
          date_entree: string | null
          date_naissance: string | null
          date_sortie: string | null
          email: string | null
          est_cadre: boolean
          est_livreur: boolean
          forfait: boolean
          id: string
          is_apprenti: boolean
          matricule_silae: string | null
          metier_principal_id: number
          metiers_secondaires: number[]
          mobile: string | null
          niveau_seniorite: number
          nom: string
          non_staffing: boolean
          notes: string | null
          poste_principal: string | null
          prenom: string
          profile_id: string | null
          sous_type_contrat: string | null
          statut_contrat:
            | Database["public"]["Enums"]["statut_contrat_type"]
            | null
          taux_horaire_brut: number | null
          taux_horaire_charge: number | null
          telephone: string | null
          type_contrat: Database["public"]["Enums"]["contrat_type"]
          updated_at: string
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          agence_interim?: string | null
          categories_permis?: Database["public"]["Enums"]["categorie_permis"][]
          competences_polyvalentes?: Json
          created_at?: string
          date_entree?: string | null
          date_naissance?: string | null
          date_sortie?: string | null
          email?: string | null
          est_cadre?: boolean
          est_livreur?: boolean
          forfait?: boolean
          id?: string
          is_apprenti?: boolean
          matricule_silae?: string | null
          metier_principal_id: number
          metiers_secondaires?: number[]
          mobile?: string | null
          niveau_seniorite?: number
          nom: string
          non_staffing?: boolean
          notes?: string | null
          poste_principal?: string | null
          prenom: string
          profile_id?: string | null
          sous_type_contrat?: string | null
          statut_contrat?:
            | Database["public"]["Enums"]["statut_contrat_type"]
            | null
          taux_horaire_brut?: number | null
          taux_horaire_charge?: number | null
          telephone?: string | null
          type_contrat?: Database["public"]["Enums"]["contrat_type"]
          updated_at?: string
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          agence_interim?: string | null
          categories_permis?: Database["public"]["Enums"]["categorie_permis"][]
          competences_polyvalentes?: Json
          created_at?: string
          date_entree?: string | null
          date_naissance?: string | null
          date_sortie?: string | null
          email?: string | null
          est_cadre?: boolean
          est_livreur?: boolean
          forfait?: boolean
          id?: string
          is_apprenti?: boolean
          matricule_silae?: string | null
          metier_principal_id?: number
          metiers_secondaires?: number[]
          mobile?: string | null
          niveau_seniorite?: number
          nom?: string
          non_staffing?: boolean
          notes?: string | null
          poste_principal?: string | null
          prenom?: string
          profile_id?: string | null
          sous_type_contrat?: string | null
          statut_contrat?:
            | Database["public"]["Enums"]["statut_contrat_type"]
            | null
          taux_horaire_brut?: number | null
          taux_horaire_charge?: number | null
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
      employes_autorisations_vehicules: {
        Row: {
          created_at: string
          created_by: string | null
          date_expiration: string | null
          date_obtention: string | null
          employe_id: string
          fichier_url: string | null
          id: string
          notes: string | null
          numero: string | null
          type_autorisation: Database["public"]["Enums"]["autorisation_vehicule_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_expiration?: string | null
          date_obtention?: string | null
          employe_id: string
          fichier_url?: string | null
          id?: string
          notes?: string | null
          numero?: string | null
          type_autorisation: Database["public"]["Enums"]["autorisation_vehicule_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_expiration?: string | null
          date_obtention?: string | null
          employe_id?: string
          fichier_url?: string | null
          id?: string
          notes?: string | null
          numero?: string | null
          type_autorisation?: Database["public"]["Enums"]["autorisation_vehicule_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employes_autorisations_vehicules_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
        ]
      }
      fabrication_etapes: {
        Row: {
          assignee_id: string | null
          commentaire: string | null
          created_at: string
          date_debut: string | null
          date_fin: string | null
          id: string
          objet_id: string
          statut: Database["public"]["Enums"]["fabrication_etape_statut"]
          type_etape: Database["public"]["Enums"]["fabrication_etape_type"]
          updated_at: string
          validateur_id: string | null
        }
        Insert: {
          assignee_id?: string | null
          commentaire?: string | null
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          id?: string
          objet_id: string
          statut?: Database["public"]["Enums"]["fabrication_etape_statut"]
          type_etape: Database["public"]["Enums"]["fabrication_etape_type"]
          updated_at?: string
          validateur_id?: string | null
        }
        Update: {
          assignee_id?: string | null
          commentaire?: string | null
          created_at?: string
          date_debut?: string | null
          date_fin?: string | null
          id?: string
          objet_id?: string
          statut?: Database["public"]["Enums"]["fabrication_etape_statut"]
          type_etape?: Database["public"]["Enums"]["fabrication_etape_type"]
          updated_at?: string
          validateur_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fabrication_etapes_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrication_etapes_objet_id_fkey"
            columns: ["objet_id"]
            isOneToOne: false
            referencedRelation: "fabrication_objets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrication_etapes_validateur_id_fkey"
            columns: ["validateur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fabrication_etapes_historique: {
        Row: {
          action: string
          ancien_assignee_id: string | null
          ancien_statut:
            | Database["public"]["Enums"]["fabrication_etape_statut"]
            | null
          commentaire: string | null
          created_at: string
          etape_id: string
          fait_par_id: string | null
          id: string
          nouveau_assignee_id: string | null
          nouveau_statut:
            | Database["public"]["Enums"]["fabrication_etape_statut"]
            | null
        }
        Insert: {
          action: string
          ancien_assignee_id?: string | null
          ancien_statut?:
            | Database["public"]["Enums"]["fabrication_etape_statut"]
            | null
          commentaire?: string | null
          created_at?: string
          etape_id: string
          fait_par_id?: string | null
          id?: string
          nouveau_assignee_id?: string | null
          nouveau_statut?:
            | Database["public"]["Enums"]["fabrication_etape_statut"]
            | null
        }
        Update: {
          action?: string
          ancien_assignee_id?: string | null
          ancien_statut?:
            | Database["public"]["Enums"]["fabrication_etape_statut"]
            | null
          commentaire?: string | null
          created_at?: string
          etape_id?: string
          fait_par_id?: string | null
          id?: string
          nouveau_assignee_id?: string | null
          nouveau_statut?:
            | Database["public"]["Enums"]["fabrication_etape_statut"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "fabrication_etapes_historique_ancien_assignee_id_fkey"
            columns: ["ancien_assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrication_etapes_historique_etape_id_fkey"
            columns: ["etape_id"]
            isOneToOne: false
            referencedRelation: "fabrication_etapes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrication_etapes_historique_fait_par_id_fkey"
            columns: ["fait_par_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrication_etapes_historique_nouveau_assignee_id_fkey"
            columns: ["nouveau_assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fabrication_objets: {
        Row: {
          a_construire: boolean
          a_dessiner: boolean
          a_emballer: boolean
          a_usiner: boolean
          affaire_id: string
          archive: boolean
          budget_materiaux: number
          commentaire: string | null
          commentaire_chef: string | null
          created_at: string
          created_by: string | null
          devis_id: string | null
          est_brut: boolean
          heures_prevues_be: number
          heures_prevues_bois: number
          heures_prevues_manutention: number
          heures_prevues_metal: number
          heures_prevues_numerique: number
          heures_prevues_peinture: number
          heures_prevues_tapisserie: number
          id: string
          nom: string
          ordre: number
          quantite: number
          reference: string
          respo_fab_id: string | null
          statut_chef: Database["public"]["Enums"]["objet_fab_statut_chef"]
          statut_chef_updated_at: string | null
          statut_chef_updated_by: string | null
          type_finition: Database["public"]["Enums"]["fabrication_finition_type"]
          updated_at: string
        }
        Insert: {
          a_construire?: boolean
          a_dessiner?: boolean
          a_emballer?: boolean
          a_usiner?: boolean
          affaire_id: string
          archive?: boolean
          budget_materiaux?: number
          commentaire?: string | null
          commentaire_chef?: string | null
          created_at?: string
          created_by?: string | null
          devis_id?: string | null
          est_brut?: boolean
          heures_prevues_be?: number
          heures_prevues_bois?: number
          heures_prevues_manutention?: number
          heures_prevues_metal?: number
          heures_prevues_numerique?: number
          heures_prevues_peinture?: number
          heures_prevues_tapisserie?: number
          id?: string
          nom: string
          ordre?: number
          quantite?: number
          reference: string
          respo_fab_id?: string | null
          statut_chef?: Database["public"]["Enums"]["objet_fab_statut_chef"]
          statut_chef_updated_at?: string | null
          statut_chef_updated_by?: string | null
          type_finition?: Database["public"]["Enums"]["fabrication_finition_type"]
          updated_at?: string
        }
        Update: {
          a_construire?: boolean
          a_dessiner?: boolean
          a_emballer?: boolean
          a_usiner?: boolean
          affaire_id?: string
          archive?: boolean
          budget_materiaux?: number
          commentaire?: string | null
          commentaire_chef?: string | null
          created_at?: string
          created_by?: string | null
          devis_id?: string | null
          est_brut?: boolean
          heures_prevues_be?: number
          heures_prevues_bois?: number
          heures_prevues_manutention?: number
          heures_prevues_metal?: number
          heures_prevues_numerique?: number
          heures_prevues_peinture?: number
          heures_prevues_tapisserie?: number
          id?: string
          nom?: string
          ordre?: number
          quantite?: number
          reference?: string
          respo_fab_id?: string | null
          statut_chef?: Database["public"]["Enums"]["objet_fab_statut_chef"]
          statut_chef_updated_at?: string | null
          statut_chef_updated_by?: string | null
          type_finition?: Database["public"]["Enums"]["fabrication_finition_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fabrication_objets_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "affaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrication_objets_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "v_affaire_consommation"
            referencedColumns: ["affaire_id"]
          },
          {
            foreignKeyName: "fabrication_objets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrication_objets_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "devis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fabrication_objets_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "v_devis_consommation"
            referencedColumns: ["devis_id"]
          },
          {
            foreignKeyName: "fabrication_objets_respo_fab_id_fkey"
            columns: ["respo_fab_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fabrication_objets_photos: {
        Row: {
          commentaire: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          objet_id: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          commentaire?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          objet_id: string
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          commentaire?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          objet_id?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fabrication_objets_photos_objet_id_fkey"
            columns: ["objet_id"]
            isOneToOne: false
            referencedRelation: "fabrication_objets"
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
      feuille_route_lignes: {
        Row: {
          adresse_override: string | null
          affaire_id: string
          commentaires: string | null
          created_at: string
          created_by: string | null
          date: string
          horaire_rdv: string | null
          id: string
          type_operation: string | null
          updated_at: string
          vehicules_ids: string[]
        }
        Insert: {
          adresse_override?: string | null
          affaire_id: string
          commentaires?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          horaire_rdv?: string | null
          id?: string
          type_operation?: string | null
          updated_at?: string
          vehicules_ids?: string[]
        }
        Update: {
          adresse_override?: string | null
          affaire_id?: string
          commentaires?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          horaire_rdv?: string | null
          id?: string
          type_operation?: string | null
          updated_at?: string
          vehicules_ids?: string[]
        }
        Relationships: []
      }
      heures_saisies: {
        Row: {
          affaire_id: string
          assignation_id: string | null
          commentaire: string | null
          created_at: string
          date: string
          devis_id: string | null
          duree_pause_minutes: number
          employe_id: string
          fabrication_etape_type:
            | Database["public"]["Enums"]["fabrication_etape_type"]
            | null
          fabrication_objet_id: string | null
          heure_debut: string | null
          heure_fin: string | null
          heures_nuit: number
          heures_reelles: number | null
          id: string
          metier_id: number | null
          motif_rejet: string | null
          motif_rejet_lu_le: string | null
          rejete_le: string | null
          rejete_par: string | null
          saisi_par: string | null
          saisi_par_chef: boolean
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
          duree_pause_minutes?: number
          employe_id: string
          fabrication_etape_type?:
            | Database["public"]["Enums"]["fabrication_etape_type"]
            | null
          fabrication_objet_id?: string | null
          heure_debut?: string | null
          heure_fin?: string | null
          heures_nuit?: number
          heures_reelles?: number | null
          id?: string
          metier_id?: number | null
          motif_rejet?: string | null
          motif_rejet_lu_le?: string | null
          rejete_le?: string | null
          rejete_par?: string | null
          saisi_par?: string | null
          saisi_par_chef?: boolean
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
          duree_pause_minutes?: number
          employe_id?: string
          fabrication_etape_type?:
            | Database["public"]["Enums"]["fabrication_etape_type"]
            | null
          fabrication_objet_id?: string | null
          heure_debut?: string | null
          heure_fin?: string | null
          heures_nuit?: number
          heures_reelles?: number | null
          id?: string
          metier_id?: number | null
          motif_rejet?: string | null
          motif_rejet_lu_le?: string | null
          rejete_le?: string | null
          rejete_par?: string | null
          saisi_par?: string | null
          saisi_par_chef?: boolean
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
            foreignKeyName: "heures_saisies_fabrication_objet_id_fkey"
            columns: ["fabrication_objet_id"]
            isOneToOne: false
            referencedRelation: "fabrication_objets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heures_saisies_metier_id_fkey"
            columns: ["metier_id"]
            isOneToOne: false
            referencedRelation: "metiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heures_saisies_metier_id_fkey"
            columns: ["metier_id"]
            isOneToOne: false
            referencedRelation: "v_devis_consommation"
            referencedColumns: ["metier_id"]
          },
          {
            foreignKeyName: "heures_saisies_rejete_par_fkey"
            columns: ["rejete_par"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heures_saisies_saisi_par_fkey"
            columns: ["saisi_par"]
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
          action_type: string | null
          ancien_statut: Database["public"]["Enums"]["heures_statut"] | null
          commentaire: string | null
          created_at: string
          heure_saisie_id: string
          id: string
          nouveau_statut: Database["public"]["Enums"]["heures_statut"]
          pour_compte_de: string | null
          user_id: string | null
        }
        Insert: {
          action_type?: string | null
          ancien_statut?: Database["public"]["Enums"]["heures_statut"] | null
          commentaire?: string | null
          created_at?: string
          heure_saisie_id: string
          id?: string
          nouveau_statut: Database["public"]["Enums"]["heures_statut"]
          pour_compte_de?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string | null
          ancien_statut?: Database["public"]["Enums"]["heures_statut"] | null
          commentaire?: string | null
          created_at?: string
          heure_saisie_id?: string
          id?: string
          nouveau_statut?: Database["public"]["Enums"]["heures_statut"]
          pour_compte_de?: string | null
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
            foreignKeyName: "heures_saisies_historique_pour_compte_de_fkey"
            columns: ["pour_compte_de"]
            isOneToOne: false
            referencedRelation: "employes"
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
      heures_validations: {
        Row: {
          action: string
          commentaire: string | null
          created_at: string
          heure_saisie_id: string
          id: string
          role_au_moment: string
          valeur_apres: number
          valeur_avant: number | null
          valide_at: string
          valide_par_chef_id: string
        }
        Insert: {
          action: string
          commentaire?: string | null
          created_at?: string
          heure_saisie_id: string
          id?: string
          role_au_moment: string
          valeur_apres: number
          valeur_avant?: number | null
          valide_at?: string
          valide_par_chef_id: string
        }
        Update: {
          action?: string
          commentaire?: string | null
          created_at?: string
          heure_saisie_id?: string
          id?: string
          role_au_moment?: string
          valeur_apres?: number
          valeur_avant?: number | null
          valide_at?: string
          valide_par_chef_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "heures_validations_heure_saisie_id_fkey"
            columns: ["heure_saisie_id"]
            isOneToOne: false
            referencedRelation: "heures_saisies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "heures_validations_valide_par_chef_id_fkey"
            columns: ["valide_par_chef_id"]
            isOneToOne: false
            referencedRelation: "employes"
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
      machine_reservation: {
        Row: {
          affaire_id: string
          created_at: string
          date: string
          id: string
          machine_id: string
          step_id: string
        }
        Insert: {
          affaire_id: string
          created_at?: string
          date: string
          id?: string
          machine_id?: string
          step_id: string
        }
        Update: {
          affaire_id?: string
          created_at?: string
          date?: string
          id?: string
          machine_id?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_reservation_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "affaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_reservation_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "v_affaire_consommation"
            referencedColumns: ["affaire_id"]
          },
          {
            foreignKeyName: "machine_reservation_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "staffing_plan_step"
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
      parametres_entreprise: {
        Row: {
          adresse_ligne1: string
          caisse_conges_spectacles: string
          caisse_retraite: string
          code_postal: string
          convention_collective_brochure: string
          convention_collective_nom: string
          created_at: string
          employeur_email_contact: string
          id: string
          label: string
          lieu_signature_defaut: string
          marque_commerciale: string
          medecine_travail: string
          naf: string
          raison_sociale: string
          representant_legal_nom: string
          representant_legal_titre: string
          singleton: boolean
          siret: string
          updated_at: string
          urssaf: string
          ville: string
        }
        Insert: {
          adresse_ligne1: string
          caisse_conges_spectacles: string
          caisse_retraite: string
          code_postal: string
          convention_collective_brochure: string
          convention_collective_nom: string
          created_at?: string
          employeur_email_contact?: string
          id?: string
          label: string
          lieu_signature_defaut: string
          marque_commerciale: string
          medecine_travail: string
          naf: string
          raison_sociale: string
          representant_legal_nom: string
          representant_legal_titre: string
          singleton?: boolean
          siret: string
          updated_at?: string
          urssaf: string
          ville: string
        }
        Update: {
          adresse_ligne1?: string
          caisse_conges_spectacles?: string
          caisse_retraite?: string
          code_postal?: string
          convention_collective_brochure?: string
          convention_collective_nom?: string
          created_at?: string
          employeur_email_contact?: string
          id?: string
          label?: string
          lieu_signature_defaut?: string
          marque_commerciale?: string
          medecine_travail?: string
          naf?: string
          raison_sociale?: string
          representant_legal_nom?: string
          representant_legal_titre?: string
          singleton?: boolean
          siret?: string
          updated_at?: string
          urssaf?: string
          ville?: string
        }
        Relationships: []
      }
      postes_catalogue: {
        Row: {
          actif: boolean
          created_at: string
          id: string
          libelle: string
          ordre: number
          updated_at: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          id?: string
          libelle: string
          ordre?: number
          updated_at?: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          id?: string
          libelle?: string
          ordre?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          adresse_code_postal: string | null
          adresse_pays: string | null
          adresse_rue: string | null
          adresse_ville: string | null
          avatar_path: string | null
          avatar_url: string | null
          bio_courte: string | null
          contact_urgence_lien: string | null
          contact_urgence_nom: string | null
          contact_urgence_telephone: string | null
          created_at: string
          dashboard_layout: Json | null
          date_naissance: string | null
          derniere_connexion_le: string | null
          email: string
          est_bureau_etude: boolean
          est_chef_projet: boolean
          est_finition: boolean
          est_manutention: boolean
          est_respo_fab: boolean
          est_usinage_numerique: boolean
          full_name: string | null
          id: string
          matricule_silae: string | null
          password_set_at: string | null
          password_set_done: boolean
          profile_completed_at: string | null
          rgpd_consent_at: string | null
          telephone: string | null
          updated_at: string
        }
        Insert: {
          adresse_code_postal?: string | null
          adresse_pays?: string | null
          adresse_rue?: string | null
          adresse_ville?: string | null
          avatar_path?: string | null
          avatar_url?: string | null
          bio_courte?: string | null
          contact_urgence_lien?: string | null
          contact_urgence_nom?: string | null
          contact_urgence_telephone?: string | null
          created_at?: string
          dashboard_layout?: Json | null
          date_naissance?: string | null
          derniere_connexion_le?: string | null
          email: string
          est_bureau_etude?: boolean
          est_chef_projet?: boolean
          est_finition?: boolean
          est_manutention?: boolean
          est_respo_fab?: boolean
          est_usinage_numerique?: boolean
          full_name?: string | null
          id: string
          matricule_silae?: string | null
          password_set_at?: string | null
          password_set_done?: boolean
          profile_completed_at?: string | null
          rgpd_consent_at?: string | null
          telephone?: string | null
          updated_at?: string
        }
        Update: {
          adresse_code_postal?: string | null
          adresse_pays?: string | null
          adresse_rue?: string | null
          adresse_ville?: string | null
          avatar_path?: string | null
          avatar_url?: string | null
          bio_courte?: string | null
          contact_urgence_lien?: string | null
          contact_urgence_nom?: string | null
          contact_urgence_telephone?: string | null
          created_at?: string
          dashboard_layout?: Json | null
          date_naissance?: string | null
          derniere_connexion_le?: string | null
          email?: string
          est_bureau_etude?: boolean
          est_chef_projet?: boolean
          est_finition?: boolean
          est_manutention?: boolean
          est_respo_fab?: boolean
          est_usinage_numerique?: boolean
          full_name?: string | null
          id?: string
          matricule_silae?: string | null
          password_set_at?: string | null
          password_set_done?: boolean
          profile_completed_at?: string | null
          rgpd_consent_at?: string | null
          telephone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quiz_responses: {
        Row: {
          answer_index: number
          answered_at: string
          answered_day_paris: string
          id: string
          is_correct: boolean
          points_earned: number
          quiz_id: string
          streak_at_answer: number
          user_id: string
        }
        Insert: {
          answer_index: number
          answered_at?: string
          answered_day_paris?: string
          id?: string
          is_correct: boolean
          points_earned?: number
          quiz_id: string
          streak_at_answer?: number
          user_id: string
        }
        Update: {
          answer_index?: number
          answered_at?: string
          answered_day_paris?: string
          id?: string
          is_correct?: boolean
          points_earned?: number
          quiz_id?: string
          streak_at_answer?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_responses_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "content_quiz"
            referencedColumns: ["id"]
          },
        ]
      }
      sous_traitants: {
        Row: {
          actif: boolean
          adresse: string | null
          contact_nom: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          nom: string
          notes: string | null
          siret: string | null
          tarif_jour_eur: number | null
          tarif_km_eur: number | null
          telephone: string | null
          type: Database["public"]["Enums"]["sous_traitant_type"]
          updated_at: string
        }
        Insert: {
          actif?: boolean
          adresse?: string | null
          contact_nom?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          nom: string
          notes?: string | null
          siret?: string | null
          tarif_jour_eur?: number | null
          tarif_km_eur?: number | null
          telephone?: string | null
          type?: Database["public"]["Enums"]["sous_traitant_type"]
          updated_at?: string
        }
        Update: {
          actif?: boolean
          adresse?: string | null
          contact_nom?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          nom?: string
          notes?: string | null
          siret?: string | null
          tarif_jour_eur?: number | null
          tarif_km_eur?: number | null
          telephone?: string | null
          type?: Database["public"]["Enums"]["sous_traitant_type"]
          updated_at?: string
        }
        Relationships: []
      }
      staffing_plan: {
        Row: {
          affaire_id: string
          created_at: string
          created_by: string | null
          date_debut_fab: string
          date_fin_fab: string
          id: string
          include_weekends: boolean
          is_manut_absorbed: boolean
          parent_plan_id: string | null
          published_at: string | null
          published_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          affaire_id: string
          created_at?: string
          created_by?: string | null
          date_debut_fab: string
          date_fin_fab: string
          id?: string
          include_weekends?: boolean
          is_manut_absorbed?: boolean
          parent_plan_id?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          affaire_id?: string
          created_at?: string
          created_by?: string | null
          date_debut_fab?: string
          date_fin_fab?: string
          id?: string
          include_weekends?: boolean
          is_manut_absorbed?: boolean
          parent_plan_id?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffing_plan_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "affaires"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_plan_affaire_id_fkey"
            columns: ["affaire_id"]
            isOneToOne: false
            referencedRelation: "v_affaire_consommation"
            referencedColumns: ["affaire_id"]
          },
          {
            foreignKeyName: "staffing_plan_parent_plan_id_fkey"
            columns: ["parent_plan_id"]
            isOneToOne: false
            referencedRelation: "staffing_plan"
            referencedColumns: ["id"]
          },
        ]
      }
      staffing_plan_assignment: {
        Row: {
          created_at: string
          date: string
          employe_id: string
          id: string
          presence_pct: number
          step_id: string
        }
        Insert: {
          created_at?: string
          date: string
          employe_id: string
          id?: string
          presence_pct?: number
          step_id: string
        }
        Update: {
          created_at?: string
          date?: string
          employe_id?: string
          id?: string
          presence_pct?: number
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffing_plan_assignment_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_plan_assignment_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "staffing_plan_step"
            referencedColumns: ["id"]
          },
        ]
      }
      staffing_plan_object: {
        Row: {
          created_at: string
          display_order: number
          id: string
          included: boolean
          objet_id: string
          plan_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          included?: boolean
          objet_id: string
          plan_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          included?: boolean
          objet_id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffing_plan_object_objet_id_fkey"
            columns: ["objet_id"]
            isOneToOne: false
            referencedRelation: "fabrication_objets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_plan_object_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "staffing_plan"
            referencedColumns: ["id"]
          },
        ]
      }
      staffing_plan_snapshot: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          plan_id: string
          reason: string
          snapshot_data: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          plan_id: string
          reason: string
          snapshot_data: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          plan_id?: string
          reason?: string
          snapshot_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "staffing_plan_snapshot_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "staffing_plan"
            referencedColumns: ["id"]
          },
        ]
      }
      staffing_plan_step: {
        Row: {
          created_at: string
          h_par_jour: number
          id: string
          manual_pers: boolean
          manual_shift: number
          manual_span_demi: number | null
          metier_id: number
          objet_id: string | null
          pers: number
          phase: string | null
          plan_id: string
          source: string
          span_days: number
          span_demi_jours: number | null
          start_date: string
          start_half_day: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          h_par_jour?: number
          id?: string
          manual_pers?: boolean
          manual_shift?: number
          manual_span_demi?: number | null
          metier_id: number
          objet_id?: string | null
          pers: number
          phase?: string | null
          plan_id: string
          source?: string
          span_days: number
          span_demi_jours?: number | null
          start_date: string
          start_half_day?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          h_par_jour?: number
          id?: string
          manual_pers?: boolean
          manual_shift?: number
          manual_span_demi?: number | null
          metier_id?: number
          objet_id?: string | null
          pers?: number
          phase?: string | null
          plan_id?: string
          source?: string
          span_days?: number
          span_demi_jours?: number | null
          start_date?: string
          start_half_day?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staffing_plan_step_metier_id_fkey"
            columns: ["metier_id"]
            isOneToOne: false
            referencedRelation: "metiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_plan_step_metier_id_fkey"
            columns: ["metier_id"]
            isOneToOne: false
            referencedRelation: "v_devis_consommation"
            referencedColumns: ["metier_id"]
          },
          {
            foreignKeyName: "staffing_plan_step_objet_id_fkey"
            columns: ["objet_id"]
            isOneToOne: false
            referencedRelation: "fabrication_objets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staffing_plan_step_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "staffing_plan"
            referencedColumns: ["id"]
          },
        ]
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
          aller_retour: boolean
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
          prestataire: string | null
          reference: string | null
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
          aller_retour?: boolean
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
          prestataire?: string | null
          reference?: string | null
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
          aller_retour?: boolean
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
          prestataire?: string | null
          reference?: string | null
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
      user_quiz_stats: {
        Row: {
          accuracy_pct: number | null
          best_streak: number | null
          current_streak: number | null
          last_answered_at: string | null
          rank_global: number | null
          rank_weekly: number | null
          total_answered: number | null
          total_correct: number | null
          total_points: number | null
          user_id: string | null
          week_points: number | null
        }
        Relationships: []
      }
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
      v_chefs_par_affaire: {
        Row: {
          affaire_id: string | null
          employe_id: string | null
          role: string | null
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
      v_documents_supprimes_30j: {
        Row: {
          affaire_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_email: string | null
          filename: string | null
          id: string | null
          source: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Relationships: []
      }
      v_employes_autorisations_actives: {
        Row: {
          created_at: string | null
          created_by: string | null
          date_expiration: string | null
          date_obtention: string | null
          employe_id: string | null
          fichier_url: string | null
          id: string | null
          jours_restants: number | null
          notes: string | null
          numero: string | null
          statut_validite: string | null
          type_autorisation:
            | Database["public"]["Enums"]["autorisation_vehicule_type"]
            | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date_expiration?: string | null
          date_obtention?: string | null
          employe_id?: string | null
          fichier_url?: string | null
          id?: string | null
          jours_restants?: never
          notes?: string | null
          numero?: string | null
          statut_validite?: never
          type_autorisation?:
            | Database["public"]["Enums"]["autorisation_vehicule_type"]
            | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date_expiration?: string | null
          date_obtention?: string | null
          employe_id?: string | null
          fichier_url?: string | null
          id?: string | null
          jours_restants?: never
          notes?: string | null
          numero?: string | null
          statut_validite?: never
          type_autorisation?:
            | Database["public"]["Enums"]["autorisation_vehicule_type"]
            | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employes_autorisations_vehicules_employe_id_fkey"
            columns: ["employe_id"]
            isOneToOne: false
            referencedRelation: "employes"
            referencedColumns: ["id"]
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
          duree_pause_minutes: number
          employe_id: string
          fabrication_etape_type:
            | Database["public"]["Enums"]["fabrication_etape_type"]
            | null
          fabrication_objet_id: string | null
          heure_debut: string | null
          heure_fin: string | null
          heures_nuit: number
          heures_reelles: number | null
          id: string
          metier_id: number | null
          motif_rejet: string | null
          motif_rejet_lu_le: string | null
          rejete_le: string | null
          rejete_par: string | null
          saisi_par: string | null
          saisi_par_chef: boolean
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
      activate_contrat_template: {
        Args: { p_template_id: string }
        Returns: undefined
      }
      admin_get_auth_events: {
        Args: {
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_to?: string
          p_types?: string[]
        }
        Returns: {
          action: string
          actor_email: string
          actor_id: string
          actor_name: string
          created_at: string
          id: string
          ip_address: string
          log_type: string
          raw_payload: Json
        }[]
      }
      admin_get_invitations: {
        Args: never
        Returns: {
          email: string
          email_confirmed_at: string
          full_name: string
          invited_at: string
          invited_by: string
          invited_by_name: string
          last_sign_in_at: string
          role: string
          statut: string
          user_id: string
        }[]
      }
      admin_get_user_connection_stats: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          email_confirmed_at: string
          full_name: string
          last_sign_in_at: string
          role: string
          sessions_30d: number
          status: string
          user_id: string
        }[]
      }
      annuler_contrat_intermittent: {
        Args: { p_contrat_id: string; p_motif?: string }
        Returns: undefined
      }
      can_saisie_on_affaire: {
        Args: { _affaire_id: string; _date: string }
        Returns: boolean
      }
      cleanup_fabrication_orphelins: {
        Args: { p_affaire_id: string }
        Returns: Json
      }
      compute_affaire_typologie: { Args: { num: string }; Returns: string }
      create_contrat_intermittent:
        | {
            Args: {
              _chantier_id: string
              _date_debut: string
              _date_fin: string
              _employee_id: string
              _heures_estimees: number
              _staffing_id?: string
            }
            Returns: string
          }
        | {
            Args: {
              _chantier_id: string
              _date_debut: string
              _date_fin: string
              _employee_id: string
              _heures_estimees: number
              _staffing_id: string
            }
            Returns: string
          }
      create_contrat_template_version:
        | {
            Args: { p_actif?: boolean; p_contenu_html: string; p_nom: string }
            Returns: string
          }
        | {
            Args: {
              p_actif?: boolean
              p_contenu_html: string
              p_contenu_json?: Json
              p_nom: string
              p_notes?: string
            }
            Returns: string
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
      current_user_is_chef_on_affaire: {
        Args: { _affaire_id: string }
        Returns: boolean
      }
      delete_devis_atomique: { Args: { p_devis_id: string }; Returns: Json }
      delete_my_hors_planning_saisie: {
        Args: { _saisie_id: string }
        Returns: boolean
      }
      etape_for_metier: {
        Args: { metier: string }
        Returns: Database["public"]["Enums"]["fabrication_etape_type"]
      }
      get_active_contrat_template_id: { Args: never; Returns: string }
      get_last_used_codes: {
        Args: { _n?: number; _prefix: number }
        Returns: {
          client: string
          code: string
          nom: string
          signed_at: string
        }[]
      }
      get_mon_equipe_type: {
        Args: { _limit?: number; _months?: number; _typologie?: string }
        Returns: {
          derniere_collab: string
          employe_id: string
          metier_principal_id: number
          nb_chantiers: number
          nom: string
          poste_principal: string
          prenom: string
          presence_pct_moyen: number
          score: number
          total_demi_jours: number
          type_contrat: string
        }[]
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
      import_devis_atomique_v2: {
        Args: {
          _affaire_id: string
          _date_demontage: string
          _date_montage: string
          _devis: Json
          _fichier_hash?: string
          _heures_demontage?: number
          _heures_montage?: number
          _new_affaire: Json
          _objets_fab?: Json
          _postes: Json
        }
        Returns: Json
      }
      import_devis_atomique_v3: {
        Args: {
          _affaire_id: string
          _bulk_assign?: Json
          _date_demontage: string
          _date_montage: string
          _devis: Json
          _fichier_hash?: string
          _heures_demontage?: number
          _heures_montage?: number
          _new_affaire: Json
          _objets_fab?: Json
          _postes: Json
        }
        Returns: Json
      }
      import_progbat_atomique: {
        Args: {
          p_affaire_id: string
          p_heures_demontage?: number
          p_heures_montage?: number
          p_objets: Json
        }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_affaire_open: { Args: { _affaire_id: string }; Returns: boolean }
      is_chef_global: { Args: never; Returns: boolean }
      is_chef_metier_scoped: { Args: never; Returns: boolean }
      is_chef_metier_scoped_for_employe: {
        Args: { _employe_id: string }
        Returns: boolean
      }
      is_chef_on_affaire: {
        Args: { _affaire_id: string; _employe_id: string }
        Returns: boolean
      }
      is_chef_or_admin: { Args: never; Returns: boolean }
      is_devis_termine: { Args: { _devis_id: string }; Returns: boolean }
      is_profile_complete: { Args: { p_id: string }; Returns: boolean }
      mes_affaires_chef: {
        Args: { _employe_id: string }
        Returns: {
          affaire: Database["public"]["Tables"]["affaires"]["Row"]
          mes_roles: string[]
        }[]
      }
      next_affaire_numero: { Args: { _prefix: number }; Returns: string }
      preflight_delete_devis: { Args: { p_devis_id: string }; Returns: Json }
      preflight_import_devis: {
        Args: { _affaire_id?: string; _fichier_hash: string }
        Returns: Json
      }
      refresh_affaire_equipe_historique: {
        Args: { _affaire_id: string }
        Returns: undefined
      }
      refresh_user_quiz_stats: { Args: never; Returns: undefined }
      set_contrat_pdf_url: {
        Args: { p_contrat_id: string; p_url: string; p_version: number }
        Returns: undefined
      }
      set_vehicule_chauffeurs_autorises: {
        Args: { _employe_ids: string[]; _vehicule_id: string }
        Returns: undefined
      }
      sign_opportunite: {
        Args: { _affaire_id: string; _new_code: string }
        Returns: string
      }
      signer_contrat_employe: {
        Args: {
          p_client_ip?: string
          p_contrat_id: string
          p_pdf_hash_sha256: string
          p_pdf_v2_url: string
          p_signature_image_url: string
          p_user_agent?: string
        }
        Returns: string
      }
      signer_contrat_employeur: {
        Args: {
          p_client_ip?: string
          p_contrat_id: string
          p_pdf_hash_sha256: string
          p_pdf_v3_url: string
          p_signature_image_url: string
          p_user_agent?: string
        }
        Returns: string
      }
      soft_delete_affaire_document: {
        Args: { _id: string }
        Returns: undefined
      }
      soft_delete_objet_photo: { Args: { _id: string }; Returns: undefined }
      staffer_mobile_create_mission: {
        Args: {
          _chantier_id: string
          _date_debut: string
          _date_fin: string
          _employee_id: string
          _metier_id: number
          _slot: string
        }
        Returns: Json
      }
      submit_quiz_answer: {
        Args: { p_answer_index: number; p_quiz_id: string }
        Returns: Json
      }
      update_objet_statut_chef: {
        Args: {
          _commentaire?: string
          _objet_id: string
          _statut: Database["public"]["Enums"]["objet_fab_statut_chef"]
        }
        Returns: undefined
      }
      upsert_feuille_route_ligne: {
        Args: { _affaire_id: string; _date: string; _patch: Json }
        Returns: {
          adresse_override: string | null
          affaire_id: string
          commentaires: string | null
          created_at: string
          created_by: string | null
          date: string
          horaire_rdv: string | null
          id: string
          type_operation: string | null
          updated_at: string
          vehicules_ids: string[]
        }
        SetofOptions: {
          from: "*"
          to: "feuille_route_lignes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_intermittent: {
        Args: {
          _adresse: string
          _cp: string
          _date_naissance: string
          _email: string
          _forfait: boolean
          _nom_complet: string
          _poste: string
          _statut: string
          _taux_brut: number
          _taux_charge: number
          _ville: string
        }
        Returns: string
      }
      user_has_affaire_access: {
        Args: { _affaire_id: string }
        Returns: boolean
      }
      user_is_mentioned_on_affaire: {
        Args: { _affaire_id: string }
        Returns: boolean
      }
    }
    Enums: {
      absence_type: "conges" | "formation" | "arret_maladie" | "rtt" | "autre"
      adresse_favorite_type: "entrepot" | "client" | "fournisseur" | "autre"
      affaire_phase: "opportunite" | "signe"
      affaire_statut: "prospect" | "en_cours" | "termine" | "annule"
      app_role: "admin" | "chef_chantier" | "employe" | "chef_metier_scoped"
      autorisation_vehicule_type:
        | "PERMIS_B"
        | "PERMIS_C"
        | "PERMIS_CE"
        | "PERMIS_D"
        | "CACES_R489"
        | "CACES_R486"
        | "CACES_R484"
      categorie_permis: "B" | "C" | "CE" | "D"
      competence_niveau: "secondaire" | "depannage" | "bloque"
      confirmation_status:
        | "non_requise"
        | "en_attente"
        | "confirmee"
        | "refusee"
      contrat_intermittent_statut:
        | "a_signer_employe"
        | "a_signer_employeur"
        | "signe"
        | "archive"
        | "annule"
      contrat_type: "CDI" | "Interim" | "CDD" | "Independant"
      demi_journee_type: "AM" | "PM" | "JOURNEE"
      devis_statut:
        | "brouillon"
        | "signe"
        | "facture"
        | "en_cours"
        | "termine"
        | "cloture"
      fabrication_etape_statut:
        | "a_faire"
        | "en_cours"
        | "termine"
        | "non_applicable"
      fabrication_etape_type:
        | "be"
        | "usinage"
        | "respo_fab"
        | "finition"
        | "manutention"
      fabrication_finition_type: "peinture" | "tapisserie" | "autre" | "aucune"
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
        | "fabrication_pret_livraison"
        | "fabrication_assignation"
        | "affaire_signee"
        | "staffing_publie"
        | "system"
      objet_fab_statut_chef: "a_faire" | "en_cours" | "bloque" | "fini"
      opportunite_statut: "a_faire" | "envoye" | "gagne" | "perdu" | "termine"
      opportunite_taille:
        | "tres_petit"
        | "petit"
        | "moyen"
        | "gros"
        | "tres_gros"
      permis_type: "B" | "C" | "CE"
      signataire_role: "employe" | "employeur"
      sous_traitant_type: "transport" | "manutention" | "fabrication" | "autre"
      statut_contrat_type:
        | "CDI"
        | "CDDU intermittent"
        | "CDD chantier"
        | "Intérim"
        | "Apprenti"
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
      app_role: ["admin", "chef_chantier", "employe", "chef_metier_scoped"],
      autorisation_vehicule_type: [
        "PERMIS_B",
        "PERMIS_C",
        "PERMIS_CE",
        "PERMIS_D",
        "CACES_R489",
        "CACES_R486",
        "CACES_R484",
      ],
      categorie_permis: ["B", "C", "CE", "D"],
      competence_niveau: ["secondaire", "depannage", "bloque"],
      confirmation_status: [
        "non_requise",
        "en_attente",
        "confirmee",
        "refusee",
      ],
      contrat_intermittent_statut: [
        "a_signer_employe",
        "a_signer_employeur",
        "signe",
        "archive",
        "annule",
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
      fabrication_etape_statut: [
        "a_faire",
        "en_cours",
        "termine",
        "non_applicable",
      ],
      fabrication_etape_type: [
        "be",
        "usinage",
        "respo_fab",
        "finition",
        "manutention",
      ],
      fabrication_finition_type: ["peinture", "tapisserie", "autre", "aucune"],
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
        "fabrication_pret_livraison",
        "fabrication_assignation",
        "affaire_signee",
        "staffing_publie",
        "system",
      ],
      objet_fab_statut_chef: ["a_faire", "en_cours", "bloque", "fini"],
      opportunite_statut: ["a_faire", "envoye", "gagne", "perdu", "termine"],
      opportunite_taille: ["tres_petit", "petit", "moyen", "gros", "tres_gros"],
      permis_type: ["B", "C", "CE"],
      signataire_role: ["employe", "employeur"],
      sous_traitant_type: ["transport", "manutention", "fabrication", "autre"],
      statut_contrat_type: [
        "CDI",
        "CDDU intermittent",
        "CDD chantier",
        "Intérim",
        "Apprenti",
      ],
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
