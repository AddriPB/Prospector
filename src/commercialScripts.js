export const COMMERCIAL_SCRIPT_FIELDS = [
  { key: "smsHook", label: "Accroche SMS" },
  { key: "callAngle", label: "Angle d'appel" },
  { key: "commonObjection", label: "Objection fréquente" },
  { key: "shortAnswer", label: "Réponse courte" },
  { key: "commercialOffer", label: "Proposition commerciale" },
  { key: "followUpJ3", label: "Relance J+3" },
  { key: "followUpJ7", label: "Relance J+7" }
];

export const DEFAULT_COMMERCIAL_SCRIPTS = [
  {
    sectorId: "automotive",
    sectorLabel: "Automobile",
    smsHook:
      "Bonjour, j'ai regardé votre présence en ligne : on trouve votre activité automobile, mais les prestations, horaires, prise de rendez-vous ou demande de devis ne sont pas toujours présentés sur une page claire. Je peux vous proposer une page locale simple pour faciliter les appels et demandes qualifiées.",
    callAngle:
      "Bonjour, je vous appelle rapidement parce que j'ai regardé votre présence en ligne. Pour une activité auto, les clients veulent vite savoir ce que vous faites, où vous êtes, quand appeler, et s'ils peuvent demander un devis ou un rendez-vous. L'objectif est de transformer une recherche Google ou une recommandation en contact plus direct.",
    commonObjection:
      "Nos clients viennent par bouche-à-oreille ou Google. / On a déjà assez d'appels. / On n'a pas besoin d'un site complet.",
    shortAnswer:
      "Justement, une page claire aide surtout les clients déjà intéressés. Elle évite les appels inutiles, précise vos services et permet aux bonnes demandes d'arriver plus vite : devis, rendez-vous, intervention ou information pratique.",
    commercialOffer:
      "Une page professionnelle avec prestations, horaires, adresse, bouton appel, demande de devis ou rendez-vous, marques ou types de véhicules pris en charge, photos éventuelles et éléments de confiance. Objectif : rassurer avant l'appel et mieux qualifier les demandes.",
    followUpJ3:
      "Bonjour, je reviens vers vous concernant une page locale pour votre activité automobile. Elle peut aider à présenter clairement vos prestations, filtrer les demandes et faciliter les prises de contact utiles sans vous ajouter de gestion compliquée.",
    followUpJ7:
      "Dernier message de suivi : je peux vous envoyer une proposition courte adaptée à votre activité auto, avec les sections utiles à afficher et une estimation simple. Si ce n'est pas prioritaire pour vous, aucun souci."
  },
  {
    sectorId: "restaurants",
    sectorLabel: "Restaurants",
    smsHook:
      "Bonjour, j'ai regardé votre présence en ligne : on trouve votre restaurant, mais la carte, les horaires, la réservation ou le contact ne sont pas toujours accessibles sur une page claire. Je peux vous proposer une page locale simple pour convertir plus facilement les recherches Google en appels ou réservations.",
    callAngle:
      "Bonjour, je vous appelle rapidement parce que j'ai regardé votre présence en ligne. L'idée n'est pas de remplacer Google ou Instagram, mais d'avoir une page fixe, claire et rassurante avec carte, horaires, accès, contact et réservation. Quand un client cherche où manger ou veut vérifier une info vite, il doit pouvoir décider sans hésiter.",
    commonObjection:
      "On a déjà Google, Instagram ou Facebook. / On n'a pas besoin d'un site. / On n'a pas le temps de gérer ça.",
    shortAnswer:
      "Justement, le but n'est pas d'ajouter du travail. Le site sert de point fixe : il regroupe les infos utiles, renvoie vers vos canaux existants et évite que le client parte chercher ailleurs une carte, un horaire ou un moyen de réserver.",
    commercialOffer:
      "Une page locale prête à partager avec carte/menu, horaires, adresse, bouton appel, itinéraire, réservation ou demande de contact, photos et mise en avant de vos points forts. Objectif : rendre le restaurant plus clair au moment où le client cherche déjà une adresse.",
    followUpJ3:
      "Bonjour, je reviens vers vous concernant la page locale pour votre restaurant. L'intérêt est simple : carte, horaires, accès et réservation au même endroit, pour éviter de perdre les clients qui cherchent une information rapide avant de venir ou d'appeler.",
    followUpJ7:
      "Dernier message de suivi : je peux vous préparer une proposition courte adaptée à votre restaurant, avec les infos à afficher en priorité et une estimation simple. Si ce n'est pas utile pour vous maintenant, aucun souci."
  },
  {
    sectorId: "building_trades",
    sectorLabel: "Artisans bâtiment",
    smsHook:
      "Bonjour, j'ai regardé votre présence en ligne : on trouve votre activité dans le bâtiment, mais les prestations, la zone d'intervention, les réalisations ou la demande de devis ne sont pas toujours visibles sur une page claire. Je peux vous proposer une page locale simple pour rassurer les clients avant contact.",
    callAngle:
      "Bonjour, je vous appelle rapidement parce que j'ai regardé votre présence en ligne. Dans le bâtiment, un client veut surtout vérifier vos prestations, votre zone d'intervention, des exemples de travaux et comment demander un devis. L'objectif est d'avoir une page claire qui rassure avant l'appel et facilite les demandes sérieuses.",
    commonObjection:
      "On fonctionne surtout par recommandation. / On n'a pas le temps. / Les chantiers viennent déjà comme ça.",
    shortAnswer:
      "Justement, quand quelqu'un vous recommande, il va souvent vérifier en ligne avant d'appeler. Une page claire confirme vos prestations, votre zone et vos réalisations, et aide le client à vous contacter avec une demande plus précise.",
    commercialOffer:
      "Une page sobre avec prestations, zone d'intervention, photos ou réalisations, bouton appel, demande de devis, informations de confiance et éventuelles garanties ou assurances à afficher. Objectif : transformer les recherches locales et recommandations en demandes de devis plus claires.",
    followUpJ3:
      "Bonjour, je reviens vers vous concernant une page locale pour votre activité bâtiment. Elle peut servir à présenter vos prestations, votre zone d'intervention et quelques réalisations, afin de rassurer les clients avant une demande de devis.",
    followUpJ7:
      "Dernier message de suivi : je peux vous envoyer une proposition courte adaptée à votre activité, avec les sections utiles à afficher et une estimation simple. Si ce n'est pas utile maintenant, aucun souci."
  }
];

export const COMMERCIAL_SCRIPT_SECTOR_IDS = DEFAULT_COMMERCIAL_SCRIPTS.map(
  (script) => script.sectorId
);

export const LEGACY_DEFAULT_COMMERCIAL_SCRIPTS = [
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
