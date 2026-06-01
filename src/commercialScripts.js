export const COMMERCIAL_SCRIPT_FIELDS = [
  { key: "smsHook", label: "Accroche SMS" },
  { key: "callAngle", label: "Angle d'appel" },
  { key: "commonObjection", label: "Objection frequente" },
  { key: "shortAnswer", label: "Reponse courte" },
  { key: "commercialOffer", label: "Proposition commerciale" },
  { key: "followUpJ3", label: "Relance J+3" },
  { key: "followUpJ7", label: "Relance J+7" }
];

export const DEFAULT_COMMERCIAL_SCRIPTS = [
  {
    sectorId: "restaurant",
    sectorLabel: "Restaurant",
    smsHook: "Bonjour, j'ai vu que votre restaurant ressort localement mais sans parcours web tres clair pour reserver ou consulter la carte.",
    callAngle: "Mettre en avant les reservations, la carte et les demandes locales sans alourdir l'organisation.",
    commonObjection: "On a deja Instagram ou Google.",
    shortAnswer: "Justement, le site sert de point fixe et rassurant quand les clients cherchent une info rapide.",
    commercialOffer: "Une page simple, rapide, avec carte, horaires, contact et bouton reservation/appel.",
    followUpJ3: "Bonjour, je me permets de revenir vers vous au sujet d'une page simple pour capter plus de recherches locales.",
    followUpJ7: "Dernier message de suivi: je peux vous envoyer une proposition courte adaptee a votre restaurant si c'est utile."
  },
  {
    sectorId: "salon_coiffure",
    sectorLabel: "Salon de coiffure",
    smsHook: "Bonjour, j'ai regarde votre presence locale et il semble possible de rendre les prises de contact plus directes.",
    callAngle: "Simplifier la prise de rendez-vous et rassurer avec prestations, horaires et avis.",
    commonObjection: "Nos clientes nous trouvent deja.",
    shortAnswer: "L'objectif est surtout de convertir les nouvelles recherches locales sans vous ajouter de gestion.",
    commercialOffer: "Une page claire avec prestations, horaires, adresse, avis et lien de prise de rendez-vous.",
    followUpJ3: "Bonjour, je reviens vers vous pour une solution simple de visibilite locale pour votre salon.",
    followUpJ7: "Je cloture mon suivi: je peux vous transmettre une proposition courte si vous voulez comparer."
  },
  {
    sectorId: "institut_beaute",
    sectorLabel: "Institut beaute",
    smsHook: "Bonjour, votre institut peut gagner en clarte locale avec une page qui presente soins, tarifs et contact.",
    callAngle: "Rendre les prestations faciles a comprendre et faciliter la reservation.",
    commonObjection: "On communique deja sur les reseaux.",
    shortAnswer: "Les reseaux aident, mais une page fixe rassure les personnes qui comparent avant de reserver.",
    commercialOffer: "Une page vitrine avec prestations, tarifs indicatifs, horaires, adresse et contact direct.",
    followUpJ3: "Bonjour, je reviens vers vous pour la page locale de votre institut.",
    followUpJ7: "Derniere relance: je peux vous envoyer une proposition courte, sans engagement."
  },
  {
    sectorId: "artisan",
    sectorLabel: "Artisan",
    smsHook: "Bonjour, j'ai vu votre activite locale et il manque peut-etre une page simple pour recevoir des demandes qualifiees.",
    callAngle: "Generer des demandes locales mieux qualifiees avec services, zone et preuves.",
    commonObjection: "Je fonctionne surtout au bouche-a-oreille.",
    shortAnswer: "Le site ne remplace pas le bouche-a-oreille, il rassure les personnes a qui l'on vous recommande.",
    commercialOffer: "Une page claire avec services, zone d'intervention, photos/references et contact.",
    followUpJ3: "Bonjour, je reviens vers vous pour une page simple orientee demandes locales.",
    followUpJ7: "Je termine mon suivi: je peux vous envoyer une version courte de la proposition si besoin."
  },
  {
    sectorId: "commerce_alimentaire",
    sectorLabel: "Commerce alimentaire",
    smsHook: "Bonjour, votre commerce peut etre plus lisible localement avec horaires, produits et infos pratiques au meme endroit.",
    callAngle: "Faire ressortir les produits, horaires et services qui declenchent une visite.",
    commonObjection: "Les clients passent devant la boutique.",
    shortAnswer: "La page aide surtout ceux qui cherchent avant de se deplacer ou de verifier les horaires.",
    commercialOffer: "Une page locale avec produits phares, horaires, adresse, photos et contact.",
    followUpJ3: "Bonjour, je reviens vers vous pour la page locale de votre commerce.",
    followUpJ7: "Derniere relance: je peux vous transmettre une proposition tres courte si utile."
  },
  {
    sectorId: "autre_commerce_local",
    sectorLabel: "Autre commerce local",
    smsHook: "Bonjour, j'ai regarde votre presence locale et une page simple pourrait clarifier votre offre et vos contacts.",
    callAngle: "Clarifier l'offre, les horaires et l'appel/contact pour les recherches locales.",
    commonObjection: "Ce n'est pas prioritaire.",
    shortAnswer: "L'idee est de faire simple: une presence propre qui travaille en continu sans gestion lourde.",
    commercialOffer: "Une page vitrine courte avec offre, horaires, adresse, preuves et contact direct.",
    followUpJ3: "Bonjour, je reviens vers vous au sujet d'une presence locale simple et propre.",
    followUpJ7: "Je cloture mon suivi: je peux vous envoyer une proposition courte si vous voulez l'evaluer."
  }
];
