import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Check, ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useMetiers } from "@/hooks/use-metiers";
import {
  stepIdentiteSchema,
  stepProSchema,
  stepSecuriteSchema,
} from "@/lib/onboarding-schemas";
import { uploadAvatar } from "@/lib/avatar-upload";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Bienvenue — Setup Paris" },
      { name: "description", content: "Compléter votre profil Setup Paris." },
    ],
  }),
  component: OnboardingPage,
});

const STEP_LABELS = ["Bienvenue", "Identité", "Pro", "Sécurité"] as const;

type FormData = {
  // RGPD
  rgpd_consent: boolean;
  // Identité
  avatar_url: string;
  telephone: string;
  date_naissance: string;
  bio_courte: string;
  // Pro
  metier_principal_id: number | null;
  permis_types: string[];
  // Sécurité
  adresse_rue: string;
  adresse_code_postal: string;
  adresse_ville: string;
  adresse_pays: string;
  contact_urgence_nom: string;
  contact_urgence_telephone: string;
  contact_urgence_lien: "conjoint" | "parent" | "frere_soeur" | "ami" | "autre" | "";
};

const PERMIS_OPTIONS = ["B", "C", "CE", "D"] as const;
type PermisType = (typeof PERMIS_OPTIONS)[number];

function OnboardingPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { metiers } = useMetiers();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [employeId, setEmployeId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormData>({
    rgpd_consent: false,
    avatar_url: "",
    telephone: "",
    date_naissance: "",
    bio_courte: "",
    metier_principal_id: null,
    permis_types: [],
    adresse_rue: "",
    adresse_code_postal: "",
    adresse_ville: "",
    adresse_pays: "France",
    contact_urgence_nom: "",
    contact_urgence_telephone: "",
    contact_urgence_lien: "",
  });

  // Charger profil existant
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.profile_completed_at) {
        navigate({ to: "/dashboard" });
        return;
      }
      const { data: emp } = await supabase
        .from("employes")
        .select("id, metier_principal_id, categories_permis")
        .eq("profile_id", user.id)
        .maybeSingle();
      setEmployeId(emp?.id ?? null);
      if (profile) {
        setForm((f) => ({
          ...f,
          rgpd_consent: Boolean(profile.rgpd_consent_at),
          avatar_url: profile.avatar_url ?? "",
          telephone: profile.telephone ?? "",
          date_naissance: profile.date_naissance ?? "",
          bio_courte: profile.bio_courte ?? "",
          adresse_rue: profile.adresse_rue ?? "",
          adresse_code_postal: profile.adresse_code_postal ?? "",
          adresse_ville: profile.adresse_ville ?? "",
          adresse_pays: profile.adresse_pays ?? "France",
          contact_urgence_nom: profile.contact_urgence_nom ?? "",
          contact_urgence_telephone: profile.contact_urgence_telephone ?? "",
          contact_urgence_lien: (profile.contact_urgence_lien as FormData["contact_urgence_lien"]) ?? "",
          metier_principal_id: emp?.metier_principal_id ?? null,
          permis_types: (emp?.categories_permis as string[] | null) ?? [],
        }));
        if (profile.rgpd_consent_at) setStep((s) => Math.max(s, 1));
      }
      setLoading(false);
    })();
  }, [user, authLoading, navigate]);

  const percent = useMemo(() => Math.round(((step + 1) / STEP_LABELS.length) * 100), [step]);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const { [key as string]: _drop, ...rest } = e;
      return rest;
    });
  }

  // ---- Persist helpers
  async function saveStep0() {
    if (!form.rgpd_consent) {
      setErrors({ rgpd_consent: "Consentement obligatoire" });
      return false;
    }
    if (!user) return false;
    const { error } = await supabase
      .from("profiles")
      .update({ rgpd_consent_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) {
      toast.error("Erreur sauvegarde RGPD");
      return false;
    }
    return true;
  }

  async function saveStep1() {
    const parsed = stepIdentiteSchema.safeParse({
      telephone: form.telephone,
      date_naissance: form.date_naissance || undefined,
      bio_courte: form.bio_courte || undefined,
      avatar_url: form.avatar_url || undefined,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        errs[i.path.join(".")] = i.message;
      });
      setErrors(errs);
      return false;
    }
    if (!user) return false;
    const { error } = await supabase
      .from("profiles")
      .update({
        telephone: form.telephone,
        date_naissance: form.date_naissance || null,
        bio_courte: form.bio_courte || null,
        avatar_url: form.avatar_url || null,
      })
      .eq("id", user.id);
    if (error) {
      toast.error("Erreur sauvegarde identité");
      return false;
    }
    return true;
  }

  async function saveStep2() {
    const parsed = stepProSchema.safeParse({
      metier_principal_id: form.metier_principal_id ?? undefined,
      permis_types: form.permis_types,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        errs[i.path.join(".")] = i.message;
      });
      setErrors(errs);
      return false;
    }
    if (employeId) {
      const empUpdate: {
        categories_permis: PermisType[];
        metier_principal_id?: number;
      } = {
        categories_permis: form.permis_types as PermisType[],
      };
      if (form.metier_principal_id) empUpdate.metier_principal_id = form.metier_principal_id;
      const { error } = await supabase.from("employes").update(empUpdate).eq("id", employeId);
      if (error) {
        toast.error("Erreur sauvegarde pro");
        return false;
      }
    }
    return true;
  }

  async function saveStep3(finalize: boolean) {
    const parsed = stepSecuriteSchema.safeParse({
      adresse_rue: form.adresse_rue,
      adresse_code_postal: form.adresse_code_postal,
      adresse_ville: form.adresse_ville,
      adresse_pays: form.adresse_pays || "France",
      contact_urgence_nom: form.contact_urgence_nom,
      contact_urgence_telephone: form.contact_urgence_telephone,
      contact_urgence_lien: form.contact_urgence_lien || undefined,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        errs[i.path.join(".")] = i.message;
      });
      setErrors(errs);
      return false;
    }
    if (!user) return false;
    const profileUpdate: {
      adresse_rue: string;
      adresse_code_postal: string;
      adresse_ville: string;
      adresse_pays: string;
      contact_urgence_nom: string;
      contact_urgence_telephone: string;
      contact_urgence_lien: string | null;
      profile_completed_at?: string;
    } = {
      adresse_rue: form.adresse_rue,
      adresse_code_postal: form.adresse_code_postal,
      adresse_ville: form.adresse_ville,
      adresse_pays: form.adresse_pays || "France",
      contact_urgence_nom: form.contact_urgence_nom,
      contact_urgence_telephone: form.contact_urgence_telephone,
      contact_urgence_lien: form.contact_urgence_lien || null,
    };
    if (finalize) profileUpdate.profile_completed_at = new Date().toISOString();
    const { error } = await supabase.from("profiles").update(profileUpdate).eq("id", user.id);
    if (error) {
      toast.error("Erreur sauvegarde sécurité");
      return false;
    }
    return true;
  }

  async function handleNext() {
    setBusy(true);
    let ok = false;
    if (step === 0) ok = await saveStep0();
    else if (step === 1) ok = await saveStep1();
    else if (step === 2) ok = await saveStep2();
    else if (step === 3) {
      ok = await saveStep3(true);
      if (ok) {
        toast.success("Profil complété 🎉");
        navigate({ to: "/dashboard" });
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    if (ok) setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }

  function handleSkipLater() {
    navigate({ to: "/dashboard" });
  }

  async function handleAvatarUpload(file: File) {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image > 5 Mo");
      return;
    }
    setBusy(true);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (upErr) {
      toast.error("Upload échoué");
      setBusy(false);
      return;
    }
    // Bucket privé : on génère une URL signée longue durée (1 an)
    const { data: signed, error: signErr } = await supabase.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signErr || !signed?.signedUrl) {
      toast.error("Génération de l'URL échouée");
      setBusy(false);
      return;
    }
    update("avatar_url", signed.signedUrl);
    toast.success("Photo importée");
    setBusy(false);
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="mx-auto max-w-2xl">
        {/* Stepper */}
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-semibold">
              Étape {step + 1} / {STEP_LABELS.length} — {STEP_LABELS[step]}
            </span>
            <span className="text-muted-foreground">{percent}%</span>
          </div>
          <Progress value={percent} className="h-2" />
          <div className="mt-3 flex gap-2">
            {STEP_LABELS.map((label, i) => (
              <div
                key={label}
                className={`flex flex-1 items-center gap-1 rounded px-2 py-1 text-xs ${
                  i < step
                    ? "bg-primary/10 text-primary"
                    : i === step
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
                <span className="truncate">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          {step === 0 && <Step0 form={form} update={update} errors={errors} />}
          {step === 1 && (
            <Step1
              form={form}
              update={update}
              errors={errors}
              fileInputRef={fileInputRef}
              onAvatar={handleAvatarUpload}
              busy={busy}
            />
          )}
          {step === 2 && (
            <Step2 form={form} update={update} errors={errors} metiers={metiers} />
          )}
          {step === 3 && <Step3 form={form} update={update} errors={errors} />}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || busy}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Retour
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              {step > 0 && (
                <Button type="button" variant="outline" onClick={handleSkipLater} disabled={busy}>
                  Compléter plus tard
                </Button>
              )}
              <Button type="button" onClick={handleNext} disabled={busy}>
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {step === STEP_LABELS.length - 1 ? "Terminer" : "Continuer"}
                {step !== STEP_LABELS.length - 1 && <ChevronRight className="ml-1 h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Steps ----------

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

function Step0({
  form,
  update,
  errors,
}: {
  form: FormData;
  update: <K extends keyof FormData>(k: K, v: FormData[K]) => void;
  errors: Record<string, string>;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold">Bienvenue chez Setup Paris 👋</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Pour finaliser votre compte, nous avons besoin de quelques informations. Cela prend 2
        minutes — vous pourrez modifier plus tard depuis votre profil.
      </p>
      <div className="mt-6 rounded border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="rgpd"
            checked={form.rgpd_consent}
            onCheckedChange={(v) => update("rgpd_consent", v === true)}
          />
          <div className="text-sm">
            <Label htmlFor="rgpd" className="cursor-pointer font-medium">
              J'accepte que Setup Paris collecte mes données pour la gestion RH
              (paie, planning, contact d'urgence).
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Voir notre{" "}
              <Link to="/privacy" target="_blank" className="text-primary hover:underline">
                politique de confidentialité
              </Link>
              .
            </p>
          </div>
        </div>
        <FieldError message={errors.rgpd_consent} />
      </div>
    </div>
  );
}

function Step1({
  form,
  update,
  errors,
  fileInputRef,
  onAvatar,
  busy,
}: {
  form: FormData;
  update: <K extends keyof FormData>(k: K, v: FormData[K]) => void;
  errors: Record<string, string>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onAvatar: (file: File) => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">Votre identité</h2>

      <div>
        <Label>Photo de profil <span className="text-muted-foreground">(facultatif)</span></Label>
        <div className="mt-2 flex items-center gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-full bg-muted">
            {form.avatar_url ? (
              <img src={form.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                —
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1 h-4 w-4" />
            Choisir une photo
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAvatar(f);
            }}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="tel">Téléphone mobile <span className="text-destructive">*</span></Label>
        <Input
          id="tel"
          type="tel"
          inputMode="tel"
          placeholder="06 12 34 56 78"
          value={form.telephone}
          onChange={(e) => update("telephone", e.target.value)}
        />
        <FieldError message={errors.telephone} />
      </div>

      <div>
        <Label htmlFor="dn">Date de naissance <span className="text-muted-foreground">(facultatif)</span></Label>
        <Input
          id="dn"
          type="date"
          value={form.date_naissance}
          onChange={(e) => update("date_naissance", e.target.value)}
        />
        <FieldError message={errors.date_naissance} />
      </div>

      <div>
        <Label htmlFor="bio">Bio courte <span className="text-muted-foreground">(200 car. max)</span></Label>
        <Textarea
          id="bio"
          maxLength={200}
          value={form.bio_courte}
          onChange={(e) => update("bio_courte", e.target.value)}
          placeholder="Quelques mots sur vous…"
        />
        <FieldError message={errors.bio_courte} />
      </div>
    </div>
  );
}

function Step2({
  form,
  update,
  errors,
  metiers,
}: {
  form: FormData;
  update: <K extends keyof FormData>(k: K, v: FormData[K]) => void;
  errors: Record<string, string>;
  metiers: Array<{ id: number; libelle: string }>;
}) {
  function togglePermis(p: string) {
    const has = form.permis_types.includes(p);
    update(
      "permis_types",
      has ? form.permis_types.filter((x) => x !== p) : [...form.permis_types, p],
    );
  }
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">Votre profil pro</h2>

      <div>
        <Label>Métier principal <span className="text-muted-foreground">(facultatif)</span></Label>
        <Select
          value={form.metier_principal_id ? String(form.metier_principal_id) : ""}
          onValueChange={(v) => update("metier_principal_id", v ? Number(v) : null)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choisir un métier" />
          </SelectTrigger>
          <SelectContent>
            {metiers.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>
                {m.libelle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError message={errors.metier_principal_id} />
      </div>

      <div>
        <Label>Permis <span className="text-muted-foreground">(facultatif)</span></Label>
        <div className="mt-2 flex flex-wrap gap-3">
          {PERMIS_OPTIONS.map((p) => (
            <label key={p} className="flex cursor-pointer items-center gap-2 rounded border border-border px-3 py-1.5 text-sm">
              <Checkbox
                checked={form.permis_types.includes(p)}
                onCheckedChange={() => togglePermis(p)}
              />
              {p}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function Step3({
  form,
  update,
  errors,
}: {
  form: FormData;
  update: <K extends keyof FormData>(k: K, v: FormData[K]) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold">Adresse & contact d'urgence</h2>

      <div>
        <Label htmlFor="rue">Adresse <span className="text-destructive">*</span></Label>
        <Input
          id="rue"
          value={form.adresse_rue}
          onChange={(e) => update("adresse_rue", e.target.value)}
          placeholder="12 rue de la République"
        />
        <FieldError message={errors.adresse_rue} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="cp">Code postal <span className="text-destructive">*</span></Label>
          <Input
            id="cp"
            value={form.adresse_code_postal}
            inputMode="numeric"
            maxLength={5}
            onChange={(e) => update("adresse_code_postal", e.target.value)}
          />
          <FieldError message={errors.adresse_code_postal} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="ville">Ville <span className="text-destructive">*</span></Label>
          <Input
            id="ville"
            value={form.adresse_ville}
            onChange={(e) => update("adresse_ville", e.target.value)}
          />
          <FieldError message={errors.adresse_ville} />
        </div>
      </div>

      <div>
        <Label htmlFor="pays">Pays</Label>
        <Input
          id="pays"
          value={form.adresse_pays}
          onChange={(e) => update("adresse_pays", e.target.value)}
        />
      </div>

      <div className="border-t border-border pt-5">
        <h3 className="mb-3 text-sm font-semibold">Contact d'urgence</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="cnom">Nom complet <span className="text-destructive">*</span></Label>
            <Input
              id="cnom"
              value={form.contact_urgence_nom}
              onChange={(e) => update("contact_urgence_nom", e.target.value)}
            />
            <FieldError message={errors.contact_urgence_nom} />
          </div>
          <div>
            <Label htmlFor="ctel">Téléphone <span className="text-destructive">*</span></Label>
            <Input
              id="ctel"
              type="tel"
              value={form.contact_urgence_telephone}
              onChange={(e) => update("contact_urgence_telephone", e.target.value)}
            />
            <FieldError message={errors.contact_urgence_telephone} />
          </div>
          <div>
            <Label>Lien <span className="text-muted-foreground">(facultatif)</span></Label>
            <Select
              value={form.contact_urgence_lien || ""}
              onValueChange={(v) =>
                update("contact_urgence_lien", v as FormData["contact_urgence_lien"])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Lien de parenté" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conjoint">Conjoint(e)</SelectItem>
                <SelectItem value="parent">Parent</SelectItem>
                <SelectItem value="frere_soeur">Frère / Sœur</SelectItem>
                <SelectItem value="ami">Ami(e)</SelectItem>
                <SelectItem value="autre">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
