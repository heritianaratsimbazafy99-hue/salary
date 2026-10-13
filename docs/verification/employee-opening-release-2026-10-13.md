# Fermeture des parcours avant ouverture — 13 octobre 2026

## Périmètre livré

Cette livraison complète la release d6e21098 : déconnexion explicite ; choix des périodes et PDF/impression salarié ; revue paginée des destinataires avec confirmation et empreinte transactionnelle ; corrections avant publication ; gestion des agences, managers et retraits d'accès avec contrôle de l'état courant ; exports CSV/XLSX/PDF manager/RH ; guide et modèle Excel ; supervision superadmin ; conservation d'un an UTC avec masquage RLS immédiat et purge quotidienne bornée.

Le support et l'alerte Sentry sont dirigés vers heritiana.ratsimbazafy99@gmail.com. Le mail de connexion Supabase a été traduit en français. Le propriétaire a explicitement reporté les sauvegardes : aucun abonnement ni sauvegarde de production n'a été activé.

## Vérifications

Trois suites SQL testent les autorisations, les conflits de publication, l'immutabilité, la rétention, les cascades, les bornes calendaires et le cron dans des transactions annulées. Elles sont ajoutées à la CI. Les nouvelles migrations s'appliquent depuis une base locale vide.

La recette navigateur couvre les rôles salarié, manager et RH, l'activation et la reconnexion, plusieurs mois et une republication, les corrections et confirmations périmées, les exports, la déconnexion, la réaffectation et la désactivation d'accès, 101 destinataires paginés, un import de 2 000 lignes et le refus de 2 001 lignes. Les tests locaux utilisent exclusivement des données fictives et une messagerie locale.

Des défauts détectés en E2E ont été corrigés avant livraison : le SQLSTATE de conflit métier déclenchait les retries automatiques PostgREST ; les requêtes IN de 2 000 identifiants dépassaient la taille d'URL de Kong. Les conflits utilisent PT409 et les recherches sont bornées par nombre et taille encodée. Le chargement des affectations responsables normalise aussi la relation un-à-un retournée par PostgREST, afin de conserver l’agence sélectionnée dans les formulaires. Les formulaires d’édition conservent leurs valeurs après enregistrement et utilisent un vrai conteneur de grille pour éviter les chevauchements mobiles.

Validation locale finale : 399 tests unitaires/intégration dans 44 fichiers, 48 parcours E2E (24 desktop + 24 mobile) en 2,1 minutes, lint/typage/build Node 24 réussis ; trois suites SQL réussies après reset complet ; advisors sans problème ; audit npm zéro vulnérabilité ; scan des secrets sur 232 fichiers réussi. Le PDF a été rendu et inspecté visuellement. Deux avertissements lint préexistants concernent la navigation dans les formulaires d’import/mapping.

La CI, les migrations de production et la recette réelle sont à compléter après leur exécution. Cette section n’est pas encore une preuve de déploiement.

## Limites de la validation

La conservation est celle des fiches internes à compter de leur publication, pas une promesse de conformité réglementaire de bulletins légaux. L'import est limité à 2 000 lignes et 4 Mo ; cela ne garantit pas une publication simultanée à effectif illimité. Les exports tabulaires sont bornés à 5 000 lignes et le PDF à 100 fiches, avec refus explicite au-delà.

Les tests métier utilisent des données synthétiques. Les listes réelles d'agences/managers, les montants réels et la recette d'entreprise doivent être validés par les responsables avant invitation des salariés. Chromium desktop et mobile émulé ne constituent pas une recette sur tous les téléphones ou Safari. Les sauvegardes restent différées selon la décision du propriétaire.
