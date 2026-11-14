import { Link } from "@tanstack/react-router";
import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChantiersVueSwitch({ vue }: { vue: "fiches" | "liste" }) {
  return <nav aria-label="Vue des chantiers" className="inline-flex gap-1 rounded-md bg-muted p-1">
    <Button asChild size="sm" variant={vue === "fiches" ? "secondary" : "ghost"}>
      <Link to="/affaires" aria-current={vue === "fiches" ? "page" : undefined}><LayoutGrid className="mr-1.5 h-4 w-4" />Fiches</Link>
    </Button>
    <Button asChild size="sm" variant={vue === "liste" ? "secondary" : "ghost"}>
      <Link to="/liste-chantiers" aria-current={vue === "liste" ? "page" : undefined}><List className="mr-1.5 h-4 w-4" />Liste</Link>
    </Button>
  </nav>;
}
