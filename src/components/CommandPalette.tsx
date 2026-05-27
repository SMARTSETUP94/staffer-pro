import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Building2,
  Users,
  Calendar,
  CalendarOff,
  ClipboardCheck,
  Settings,
  FileUp,
  FileDown,
  LayoutDashboard,
  Clock,
  Truck,
  FileQuestion,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { usePreview } from "@/lib/preview-context";

interface SearchAffaire {
  id: string;
  numero: string;
  nom: string;
}
interface SearchEmploye {
  id: string;
  prenom: string;
  nom: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [affaires, setAffaires] = useState<SearchAffaire[]>([]);
  const [employes, setEmployes] = useState<SearchEmploye[]>([]);
  const navigate = useNavigate();
  const { effectiveRole } = usePreview();
  const isAdminOrChef = effectiveRole === "admin" || effectiveRole === "chef_chantier";

  // Raccourci Ctrl+K / Cmd+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Recherche affaires + employés debounced
  useEffect(() => {
    if (!open || !isAdminOrChef) return;
    const q = query.trim();
    const t = setTimeout(async () => {
      const [aRes, eRes] = await Promise.all([
        q.length === 0
          ? supabase.from("affaires").select("id, numero, nom").order("created_at", { ascending: false }).limit(8)
          : supabase
              .from("affaires")
              .select("id, numero, nom")
              .or(`numero.ilike.%${q}%,nom.ilike.%${q}%,client.ilike.%${q}%`)
              .limit(8),
        q.length === 0
          ? supabase.from("employes").select("id, prenom, nom").eq("actif", true).order("nom").limit(8)
          : supabase
              .from("employes")
              .select("id, prenom, nom")
              .or(`nom.ilike.%${q}%,prenom.ilike.%${q}%`)
              .eq("actif", true)
              .limit(8),
      ]);
      setAffaires(aRes.data ?? []);
      setEmployes(eRes.data ?? []);
    }, 150);
    return () => clearTimeout(t);
  }, [query, open, isAdminOrChef]);

  const navItems = useMemo(() => {
    if (effectiveRole === "employe") {
      return [
        { label: "Mes heures", to: "/mes-heures", icon: Clock },
        // L4d : pas de route /profil dédiée — cf. mem://debts/profil-route-manquante
        { label: "Mon profil", to: "/aujourdhui", icon: Users },
      ];
    }
    return [
      { label: "Tableau de bord", to: "/dashboard", icon: LayoutDashboard },
      { label: "Planning", to: "/planning", icon: Calendar },
      { label: "Chantiers", to: "/affaires", icon: Building2 },
      { label: "Employés", to: "/employes", icon: Users },
      { label: "Absences", to: "/absences", icon: CalendarOff },
      { label: "Validation des heures", to: "/validation-heures", icon: ClipboardCheck },
      { label: "Véhicules", to: "/flotte", icon: Truck },
      { label: "Demandes transport", to: "/export/demandes-devis", icon: FileQuestion },
      { label: "Import employés", to: "/employes/import", icon: FileUp },
      { label: "Import devis", to: "/devis/import", icon: FileUp },
      { label: "Export planning", to: "/export", icon: FileDown },
      ...(effectiveRole === "admin"
        ? [{ label: "Paramètres utilisateurs", to: "/admin/utilisateurs", icon: Settings }]
        : []),
    ];
  }, [effectiveRole]);

  const go = (to: string) => {
    setOpen(false);
    setQuery("");
    navigate({ to });
  };

  const goAffaire = (id: string) => {
    setOpen(false);
    setQuery("");
    navigate({ to: "/affaires/$affaireId", params: { affaireId: id } });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Rechercher une affaire, un employé, une page…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItem
              key={item.to}
              value={`nav-${item.label}`}
              onSelect={() => go(item.to)}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {isAdminOrChef && affaires.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Chantiers">
              {affaires.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`affaire-${a.numero}-${a.nom}`}
                  onSelect={() => goAffaire(a.id)}
                >
                  <Building2 className="h-4 w-4" />
                  <span className="font-medium">{a.numero}</span>
                  <span className="text-muted-foreground truncate">— {a.nom}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {isAdminOrChef && employes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Employés">
              {employes.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`employe-${e.prenom}-${e.nom}`}
                  onSelect={() => go("/employes")}
                >
                  <Users className="h-4 w-4" />
                  <span>
                    {e.prenom} {e.nom}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
