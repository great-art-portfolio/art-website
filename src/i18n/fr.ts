import type { Strings } from "./en";

/* French typography: a narrow no-break space (U+202F) before ? ! ; and a
 * no-break space (U+00A0) before : and inside « ». */
export const fr: Strings = {
  location: "Calgary, Alberta",
  meta: {
    siteTitle: "Barbara Straka — Peintures originales",
    description:
      "Peintures originales, nature et abstraction, directement de l’atelier de l’artiste.",
    paintingTitle: (title: string, sold: boolean) =>
      `${title} par Barbara Straka — ${sold ? "Vendu" : "Tableau original"}`,
  },
  layout: {
    skip: "Aller au contenu",
    home: "Accueil — retour à la galerie",
    nav: "Principal",
    collection: "Collection",
    about: "À propos",
    notifyMe: "Me prévenir",
    privacy: "Confidentialité",
    privacyNote: "aucun cookie, aucun traceur",
    install: "Installer l’application de la galerie",
    credits: "Crédits",
    language: "Langue",
    readIn: "Lire ce site en français",
    noThanks: "Non merci",
  },
  notify: {
    close: "Fermer les alertes",
    title: "Ne manquez aucun nouveau tableau",
    body: "Recevez un courriel quand un nouveau tableau est accroché ou qu’un événement se prépare. Désabonnez-vous à tout moment, en un clic.",
    email: "Adresse courriel",
    join: "Rejoindre la liste",
    leave: "Quitter la liste",
  },
  notifyClient: {
    badEmail: "Cette adresse semble incorrecte — vérifiez-la et réessayez.",
    joining: "Inscription…",
    checkInbox:
      "Consultez votre boîte de réception — un clic suffit pour confirmer.",
    finishCheck:
      "Encore une étape — terminez la vérification rapide ci-dessus, puis réessayez.",
    failed: "Ça n’a pas marché — réessayez dans un moment.",
    typeFirst: "Entrez d’abord l’adresse, puis touchez « Quitter la liste ».",
    leaving: "Désinscription…",
    left: "C’est fait — cette adresse a été retirée de la liste.",
    copied: "Copié.",
    copyFailed: "Copie impossible — sélectionnez plutôt le texte.",
    tapToCopy: "Touchez pour copier ce message",
  },
  home: {
    tagline: "Originaux nature et abstraits, peints à la main",
    headline: "Des tableaux originaux, tout droit de l’atelier",
    lede: "Des originaux nature et abstraits, peints à la main et vendus directement par l’atelier. Ce que vous voyez, c’est le vrai tableau — et quand un original est vendu, il n’en reste que les reproductions.",
    browse: "Parcourir la collection",
    getNotified: "Recevoir les nouvelles œuvres par courriel",
    points: [
      ["Originaux et reproductions", "peints une fois, imprimés sur commande"],
      ["En direct", "de l’atelier, sans commission de galerie"],
      ["Expédition soignée", "organisée ensemble après l’achat"],
    ],
    aboutEyebrow: "De l’atelier",
    aboutTitle: (place: string) => `Peint à ${place}`,
    about: [
      "Barbara Straka peint la nature et l’abstraction dans son atelier de Calgary — lumière des prairies, eaux calmes et études de couleur, quelque part entre paysage et émotion. Chaque pièce présentée ici est d’abord un original — la plupart existent aussi en reproduction. Quand un original est vendu, il part pour de bon — mais ses reproductions lui survivent.",
      "Tout se vend ici directement par l’atelier : le prix affiché est le prix complet, et l’expédition s’organise ensemble après l’achat. Pour vous renseigner sur une pièce, ouvrez-la et touchez <strong>Ça vous intéresse ?</strong> — votre mot arrive directement à l’artiste.",
    ],
  },
  gallery: {
    newest: "Dernier tableau",
    ask: "Se renseigner sur cette œuvre →",
    availableLabel: "Tableaux disponibles",
    eyebrow: "La collection",
    title: "Œuvres disponibles",
    count: (n: number) =>
      n <= 1 ? `${n} œuvre · pièce unique` : `${n} œuvres · chacune est unique`,
    soldLabel: "Tableaux vendus",
    soldEyebrow: "Déjà acquises",
    soldTitle: "Ils ont trouvé preneur",
    soldCount: (n: number) =>
      `${n} ${n <= 1 ? "œuvre vendue" : "œuvres vendues"}`,
    new: "Nouveau",
    sold: "Vendu",
  },
  painting: {
    back: "← Retour à la collection",
    fullscreen: (title: string) => `Voir ${title} en plein écran`,
    tapFullscreen: "Touchez pour voir en plein écran",
    lightbox: "Tableau en plein écran",
    closeFullscreen: "Quitter le plein écran",
    eyebrow: "Tableau original · pièce unique",
    soldNote: "Cette œuvre a trouvé preneur.",
    priceOnRequest: "Prix sur demande — écrivez ci-dessous pour le connaître.",
    buyNow: (price: string) => `Acheter · ${price}`,
    payNote:
      "Carte, Apple Pay ou Google Pay. Vous préférez un virement Interac (Interac e-transfer), sans frais de carte ? Demandez ci-dessous et vous recevrez les détails par courriel.",
    interested: "Ça vous intéresse ?",
    formTitle: "Se renseigner sur ce tableau",
    shipNote: "Expédition organisée avec l’artiste après l’achat.",
    name: "Nom",
    email: "Courriel",
    message: "Message",
    messagePlaceholder: "Bonjour, j’adore cette œuvre…",
    send: "Envoyer la demande",
    wallTitle: "Essayez-le sur votre mur",
    wallTouch:
      "Affiché à peu près en taille réelle. Touchez <strong>Voir sur votre mur</strong>, puis pointez votre téléphone là où il serait accroché.",
    wallDesk: "Affiché à peu près en taille réelle.",
    machineNote: "Titre et description traduits automatiquement de l’anglais.",
    wallScan:
      "Pour le voir sur votre mur, scannez ceci avec l’appareil photo de votre téléphone, puis touchez <strong>Voir sur votre mur</strong>.",
  },
  paintingClient: {
    sending: "Envoi…",
    sent: "Merci — votre mot a été envoyé à l’artiste.",
    savedOffline:
      "Enregistré — il partira automatiquement dès que vous serez de nouveau en ligne.",
    finishCheck:
      "Encore une étape — terminez la vérification rapide ci-dessus, puis touchez de nouveau « Envoyer la demande ».",
    failed:
      "L’envoi n’a pas abouti — vérifiez votre adresse courriel et réessayez.",
    askQuestion: "Poser une question",
    openingCheckout: "Ouverture du paiement sécurisé…",
    checkoutUnavailable:
      "Le paiement n’est pas disponible pour le moment. Veuillez réessayer.",
    viewOnWall: "Voir sur votre mur",
    share: "Partager ce tableau",
    copyLink: "Copier le lien de ce tableau",
    copied: "Copié.",
    shareFailed: "Partage impossible — réessayez.",
    copyFailed:
      "Copie impossible — maintenez le doigt sur la barre d’adresse pour copier le lien.",
  },
  privacy: {
    title: "Confidentialité",
    description: "Comment cette galerie traite vos renseignements.",
    intro:
      "Cette galerie est tenue par une seule artiste, à Calgary, en Alberta. Elle respecte la loi albertaine sur la protection des renseignements personnels (Personal Information Protection Act, PIPA).",
    collectedTitle: "Ce qui est recueilli",
    collected: [
      [
        "Pages vues :",
        "des compteurs anonymes par tableau (sans cookies ni empreinte numérique).",
      ],
      [
        "Statistiques globales :",
        "Cloudflare Web Analytics, qui ne dépose aucun cookie et ne suit personne individuellement.",
      ],
      [
        "Demandes :",
        "le nom, l’adresse courriel et le message que vous saisissez dans le formulaire d’un tableau — envoyés par courriel directement à l’artiste pour qu’elle puisse vous répondre. Rien de votre demande n’est conservé sur le site.",
      ],
      [
        "Achats :",
        "les paiements par carte, Apple Pay et Google Pay se font sur la page sécurisée de Stripe ; les données de carte n’atteignent jamais ce site. Stripe transmet votre nom, votre courriel, votre téléphone et votre adresse de livraison pour que le tableau puisse vous être expédié.",
      ],
      [
        "Alertes aux acheteurs :",
        "la liste de diffusion est conservée chez notre service d’envoi de courriels (Resend), pas dans la base de données du site — et seules les adresses qui ont touché le courriel de confirmation y figurent ; personne n’y est ajouté à son insu. Un courriel par nouveau tableau ou événement ; chaque courriel contient un lien de désabonnement en un clic, et la fenêtre « Me prévenir » a un bouton « Quitter la liste ».",
      ],
      [
        "Anti-spam :",
        "les formulaires d’achat et de courriel utilisent Cloudflare Turnstile, qui vérifie discrètement que vous êtes humain. Pas d’énigmes, pas de cookies de suivi.",
      ],
    ],
    notTitle: "Ce qui n’est pas recueilli",
    not: "Aucun compte, aucun traceur publicitaire, aucun suivi entre sites, aucune vente de renseignements personnels.",
    choicesTitle: "Vos choix",
    choices:
      "Pour ne plus recevoir les alertes, touchez de nouveau le bouton « Me prévenir ». Pour toute question sur la confidentialité, écrivez à l’artiste : elle s’en occupera personnellement.",
  },
  credits: {
    title: "Crédits",
    description:
      "Les logiciels et polices libres avec lesquels cette galerie est construite, et leurs licences.",
    intro:
      "Cette galerie est construite avec des logiciels et des polices libres et gratuits. Leurs auteurs demandent que leurs licences les accompagnent ; les voici donc, avec nos remerciements.",
    licenceNote:
      "Les textes des licences sont en anglais, tels que leurs auteurs les ont écrits.",
    uses: {
      fraunces: "La police des titres et des noms de tableaux.",
      caveat:
        "L’écriture manuscrite de la signature et de la note de l’atelier.",
      three: "Construit le modèle 3D derrière « Voir sur votre mur ».",
      modelViewer: "Affiche le tableau sur votre mur en réalité augmentée.",
      lit: "Intégré à <model-viewer>.",
      astro:
        "Construit le site et fait grandir chaque tableau jusqu’à sa page.",
      zod: "Vérifie les données de l’atelier à leur arrivée.",
      qrcode: "Dessine les cartes QR imprimables de l’atelier.",
    },
  },
  thanks: {
    title: "Merci",
    description: "Votre tableau est en route.",
    eyebrow: "Paiement reçu",
    heading: "Merci !",
    lede: "Le tableau est à vous. Stripe vous a envoyé votre reçu par courriel, et Barbara Straka vous écrira au sujet de l’expédition.",
    back: "Retour à la galerie",
  },
  notFound: {
    title: "Page introuvable — Barbara Straka, peintures originales",
    description:
      "Cette page n’existe pas. Parcourez plutôt la collection de peintures originales.",
    eyebrow: "Décroché — 404",
    heading: "Ce mur est vide.",
    body: "La page que vous cherchez n’est pas ici — elle a peut-être été déplacée. La collection, c’est par ici :",
    browse: "Parcourir la collection",
  },
  emailPages: {
    heading: "Alertes nouveaux tableaux",
    working: "Un instant…",
    back: "Retour à la galerie",
    confirmedTitle: "Vous êtes sur la liste — Barbara Straka",
    confirmNeedsLink:
      "Cette page a besoin de son lien — inscrivez-vous depuis n’importe quelle fenêtre « Me prévenir », puis touchez le courriel que nous vous envoyons.",
    confirmed: "Vous êtes sur la liste — nouveaux tableaux et événements.",
    confirmFailed:
      "Ce lien n’a pas fonctionné — il date peut-être de plus d’une semaine. Réinscrivez-vous depuis n’importe quelle fenêtre « Me prévenir ».",
    goodbyeTitle: "Désabonnement — Barbara Straka",
    goodbyeNeedsLink:
      "Cette page a besoin de son lien — il se trouve dans chaque courriel annonçant un nouveau tableau.",
    goodbye: "C’est fait — vous ne recevrez plus de courriels.",
    goodbyeFailed:
      "Ce lien n’a pas fonctionné — vous n’êtes sans doute déjà plus sur la liste.",
  },
};
