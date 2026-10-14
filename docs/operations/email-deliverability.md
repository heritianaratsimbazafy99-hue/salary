# Délivrabilité des notifications MadajobPay

## Diagnostic du 14 octobre 2026

La recette a constaté trois notifications de paie dans le dossier Spam d'une même boîte Gmail, adressées au même alias de test. Un autre alias de cette boîte a reçu la même notification en boîte de réception. L'invitation est aussi arrivée en boîte de réception. Ce petit échantillon ne permet ni de calculer un taux de délivrabilité, ni d'attribuer le classement à une cause unique.

Les messages ont été relus avec le connecteur Gmail, sans changer leurs labels. Les identifiants Gmail sont distincts des identifiants Resend.

| Parcours | Classement observé | Nombre |
| --- | --- | --- |
| Notifications de paie, même alias | SPAM | 3 |
| Notification de paie, autre alias | INBOX | 1 |
| Invitation | INBOX | 1 |

Les cinq messages passent SPF, DKIM et DMARC selon `Authentication-Results` émis par `mx.google.com` : signature DKIM de `send.stark.mg`, domaine SPF `send.send.stark.mg`, alignement DMARC sur `stark.mg`, politique `p=NONE`. Le transport vers Gmail utilise TLS. Le MIME contient une version texte et une version HTML, des liens directs vers l'application et aucune image/pixel de suivi. La version texte est déjà produite par Resend : son absence dans le code du template n'est donc pas un défaut de l'email reçu.

La différence d'IP entre les classements est une observation, pas une preuve de mauvaise réputation. Le destinataire/alias, le contenu personnalisé, le contexte de la boîte et les décisions de Gmail diffèrent également. Les quatre notifications de paie partagent le même fil Gmail ; vérifier les labels de chaque **message**, pas seulement l'emplacement du fil.

Les preuves assainies de la recette sont dans `output/playwright/production-audit-20261014/payroll/gmail-delivery.json` et `gmail-authentication.json`. Ce dernier ne conserve que les en-têtes de diagnostic, types MIME et origines des liens, sans jeton d'invitation ni contenu de paie.

## Vérification Resend en lecture seule

Le domaine `send.stark.mg` dans Resend, équipe `stark`, était `Verified`, région `eu-west-1`, avec SPF et DKIM vérifiés et l'envoi activé. La page Configuration proposait d'activer les métriques via un sous-domaine de suivi ; aucun suivi n'était présent dans les cinq messages reçus inspectés. Le transport était réglé sur TLS opportuniste ; les en-têtes Gmail montrent effectivement TLS 1.3 pour les messages inspectés.

Les trois envois de l’alias salarié étaient `Delivered` dans Resend. Les Insights du premier envoi indiquaient deux recommandations :

- rapprocher le domaine des liens (`salary-alpha-one.vercel.app`) du domaine d'envoi (`send.stark.mg`) ;
- utiliser une adresse permettant les réponses plutôt que `no-reply@send.stark.mg`.

DMARC, version texte, taille du message et autres contrôles du contenu étaient classés favorablement. Ces recommandations sont des pistes d'amélioration : le pair arrivé en INBOX utilise le même domaine, la même adresse d'envoi et le même template. Elles ne prouvent donc pas la cause du classement Spam. Aucune configuration, souscription, règle de boîte ou entrée DNS n'a été changée pendant le diagnostic.

## Interprétation des statuts

- `SENT` dans l'application : le fournisseur a accepté la demande d'envoi.
- `Delivered` dans Resend : le serveur destinataire a accepté le message ; cela inclut une remise dans Spam.
- `INBOX` ou `SPAM` dans Gmail : classement réellement constaté dans cette boîte pour ce message.

Une réponse HTTP réussie de Resend, un webhook `email.delivered` ou une modification du template ne garantit pas la boîte de réception. Ne pas clôturer ce constat comme « Spam corrigé » sans nouvelle preuve de classement ; même une nouvelle réception INBOX ne garantit pas les envois futurs.

## Suite opérationnelle

Pour une nouvelle recette autorisée, envoyer uniquement les notifications nécessaires, relever les identifiants et labels individuels Gmail ainsi que les résultats d'authentification. Garder l'intervalle et le volume raisonnables : les renvois rapprochés ne constituent pas une réparation du classement. Ne pas déplacer artificiellement les messages hors Spam pour valider la recette.

Si le problème persiste, préparer pour le support Resend les identifiants fournisseur/Gmail, dates, IP de sortie et résultats d'authentification, sans secrets ni fiche de paie. L'envoi à ce support exige une autorisation explicite distincte. La réputation du domaine et des IP peut être analysée avec Google Postmaster Tools si une propriété vérifiée et suffisamment de trafic sont disponibles ; aucune donnée de réputation n'a été accessible ou déduite ici.

Les recommandations de domaine et d'adresse de réponse nécessitent un choix de configuration réel : domaine applicatif appartenant au propriétaire, liens/redirects d'authentification cohérents, adresse de réponse effectivement suivie. Ne pas inventer un nouveau domaine, une boîte ou une offre payante, et ne pas remplacer l'URL de production sans préparer et vérifier cette migration. Aucun changement DNS n'est justifié par un échec SPF/DKIM/DMARC dans l'échantillon, puisque ces contrôles passent.

## Sources primaires consultées le 14 octobre 2026

- [Google — Email sender guidelines](https://support.google.com/mail/answer/81126?hl=en) : authentification, réputation d'IP partagée et qualité des envois.
- [Resend — How to avoid Gmail's spam folder](https://resend.com/docs/knowledge-base/how-do-i-avoid-gmails-spam-folder) : cohérence des domaines et contenu simple.
- [Resend — Why your emails are going to spam](https://resend.com/blog/why-your-emails-are-going-to-spam) : classement par le destinataire et diagnostic de réputation.
- [Resend — Automatic plain text emails](https://resend.com/changelog/automatic-plain-text-emails) : génération automatique de la version texte.

## Correction de l'adresse de réponse

Le second contrôle en production a reçu une notification et une invitation dans Spam, avec SPF/DKIM/DMARC valides. Gmail affiche pour les deux : « Ce message est semblable à des messages identifiés comme spam par le passé. » Ce signal ne désigne pas un défaut d'authentification et ne permet pas d'isoler une cause unique.

Tous les envois applicatifs Resend (paie, invitations, activation et RH, y compris les lots) utilisent maintenant `RESEND_REPLY_TO_EMAIL`, avec l'adresse de support publique comme valeur par défaut. Une valeur configurée doit être une adresse email valide. L'adresse affichée dans l'aide et le défaut de réponse partagent la même constante.

La configuration d'expédition prévue est `MadajobPay <notifications@send.stark.mg>`, sur le domaine déjà authentifié. Les réponses sont dirigées vers la boîte de support suivie ; l'expéditeur ne prétend plus être une adresse sans réponse. Aucun changement SPF, DKIM, DMARC, suivi ou abonnement n'est nécessaire pour cette correction. Elle traite les recommandations observées dans Resend, sans prétendre garantir le classement Gmail.

Après déploiement, vérifier les nouveaux messages individuels dans Gmail : From, Reply-To, SPF/DKIM/DMARC, origines des liens et labels INBOX/SPAM. Ne pas déplacer les messages pour valider le résultat.
