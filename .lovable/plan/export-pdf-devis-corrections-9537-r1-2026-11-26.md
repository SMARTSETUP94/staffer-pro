# Export PDF devis — corrections (9537-R1)

Aucun changement de calcul, de droits, ni du contenu renvoyé par la lecture client du devis. **Aucune migration nécessaire** : tout se fait au moment de l'impression et dans la fenêtre d'export.

## Ce qui change dans le PDF client
1. **Poids** : logo réduit à 600 px de large maximum, photos à 1 000 px, recompressées en JPEG qualité ~80 (PNG avec transparence : compression « FAST »). Cible : moins de 500 Ko pour 9537-R1, moins de 3 Mo avec 10 photos. S'applique aussi au PDF « Version équipe », qui pèse aujourd'hui 7,6 Mo.
2. **Remise** : ligne masquée quand elle vaut 0.
3. **« Pour SET UP »** : si aucun signataire n'est renseigné, on affiche le nom et l'e-mail pro de l'interlocuteur Set Up (chargé d'affaires).
4. **En-tête droit** : colonne élargie à ~95 mm ; si un retour à la ligne laisse un mot isolé court (« 02/12 »), on coupe un mot plus tôt.
5. **Descriptifs** : 8,4 pt, gris plus foncé (contraste au moins 4,5:1 sur fond bleu clair et gris), italique conservé.
6. **Pages 2 et suivantes** : rappel « Devis n° … · client » en haut à gauche ; en-têtes de colonnes répétés (à vérifier).
7. **Avertissements avant export, non bloquants**, dans la fenêtre d'envoi du PDF :
   - descriptif contenant « à recaler », « à confirmer », « estimé(e) », « TODO » ou « ? » ;
   - descriptif citant « slide », « plan » ou « visuel » sans photo visible client sur l'objet ;
   - aucun contact destinataire (pas de « À l'attention de ») ;
   - CGV non jointes.
   Chaque avertissement indique l'objet concerné ; on peut exporter quand même.
8. **Option « grandes images »** (une image par objet en demi-largeur), en plus des vignettes : **proposée seulement, à valider par Gabin** avant développement.

## Points 7–10 de l'analyse
Les notes internes, l'absence de photos, de contact et de CGV sont des données du devis : je ne les modifie pas, l'avertissement les signale.

## Recette
- PDF de 9537-R1 avant/après générés localement, sans enregistrer d'export ni créer de version.
- Devis fictif à 10 photos généré en mémoire uniquement (rien en base).
- Pour chaque PDF : pages en images regardées une à une, poids, totaux identiques avant/après, texte extrait sans coût, marge ni donnée interne.
- Tests : remise masquée à 0, repli « Pour SET UP », détection des avertissements, réduction d'image respectant les tailles maximales.
- Compte rendu dans `docs/`, puis arrêt. Aucune publication.

## Détails techniques
- `src/lib/devis/pdf-client.ts` : helper d'image partagé (canvas côté navigateur, redimensionnement + `toDataURL('image/jpeg', 0.8)`, alias d'image réutilisé pour le logo), utilisé lignes 279 et 444 ; `ligneTot("Remise")` conditionnel ; repli signataire → interlocuteur ; largeur et coupure de l'en-tête ; style `descr` et lignes 482–487 (taille et couleur) ; rappel en `didDrawPage` à partir de la page 2.
- Nouveau module pur `src/lib/devis/controles-export-pdf.ts`, branché dans la fenêtre d'export PDF existante (aucun appel serveur nouveau).
