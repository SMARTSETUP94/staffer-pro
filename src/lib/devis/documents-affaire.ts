/** Seules les images JPG et PNG de la boîte de documents peuvent devenir des photos de devis (comme l'ajout direct). */
export const estImageAjoutable = (mime: string) => /^image\/(jpeg|png)$/i.test(mime);
