export type SeuilEcartAberrantLigne = {
  ligneId: string;
  nom: string;
  seuilEffectif: number;
  seuilDefaut: number;
  seuilPersonnalise: number | null;
  /** Poids le plus élevé parmi les créneaux de la ligne (pour affichage du défaut 2×). */
  poidsMax: number;
};
