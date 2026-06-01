# Prospector

- Application locale Node.js, sans frontend pour la V0.
- Ne jamais versionner `.env`, `data/`, `logs/`, `exports/`, caches ou listes de prospects reelles.
- Les sources doivent conserver la provenance des preuves et contacts.
- Aucun envoi automatique d'email en V0.
- Garder les requetes externes limitees, cachees et auditables.
- Le dashboard peut etre publie en statique, mais les donnees prospects doivent rester sur le Pi derriere l'API authentifiee.
- Le dashboard ne doit pas charger toute la BDD prospects en une seule reponse. Garder `/api/dashboard` leger pour les metriques et charger les prospects via une API paginee/filtrable/triee, avec les meilleurs scores en premier par defaut, pagination visible en haut et en bas, et cache client uniquement pour les pages deja consultees.
- Les requetes prospects doivent rester optimisables cote SQLite: utiliser `LIMIT/OFFSET`, filtres serveur, tris controles par liste blanche, et indexes adaptes aux tris/filtres courants.
- Le bot de production tourne uniquement sur le Raspberry Pi via PM2 (`prospector-bot`, `/home/adri/bots/prospector`). Le Mac sert au developpement, aux tests et au build local, pas a l'execution continue du bot.
- Ne pas lancer ni persister `npm start`, `npm run server`, `npm run campaign:nightly` ou un process PM2 Prospector sur le Mac. Pour appliquer une modification, utiliser `./deploy-prospector-rsync.sh "description"` depuis ce dossier, qui synchronise vers le Pi et redemarre PM2 la-bas.
