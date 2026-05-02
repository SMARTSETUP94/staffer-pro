# Audit UX Frictions — v0.35.x (2 mai 2026)

Audit transversal post-livraison auto-staffing v0.35 et mode batch.
Les frictions sont classées par impact (HIGH / MED / LOW) puis effort.

---

## HIGH — bloquant ou très visible

### 1. Pas de sauvegarde explicite "ctrl+s" sur la toolbar batch
**Impact** : adoption chef. Le chef pense que ses modifs sliders sont perdues s'il
ne voit pas un feedback immédiat.
**Fix** : raccourci `Ctrl/Cmd+S` qui appelle `flushStepEdits` + toast de
confirmation, et tooltip "Ctrl+S" sur le bouton Enregistrer.
**Effort** : 1h.

### 2. Aucune indication visuelle des cellules "modifiées localement" sur le Gantt
**Impact** : confusion entre data serveur et overrides en attente.
**Fix** : liseré pointillé orange sur GanttBar quand `editStore` a un edit pour
ce step + tooltip "Modif locale en attente".
**Effort** : 2h.

### 3. Wizard de création plan ne permet pas de revenir en arrière
**Impact** : si le chef sélectionne mal les objets, il doit annuler et tout
recommencer.
**Fix** : bouton "Précédent" entre étape sélection objets et étape récap, +
preview de la liste sélectionnée toujours visible.
**Effort** : 3h.

### 4. Compteur "X/Y aff." ne distingue pas presence_pct < 100%
**Impact** : un employé à 50% compte 1 affectation alors que la couverture est
partielle. Le chef pense être OK alors qu'il a un trou.
**Fix** : afficher `Σ presence_pct / 100` au lieu du count brut, avec tooltip
détaillant.
**Effort** : 1h.

### 5. La modale "Affecter pour l'affaire" (mode rapide) ne précise pas
quels métiers/jours seront couverts
**Impact** : effet boîte noire, le chef ne peut pas anticiper l'impact.
**Fix** : récap "Cet employé couvrira N jours sur métiers X, Y entre J1 et JN"
avant validation.
**Effort** : 2h.

---

## MED — friction notable

### 6. Pas de déduplication des toasts d'erreur batch
Plusieurs toasts identiques quand plusieurs sliders échouent.
**Fix** : `toast.error(msg, { id: msg })` pour dédupliquer.
**Effort** : 30min.

### 7. La heatmap ne montre pas les jours fériés / week-ends
Le chef voit du gris uniforme et se demande si c'est une absence ou un weekend.
**Fix** : background hatché pour samedi/dimanche, badge "férié" pour jours fériés
français.
**Effort** : 2h.

### 8. Drill-down conflit CNC ouvre Popover, pas Dialog
Sur petit écran le Popover déborde et coupe le texte.
**Fix** : Dialog responsive (Drawer en mobile).
**Effort** : 1h.

### 9. Bouton "Supprimer" plan trop proche de "Publier"
Risque de fausse manipulation même avec confirmation.
**Fix** : déplacer dans un menu kebab "Actions avancées" sous le titre.
**Effort** : 30min.

### 10. Pas de filtre "afficher uniquement modifiés" sur la matrice compétences
Sur 80 employés × 8 métiers c'est dense.
**Fix** : toggle "Modifs en attente uniquement" + recherche par métier.
**Effort** : 1h.

### 11. EquipeAffaireSection (mode rapide) ne mémorise pas les filtres
Le chef refait le tri/filtre à chaque navigation.
**Fix** : persister via `useState` dans un context plan ou `localStorage`
keyed par planId.
**Effort** : 1h.

---

## LOW — polish

### 12. Pas de skeleton sur GanttInteractif pendant le 1er chargement
Écran blanc 500ms-1s.
**Fix** : `<Skeleton>` pour Gantt + Heatmap.
**Effort** : 30min.

### 13. Les badges "v0.35" affichés partout sont du bruit visuel
**Fix** : retirer en prod, garder uniquement sur la page changelog/roadmap.
**Effort** : 15min.

### 14. PageBreadcrumbs Plan staffing affiche "Plan staffing" générique
Mieux : "Plan staffing — v.draft" / "v.publié" ou n° de version.
**Fix** : passer une prop `subLabel`.
**Effort** : 30min.

### 15. Pas de raccourci clavier "?" pour afficher les shortcuts
**Fix** : modale dédiée listant Ctrl+S, Esc (annuler), j/k (nav steps).
**Effort** : 2h.

---

## Priorisation recommandée

**Sprint v0.35.7 (4-6h)** : #1 + #2 + #4 + #6 + #9 + #12 → maximum d'impact UX
pour adoption chef avec un effort minimal.

**Sprint v0.36 (12-15h)** : #3 + #5 + #7 + #10 + #11 + #14 → expérience polie.

**Backlog** : #8 + #13 + #15 → quand il y a du temps.
