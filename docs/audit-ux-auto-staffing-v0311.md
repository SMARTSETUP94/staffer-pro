# Audit UX Auto-Staffing — post v0.35.11 (2 mai 2026)

Audit en autonomie après livraison du Sprint Express (split-button + bandeau
sticky + composite serveur create+calc+autostaff+publish).

**Référence temps actuel** : du Devis/Fab à un plan publié = ~10 s, 1-2 clics
(vs ~45 s, 7 clics avant v0.35.11).

But du présent audit : passer **sous les 5 s** et **0 cognitive load** pour le
cas nominal, sans sacrifier la sécurité (pas de publish auto si conflit).

---

## 🔴 P0 — Frictions résiduelles bloquantes (à livrer avant tout polish)

### A. L'utilisateur ne sait pas où cliquer la 1re fois
**Symptôme** : sur `/affaires/$id/devis` ou `.../fabrication`, le split-button
est noyé parmi 4-6 actions du header. Aucun ancrage visuel ni "guided tour".
**Impact** : ~30 s perdues à explorer la page, surtout pour les nouveaux chefs.
**Fix proposé** :
- Pulse animation sur l'icône `Wand2` quand l'affaire est typologie fabrication
  ET aucun plan actif (ring discret + tooltip "Nouveau : 1 clic suffit").
- Auto-dismiss après 1er usage (persisté par chef en `localStorage`).
**Effort** : 1h.

### B. Pas de "Express" depuis la liste des affaires
**Symptôme** : pour staffer 3-5 affaires d'une commande Salon, le chef doit
ouvrir chacune. 3 clics × N affaires.
**Impact** : 3-5 min pour une vague de fab.
**Fix proposé** :
- Sur `/affaires` (vue liste), colonne "Action" avec icône Wand2 inline pour
  toute fab 5XXX sans plan actif.
- Click → mêmes heuristiques Express, mais résultat affiché en toast + lien
  "voir le plan", PAS de navigation auto (sinon batch impossible).
- Sélection multi-rangs → bouton "Express N affaires" en footer.
**Effort** : 4h. **Gain** : 1 clic / affaire en mode batch.

### C. Le bandeau Express n'invite pas à publier quand c'est OK
**Symptôme actuel** : si publié auto → bandeau vert, juste un X. Mais si draft
(amber) avec 0 unfilled et 0 alerte critique mais juste alertes "soft", le
bouton "Publier quand même" est secondaire et plat.
**Fix proposé** :
- Quand `blocking === false`, faire du bouton Publier le **CTA primaire** taille
  `default`, et rétrograder Ajuster en `ghost`.
- Auto-focus le bouton Publier au mount → Enter publie.
**Effort** : 30 min. **Gain** : -1 clic dans 70% des cas draft.

### D. Pas de raccourci global "E" pour Express depuis n'importe où
**Symptôme** : on a `?` pour shortcuts, `Ctrl+S` pour save, `Ctrl+Z` undo. Mais
pas de "appuie E sur une affaire pour staffer".
**Fix proposé** :
- Sur `/affaires/$id/*`, raccourci `E` → trigger Express (si éligible).
- Sur `/staffing/$id`, `P` → publish (avec confirmation visuelle).
- Mettre à jour `StaffingShortcutsHelp`.
**Effort** : 1h.

---

## 🟡 P1 — Vitesse perçue & confiance

### E. Loader Express n'explique pas ce qui se passe
**Symptôme** : toast "Création + staffing de N objets…" reste 5-8 s. Le chef
ne sait pas où il en est.
**Fix proposé** :
- Server function émet 4 étapes via console (déjà fait), mais l'UI ne les
  affiche pas. Ajouter un toast "stepper" : `1/4 Création → 2/4 Calcul → 3/4
  Auto-staff → 4/4 Publication` mis à jour côté client par estimation de
  durée (pas besoin de SSE, simple `setTimeout` + clear si fin).
**Effort** : 1h.

### F. Pas de "Annuler" sur le plan Express qui vient d'être créé
**Symptôme** : si Express a fait n'importe quoi, le chef doit ouvrir
DeletePlanDialog (3 clics + saisir nom affaire).
**Fix proposé** :
- Dans le bandeau Express, ajouter bouton secondaire "Annuler ce plan" (uniquement
  visible 5 min après création, dans la session). Click → soft-delete sans
  confirmation lourde.
**Effort** : 2h.

### G. Heuristiques de date ne tiennent pas compte des congés équipe
**Symptôme** : `defaultDateFin = date_montage - 2j` peut tomber sur un weekend
ou une période de fermeture atelier. Le calcul Express crée alors un plan trop
serré et beaucoup d'unfilled.
**Fix proposé** :
- Utiliser `getJoursOuvres` du module algo pour reculer dateFin au dernier
  jour ouvré ≤ montage-2.
- Si `dateMontage - dateDebut < 5j ouvrés` → bandeau "Délai très court, prévoir
  intérim ?" plutôt que des unfilled silencieux.
**Effort** : 2h.

### H. Bandeau ExpressResultBanner duplique l'interface Props
Bug code : interface `Props` déclarée 2x (lignes 12-21 et 23-32). Pas de crash
TS car identiques mais à nettoyer.
**Effort** : 5 min.

---

## 🟢 P2 — Polish

### I. Pas de feedback haptique mobile sur Express
Sur tablet chef, vibration courte (`navigator.vibrate(50)`) au succès.
**Effort** : 15 min.

### J. Bouton Express n'a pas d'état "déjà fait"
Si plan publié existe pour cette affaire, le bouton devrait montrer
"✓ Plan actif" + lien direct, plutôt que de relancer Express qui va échouer.
**Effort** : 1h.

### K. Pas d'indicateur "économies de temps" gamification
Petit toast récap mensuel "Vous avez créé 18 plans Express ce mois-ci, soit
~12 min économisées". Boost adoption.
**Effort** : 3h. **Optionnel**.

---

## Plan recommandé : Sprint v0.35.12 "Express+ " (~6h)

Livrer en un sprint : **A + C + D + E + H** = ~3h30
Puis option : **B (Batch affaires)** = +4h dans v0.35.13

Cette combinaison :
- amène le cas nominal à **≤5 s** (D: tap E + auto-focus publier + Enter)
- élimine la friction "où je clique" (A)
- rend la confiance Express palpable (C, E)
- corrige le bug doublon TS (H)

Non recommandé à ce stade : K (gamification — attendre feedback terrain).
