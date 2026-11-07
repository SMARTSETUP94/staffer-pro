# Arrêt du relevé smart@setup.paris

## Ce que j'ai vérifié (à lire avant de couper)

Deux relevés automatiques tournent toutes les 30 minutes :
- **Relevé devis@ + log@** : alimente Demandes clients et Demandes logistique. Il ne relève déjà plus smart@. Il reste inchangé.
- **Relevé smart@** : un relevé séparé, toujours actif.

Le relevé smart@ n'alimente **pas** Demandes clients : cet écran n'affiche déjà que la boîte devis@. En revanche, il alimente d'autres modules :
1. **Inbox SMART** (menu « Inbox SMART ») : c'est l'écran de tri des mails smart@. Il contient environ 4 000 mails en attente, dont **982 candidatures** (24 déjà rattachées à une candidature) et 183 mails classés logistique. Si on coupe smart@, **les nouvelles candidatures reçues sur smart@ n'arriveront plus dans l'app**.
2. **Fiche client** : bouton/lien vers Inbox SMART et historique des mails du client (les anciens mails restent visibles).
3. **Connecteur Claude** : il propose encore « smart » comme filtre de boîte pour les demandes clients.
4. Les mails envoyés par l'app (invitations) utilisent smart@ comme adresse de réponse : ce n'est pas un relevé, rien ne change.

Aucun module logistique ou réponse IA ne dépend du relevé smart@ : ils lisent devis@ et log@.

**Point à confirmer :** l'arrêt coupe l'arrivée des candidatures dans Inbox SMART. Je propose de couper quand même (votre consigne), en gardant Inbox SMART consultable pour l'historique. Si les candidatures doivent continuer à arriver, dites-le et je garde le relevé smart@ uniquement pour les candidatures.

## Ce que je ferai

1. **Arrêter le relevé smart@** : désactiver la tâche automatique toutes les 30 min et faire répondre l'adresse de relevé « relevé désactivé » sans lire la boîte (si elle est appelée à la main).
2. **Mails déjà ingérés depuis smart@** — rien n'est supprimé :
   - Reçus confirmés sur devis@ (preuve Microsoft) : recalculés comme prévu (passent en boîte devis, avec « transféré par »).
   - Vrais mails smart@ classés « demande client » encore en attente (environ 707) : passent en statut **écarté** avec le motif « boîte smart@ plus relevée ».
   - Non touchés : ceux déjà traités (rattachés à un client, contact, opportunité ou candidature, ou déjà validés/écartés).
   - Les autres catégories smart@ (candidatures, pub, autre, logistique) restent telles quelles dans Inbox SMART.
3. **Bilan** : liste des mails écartés (date, expéditeur, objet), téléchargeable, plus le nombre de mails recalculés et non touchés.
4. **Retirer « smart »** des filtres de Demandes clients et du connecteur Claude (seule « devis » reste pour les demandes clients).

## Migration

Une seule, sans changement de structure (la colonne de motif d'écartement existe déjà) :

```sql
SELECT cron.unschedule('poll-smart-inbox-30min');
```

Le passage en « écarté » est une modification de données, faite par l'action de recalcul (pas par migration), avec la même règle de preuve que précédemment.

## Détails techniques

- `poll-smart-inbox.ts` : retour immédiat 410 « relevé désactivé », plus d'appel Graph.
- `forwarded-requests.functions.ts` : après recalcul, pour `source_boite='smart'`, `categorie_ia='opportunite'`, `statut='pending_review'`, sans `client_id/contact_id/opportunite_id/candidature_id` et sans preuve devis → `statut='dismissed'`, `dismiss_reason='boîte smart@ plus relevée'`. Retourne la liste.
- `mcp/tools/demandes_clients.ts` : enum `source_boite` réduit à `devis | logistique`.
- Test : règle d'écartement (non traité écarté, traité intact, confirmé devis recalculé).
- Rien publié.
