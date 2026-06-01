# Prospector

- Application locale Node.js, sans frontend pour la V0.
- Ne jamais versionner `.env`, `data/`, `logs/`, `exports/`, caches ou listes de prospects reelles.
- Les sources doivent conserver la provenance des preuves et contacts.
- Aucun envoi automatique d'email en V0.
- Garder les requetes externes limitees, cachees et auditables.
- Le dashboard peut etre publie en statique, mais les donnees prospects doivent rester sur le Pi derriere l'API authentifiee.
- Le bot de production tourne uniquement sur le Raspberry Pi via PM2 (`prospector-bot`, `/home/adri/bots/prospector`). Le Mac sert au developpement, aux tests et au build local, pas a l'execution continue du bot.
- Ne pas lancer ni persister `npm start`, `npm run server`, `npm run campaign:nightly` ou un process PM2 Prospector sur le Mac. Pour appliquer une modification, utiliser `./deploy-prospector-rsync.sh "description"` depuis ce dossier, qui synchronise vers le Pi et redemarre PM2 la-bas.
