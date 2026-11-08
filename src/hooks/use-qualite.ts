import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lireQualite } from "@/lib/qualite-lecture.functions";
import { useAuth } from "@/lib/auth-context";
export function useQualite() {
  const lire=useServerFn(lireQualite);
  const {user,roles}=useAuth();
  return useQuery({queryKey:["qualite-donnees",user?.id],queryFn:()=>lire(),enabled:roles.includes("admin"),staleTime:60_000});
}