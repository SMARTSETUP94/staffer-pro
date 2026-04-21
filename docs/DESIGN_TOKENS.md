# Design Tokens — Setup Paris (v0.13)

> Source unique : `src/styles.css` (`@theme inline` + `:root`).
> Tous les composants doivent consommer ces tokens via les classes Tailwind
> sémantiques (`bg-primary`, `text-foreground`, etc.) **et non** des couleurs
> littérales. Les seules exceptions tolérées sont les overrides ponctuels
> via `var(--cream)`, `var(--ink)`, `var(--indigo-accent)` quand un composant
> a besoin de la palette brand brute.

---

## 1. Palette brand Setup Paris

| Token CSS | Hex équivalent | Usage |
|---|---|---|
| `--cream` | `#F7F4EF` | Fond global app, fond auth split-droite |
| `--cream-deep` | `~#EFE9DD` | Pilules, cartes secondaires |
| `--ink` | `#0A0A0B` | Sidebar, texte principal, fond auth split-gauche |
| `--indigo-accent` | `#2A2A8C` | **Couleur primaire** (boutons, liens, badges) |
| `--indigo-soft` | `#EEF2FF` | Fond des icônes circle, accents très légers |

Classes Tailwind dérivées : `bg-cream`, `text-ink`, `bg-indigo-accent`,
`text-indigo-accent`, `bg-indigo-soft` (générées automatiquement par les
`--color-*` du `@theme inline`).

---

## 2. Tokens sémantiques (rôles)

| Token | Rôle | Mapping clair | Mapping sombre |
|---|---|---|---|
| `--background` / `--foreground` | Fond/texte par défaut | cream / ink | ink / cream |
| `--primary` / `--primary-foreground` | CTA, sélection | indigo-accent / cream | indigo plus clair / ink |
| `--secondary` | Boutons secondaires | cream-deep | gris foncé |
| `--muted` / `--muted-foreground` | Sections discrètes | cream-deep / gris | gris foncé / gris clair |
| `--accent` / `--accent-foreground` | Hover doux | indigo-soft / indigo-accent | gris foncé / cream |
| `--destructive` | Erreurs, suppressions | rouge | rouge plus vif |
| `--success` | Validations | vert | vert |
| `--warning` | Attention | ambre | ambre |
| `--info` | Infos | bleu | bleu |
| `--border` / `--input` / `--ring` | Bordures, focus | beige sombre / indigo | gris / indigo |

**Sidebar** a son propre sous-ensemble : `--sidebar`, `--sidebar-foreground`,
`--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`, `--sidebar-ring`.
Le fond sidebar est toujours `ink` (noir Setup) en clair comme en sombre.

---

## 3. Couleurs métiers (8 métiers Setup Paris)

Synchronisées avec la colonne `metiers.couleur` en base. Les badges métiers
doivent être générés depuis ces tokens et **pas** depuis du hex en dur.

| Métier | Token | Hex |
|---|---|---|
| Construction | `--metier-construction` | `#0EA5E9` |
| Métallerie | `--metier-metallerie` | `#64748B` |
| Peinture | `--metier-peinture` | `#F59E0B` |
| Numérique | `--metier-numerique` | `#8B5CF6` |
| Tapisserie | `--metier-tapisserie` | `#EC4899` |
| Machiniste | `--metier-machiniste` | `#10B981` |
| Logistique | `--metier-logistique` | `#6366F1` |
| Suivi projet | `--metier-suivi-projet` | `#14B8A6` |

---

## 4. Spacing scale (4 / 8 / 16 / 24 / 32)

On utilise **strictement** les unités Tailwind par défaut (multiples de 4px) :

| Tailwind | px | Cas d'usage type |
|---|---|---|
| `p-1` / `gap-1` | 4 | Espace ultra-fin (icône + texte) |
| `p-2` / `gap-2` | 8 | Padding interne badge, gap menu |
| `p-4` / `gap-4` | 16 | Padding carte standard, gap section |
| `p-6` / `gap-6` | 24 | Padding page, gap formulaire |
| `p-8` / `gap-8` | 32 | Padding hero, gap entre blocs majeurs |

> Ne pas utiliser `p-3`, `p-5`, `p-7` sauf cas exceptionnel justifié.

---

## 5. Typographie

- **Famille** : `Inter` (var `--font-sans`) — fallback system-ui.
- **Headings** : `letter-spacing: -0.02em`.
- **Overline** : classe utilitaire `.overline` (xs, uppercase, tracking 0.18em,
  couleur primary). Préfixée par `— ` via `.section-number`.

| Classe | Taille | Usage |
|---|---|---|
| `text-xs` | 12px | Labels, badges, meta |
| `text-sm` | 14px | Texte courant, descriptions |
| `text-base` | 16px | Texte par défaut (rare) |
| `text-lg` | 18px | Sous-titres |
| `text-xl` | 20px | Titres carte |
| `text-2xl` | 24px | Titres page mobile |
| `text-3xl` | 30px | Titres page desktop |

---

## 6. Border radius

- `--radius` : `0.75rem` (12px) — base.
- `radius-sm` (8px), `radius-md` (10px), `radius-lg` (12px), `radius-xl` (16px),
  `radius-2xl` (20px).
- Boutons & inputs : `rounded-xl` par défaut.
- Cartes : `rounded-2xl`.
- Pilules / badges : `rounded-full`.

---

## 7. Focus rings (accessibilité)

Tous les éléments interactifs doivent exposer un focus visible sur 2px :

```css
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
```

`--ring` = `--indigo-accent` (clair) / `--indigo-accent` plus clair (sombre).

---

## 8. Breakpoints

| Token | Largeur min | Usage |
|---|---|---|
| `sm` | 640px | Téléphone large / petite tablette |
| `md` | 768px | Tablette |
| `lg` | 1024px | Petit desktop — **bascule sidebar drawer ↔ persistante** |
| `xl` | 1280px | Desktop standard |
| `2xl` | 1536px | Grand écran |

> **Sidebar mobile (< 1024px)** : drawer Sheet avec hamburger trigger dans le header.
> **Sidebar desktop (≥ 1024px)** : sidebar persistante avec collapse icône.

---

## 9. KPI Grid responsive

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* 1 col < 640px, 2 cols 640-1024, 4 cols ≥ 1024 */}
</div>
```

---

## 10. Tables responsive

Les tables denses doivent passer en cartes empilées sous `md` (768px) :

```tsx
<div className="hidden md:block">{/* table classique */}</div>
<div className="space-y-2 md:hidden">{/* cartes empilées */}</div>
```

Touch targets : minimum **44 × 44 px** pour tous les boutons / liens
interactifs sur mobile (`min-h-11 min-w-11`).

---

## 11. Règles d'or

1. **Jamais de hex en dur** dans un composant. Si une couleur manque, ajoute
   un token dans `styles.css` puis utilise la classe Tailwind générée.
2. **Jamais de `text-white` / `text-black`** : utiliser `text-foreground`,
   `text-primary-foreground`, etc.
3. **Toujours fournir le pendant `*-foreground`** quand on définit une couleur
   de fond, pour garantir le contraste en clair ET sombre.
4. **Toujours tester en mode sombre** (la classe `.dark` sur `<html>`).
