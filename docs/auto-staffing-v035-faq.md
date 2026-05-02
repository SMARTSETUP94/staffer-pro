# FAQ Auto-staffing v0.35

### Q. Pourquoi mon plan est-il bloqué en draft ?
Tant qu'il n'est pas publié, il n'apparaît ni dans `/planning` ni dans `/charge-atelier`. C'est volontaire : le draft est un brouillon manipulable sans impact équipe.

### Q. Que se passe-t-il si je publie deux fois le même chantier ?
La publication précédente passe automatiquement en `status=archived` et reste consultable via l'**Historique**.

### Q. L'algo a placé un objet en début de période, comment le décaler ?
Utilise les chevrons +/- sur la barre Gantt (un clic = un jour ouvré). Le `manual_shift` est préservé même si tu cliques **Recalculer**.

### Q. Puis-je mettre 2 personnes au lieu de 4 sur un objet bois ?
Oui : slider sous le header objet (2 → 12 par pas de 2). Le `manual_pers` neutralise le calcul automatique pour ce métier×objet.

### Q. L'intérim apparaît avant le CDI dans les suggestions, c'est normal ?
Non — il y a un bug. Vérifie que `niveau_seniorite` et `competences_polyvalentes` de l'employé CDI sont renseignés. La règle Tier (CDI 1.0 / CDD 0.9 / Intérim 0.3) est appliquée AVANT le score métier.

### Q. Pourquoi je ne vois pas le bouton "Mettre au planning" sur un devis ?
Visible uniquement sur les affaires de typologie **Fabrication 5XXX** et pour les rôles chef ou admin.

### Q. Comment annuler une publication ?
Va dans **Historique** → clique **Restaurer cette version** sur le snapshot précédent (admin only). Cela réapplique le snapshot et crée automatiquement un snapshot `restore` pour audit.

### Q. Un employé peut-il voir le plan global de son chantier ?
Non. Il voit uniquement ses propres affectations dans `/planning` (badge **AS** sur les créneaux issus de l'auto-staffing). L'accès à `/staffing/$planId` est réservé chef+admin.

### Q. La vue Charge atelier ne montre rien.
Elle n'affiche que les plans **publiés**. Tant qu'aucun chantier n'a été publié sur la fenêtre 4 semaines glissantes, l'écran reste vide avec un message explicite.

### Q. Puis-je supprimer un plan publié ?
Seul un admin peut DELETE un plan. Dans l'usage normal, on **archive** via une nouvelle publication, on ne supprime pas (audit trail).
