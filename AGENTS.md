# Prospector

- Application locale Node.js, sans frontend pour la V0.
- Ne jamais versionner `.env`, `data/`, `logs/`, `exports/`, caches ou listes de prospects reelles.
- Les sources doivent conserver la provenance des preuves et contacts.
- Aucun envoi automatique d'email en V0.
- Garder les requetes externes limitees, cachees et auditables.
- Le dashboard peut etre publie en statique, mais les donnees prospects doivent rester sur le Pi derriere l'API authentifiee.
