# Import planning — rattacher aux étapes existantes au lieu de créer des doublons

## Constat (vérifié en base)
La règle actuelle exige même type + même heure + même lieu. Les lieux diffèrent presque toujours (« CANAL ONE » contre l'adresse complète), donc l'import crée une nouvelle étape. J'ai appliqué la nouvelle règle à tout ce qui a été importé (S45 et S46) : **11 doublons**.

### A. Même type : fusion automatique (6)
| Chantier | Jour | Étape importée (gardée → annulée) | Étape d'origine (conservée) |
|---|---|---|---|
| 4120 rotation | 06/11 20h | 96808fcf | 48512830 (0 pers.) |
| 4120 rotation | 07/11 0h15 | 26e5d811 | 872790d1 (sans heure → reçoit 0h15) |
| 4123 rotation | 02/11 6h | d605b41f | 003a41ac |
| 4123 rotation | 03/11 6h | 38f81278 | d18a0513 |
| 4123 rotation | 07/11 6h | ba7b1c52 | dd2e01b6 |
| 4123 rotation | 10/11 6h | c2dd0d28 (2 pers.) | c9b2aff2 |

### B. Type différent, même jour et même heure : à confirmer par vous (5)
| Chantier | Jour | Importée | Origine | Question |
|---|---|---|---|---|
| 4132 | 11/11 10h | ada36938 montage (7 pers., « 10h - 1 porteur ») | 8e4088cf livraison | Même intervention ? Si oui, l'origine passe en « montage » |
| 4123 | 05/11 6h | 57a3dd0e rotation | 12d25b35 livraison | Même intervention ? |
| 4130 | 04/11 7h | cdb45c08 montage | 8d3d07ac livraison | idem |
| 4130 | 05/11 7h | 87e31f7e montage | a5641f0a livraison | idem |
| 4130 | 06/11 7h | ac2b8133 montage | 5058df0b livraison | idem |

Je ne peux pas confirmer seul que ce sont les mêmes interventions : sans votre accord, ces 5 restent en l'état. Les autres étapes importées (ex. 4130 les 10, 12, 13, 14/11 ; 4132 démontage 13/11 16h) n'ont pas d'équivalent et ne bougent pas.

## Ce qui change
1. **Rapprochement** : même chantier + jour compris dans l'étape + même type. L'heure ne départage que si elle est renseignée des deux côtés. Le lieu ne bloque jamais.
   - 1 candidat → rattaché automatiquement.
   - plusieurs → choix obligatoire avant d'enregistrer.
   - aucun du même type mais une étape du même chantier, même jour, même heure → proposée en premier : « même intervention ? ».
2. **Aperçu** : chaque bloc affiche « Rattaché à : <type · jour · heure · lieu> » ou « Nouvelle étape à créer ». Plus de choix « facultatif », aucune création silencieuse : l'enregistrement exige une décision pour chaque bloc ambigu.
3. **Chantier inconnu** : bouton « Créer le chantier » qui ouvre la création standard pré-remplie (code, nom, adresse). Rien n'est créé sans votre validation. Le bloc reste bloqué tant que le chantier n'existe pas.
4. **Nettoyage (liste A, plus la liste B si vous la confirmez)** : les personnes passent sur l'étape d'origine, sans doublon personne/jour. La note et l'heure sont reportées si l'origine est vide. L'étape importée passe en « annulé » avec la note « doublon import du 07/11 fusionné dans <id> ». Rien n'est supprimé.
5. **Provenance** : les affectations déplacées gardent la trace de leur fichier. Un réimport du même fichier retombe donc sur l'étape d'origine.

## Détails techniques
- Migration : redéfinition explicite de `planning_terrain_import_semaine` à partir de sa définition actuelle. Seul change le bloc des candidats : on garde d'abord la provenance, puis `type=typ AND jour dans la plage AND (heure_debut IS NULL OR h IS NULL OR heure_debut=h)`, sans condition de lieu. On ne crée une étape que si le bloc porte `creer:true` explicite ; s'il y a plusieurs candidats sans `etape_id`, l'import échoue avec un message lisible. Même signature et mêmes droits.
- Ajout d'une RPC de lecture des candidats (ou extension de la lecture existante) pour que l'aperçu affiche « même intervention ? ».
- Nettoyage : migration de données ciblée sur les ids listés. UPDATE de `assignations.etape_logistique_id` (sauf conflit personne/jour, alors l'affectation importée est retirée par annulation logique), puis UPDATE de l'origine (note/heure si NULL, type uniquement pour les cas B confirmés), puis `statut='annule'` sur les étapes importées. Le trigger de déplacement de dates n'est pas sollicité (dates inchangées).
- UI : `ImportPlanningHebdomadaire.tsx` (statut par bloc, choix obligatoire, bouton de création de chantier qui réutilise le dialogue de création d'affaire existant).
- Tests : un helper pur de rapprochement mirroir, avec des tests « étape sans lieu rattachée », « type différent proposé », « plusieurs candidats → choix requis ». Ensuite, réimport réel du PDF S46 : 0 étape créée, 69 déjà présentes.

## Votre accord nécessaire
- Valider la migration (fonction + nettoyage liste A).
- Pour la liste B, répondre ligne par ligne : même intervention, oui ou non.

Rien ne sera publié.
