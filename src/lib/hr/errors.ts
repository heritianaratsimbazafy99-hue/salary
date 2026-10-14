/** User-facing message for an HR RPC failure. Internal details are never exposed. */
export function hrRpcErrorMessage(error: { code?: string; message?: string } | null, fallback: string): string {
  switch (error?.code) {
    case "PT409":
      return "Les données ont changé depuis l’ouverture de la page. Rechargez-la puis recommencez.";
    case "42501":
      return "Action non autorisée.";
    case "P0002":
      return "Élément introuvable.";
    case "23505":
      return "Ce nom ou ce code est déjà utilisé.";
    case "22023":
      return error.message === "inactive_agency"
        ? "Sélectionnez une agence active."
        : error.message === "inactive_site"
          ? "Sélectionnez un site actif de la même agence."
          : error.message === "invalid_scope"
            ? "Périmètre invalide : choisissez des sites et départements actifs d’une seule agence."
            : fallback;
    default:
      return fallback;
  }
}
