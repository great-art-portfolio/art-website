import type { Strings } from "./en";

export const nl: Strings = {
  location: "Calgary, Alberta",
  meta: {
    siteTitle: "Barbara Straka — Originele schilderijen",
    description:
      "Originele natuur- en abstracte schilderijen, rechtstreeks uit het atelier van de kunstenaar.",
    paintingTitle: (title: string, sold: boolean) =>
      `${title} door Barbara Straka — ${sold ? "Verkocht" : "Origineel schilderij"}`,
  },
  layout: {
    skip: "Naar de inhoud",
    home: "Home — terug naar de galerie",
    nav: "Hoofdmenu",
    collection: "Collectie",
    about: "Over",
    notifyMe: "Houd me op de hoogte",
    privacy: "Privacy",
    privacyNote: "geen cookies, geen trackers",
    install: "Installeer de galerie-app",
    credits: "Credits",
    language: "Taal",
    readIn: "Lees deze site in het Nederlands",
    noThanks: "Nee, bedankt",
  },
  notify: {
    close: "Meldingen sluiten",
    title: "Mis geen enkel nieuw schilderij",
    body: "Ontvang een e-mail zodra er een nieuw schilderij in de galerie hangt of er een evenement aankomt. U meldt zich met één klik weer af, wanneer u maar wilt.",
    email: "E-mailadres",
    join: "Aanmelden",
    leave: "Afmelden",
  },
  notifyClient: {
    badEmail:
      "Dat e-mailadres lijkt niet te kloppen — controleer het en probeer het opnieuw.",
    joining: "Aanmelden…",
    checkInbox: "Kijk in uw inbox — met één tik is het bevestigd.",
    finishCheck:
      "Nog één stap — rond de korte controle hierboven af en probeer het dan opnieuw.",
    failed: "Dat lukte niet — probeer het straks opnieuw.",
    typeFirst: "Typ eerst het adres en tik dan op Afmelden.",
    leaving: "Afmelden…",
    left: "Klaar — dat adres staat niet meer op de lijst.",
    copied: "Gekopieerd.",
    copyFailed: "Kopiëren lukte niet — selecteer de tekst zelf.",
    tapToCopy: "Tik om dit bericht te kopiëren",
  },
  home: {
    tagline: "Originele natuur- en abstracte werken, met de hand geschilderd",
    headline: "Originele schilderijen, uit het atelier",
    lede: "Originele natuur- en abstracte werken, met de hand geschilderd en rechtstreeks vanuit het atelier verkocht. Wat u ziet is het echte schilderij — en is een origineel verkocht, dan blijven alleen de prints over.",
    browse: "Bekijk de collectie",
    getNotified: "Ontvang bericht over nieuw werk",
    points: [
      ["Originelen & prints", "één keer geschilderd, op bestelling gedrukt"],
      ["Direct", "uit het atelier, zonder galeriemarge"],
      ["Zorgvuldig verzonden", "samen geregeld na aankoop"],
    ],
    aboutEyebrow: "Uit het atelier",
    aboutTitle: (place: string) => `Geschilderd in ${place}`,
    about: [
      "Barbara Straka schildert natuur en abstractie in haar atelier in Calgary — prairielicht, stil water en kleurstudies die ergens tussen landschap en gevoel in zitten. Elk werk hier begint als origineel — de meeste zijn ook als print verkrijgbaar. Is een origineel verkocht, dan is het voorgoed weg — maar de prints blijven bestaan.",
      "Alles hier wordt rechtstreeks vanuit het atelier verkocht: de vermelde prijs is de volledige prijs, en de verzending regelen we samen na aankoop. Wilt u iets vragen over een werk? Open het en tik op <strong>Interesse?</strong> — uw bericht gaat rechtstreeks naar de kunstenaar.",
    ],
  },
  gallery: {
    newest: "Nieuwste schilderij",
    ask: "Vraag naar dit werk →",
    availableLabel: "Beschikbare schilderijen",
    eyebrow: "De collectie",
    title: "Beschikbare werken",
    count: (n: number) =>
      `${n} ${n === 1 ? "werk" : "werken"} · elk werk uniek`,
    soldLabel: "Verkochte schilderijen",
    soldEyebrow: "Verzameld",
    soldTitle: "Hebben een thuis gevonden",
    soldCount: (n: number) => `${n} ${n === 1 ? "werk" : "werken"} verkocht`,
    new: "Nieuw",
    sold: "Verkocht",
  },
  painting: {
    back: "← Terug naar de collectie",
    fullscreen: (title: string) => `${title} schermvullend bekijken`,
    tapFullscreen: "Tik om schermvullend te bekijken",
    lightbox: "Schilderij schermvullend",
    closeFullscreen: "Schermvullende weergave sluiten",
    eyebrow: "Origineel schilderij · uniek",
    soldNote: "Dit werk heeft een thuis gevonden.",
    priceOnRequest:
      "Prijs op aanvraag — stuur hieronder een berichtje om ernaar te vragen.",
    buyNow: (price: string) => `Nu kopen · ${price}`,
    payNote:
      "Kaart, Apple Pay of Google Pay. Liever Interac e-transfer, zonder kaartkosten? Vraag het hieronder en u krijgt de gegevens per e-mail.",
    interested: "Interesse?",
    formTitle: "Vraag naar dit schilderij",
    shipNote: "De verzending regelt u na aankoop met de kunstenaar.",
    name: "Naam",
    email: "E-mail",
    message: "Bericht",
    messagePlaceholder: "Hallo, ik vind dit werk prachtig…",
    send: "Vraag versturen",
    wallTitle: "Probeer het aan uw muur",
    wallTouch:
      "Ongeveer op ware grootte getoond. Tik op <strong>Bekijk aan uw muur</strong> en richt uw telefoon op de plek waar het zou hangen.",
    wallDesk: "Ongeveer op ware grootte getoond.",
    machineNote: "Titel en beschrijving automatisch vertaald uit het Engels.",
    wallScan:
      "Wilt u het aan uw muur zien? Scan dit met de camera van uw telefoon en tik dan op <strong>Bekijk aan uw muur</strong>.",
  },
  paintingClient: {
    sending: "Versturen…",
    sent: "Dank u — uw bericht is naar de kunstenaar verstuurd.",
    savedOffline:
      "Opgeslagen — het wordt vanzelf verstuurd zodra u weer online bent.",
    finishCheck:
      "Nog één stap — rond de korte controle hierboven af en tik dan opnieuw op Vraag versturen.",
    failed:
      "Dat is niet gelukt — controleer uw e-mailadres en probeer het opnieuw.",
    askQuestion: "Stel een vraag",
    openingCheckout: "Beveiligd afrekenen wordt geopend…",
    checkoutUnavailable:
      "Afrekenen is op dit moment niet mogelijk. Probeer het opnieuw.",
    viewOnWall: "Bekijk aan uw muur",
    share: "Deel dit schilderij",
    copyLink: "Kopieer de link naar dit schilderij",
    copied: "Gekopieerd.",
    shareFailed: "Delen lukte niet — probeer het opnieuw.",
    copyFailed:
      "Kopiëren lukte niet — houd de adresbalk ingedrukt om het te kopiëren.",
  },
  privacy: {
    title: "Privacy",
    description: "Hoe deze galerie met uw gegevens omgaat.",
    intro:
      "Deze galerie wordt gerund door één kunstenaar in Calgary, Alberta. Ze volgt de wet van Alberta op de bescherming van persoonsgegevens (PIPA).",
    collectedTitle: "Wat er wordt verzameld",
    collected: [
      [
        "Paginaweergaven:",
        "anonieme tellers per schilderij (geen cookies, geen fingerprinting).",
      ],
      [
        "Totaalstatistieken:",
        "Cloudflare Web Analytics, dat geen cookies plaatst en geen individuen volgt.",
      ],
      [
        "Vragen:",
        "de naam, het e-mailadres en het bericht dat u in het formulier bij een schilderij typt — rechtstreeks naar de kunstenaar gemaild, zodat ze kan antwoorden. Niets van uw vraag wordt op de site bewaard.",
      ],
      [
        "Aankopen:",
        "betalingen met kaart, Apple Pay en Google Pay gebeuren op de beveiligde pagina van Stripe; kaartgegevens bereiken deze site nooit. Stripe geeft uw naam, e-mailadres, telefoonnummer en verzendadres door, zodat het schilderij naar u verzonden kan worden.",
      ],
      [
        "Meldingen voor kopers:",
        "de e-maillijst staat bij onze mailverzender (Resend), niet in de database van de site — en alleen adressen die op de bevestigingsmail hebben getikt staan erop; niemand komt er ongemerkt bij. Eén e-mail per nieuw schilderij of evenement; elke e-mail bevat een afmeldlink die met één klik werkt, en het vak Houd me op de hoogte heeft een knop Afmelden.",
      ],
      [
        "Spamcontrole:",
        "het koopformulier en het e-mailformulier gebruiken Cloudflare Turnstile, dat ongemerkt nagaat of u een mens bent. Geen puzzels, geen trackingcookies.",
      ],
    ],
    notTitle: "Wat er niet wordt verzameld",
    not: "Geen accounts, geen advertentietrackers, geen tracking over sites heen, geen verkoop van persoonsgegevens.",
    choicesTitle: "Uw keuzes",
    choices:
      "Wilt u geen berichten meer? Gebruik de afmeldlink onderaan elke e-mail, of verlaat de lijst via het aanmeldvak op elke pagina. Voor vragen over privacy kunt u de kunstenaar mailen; zij handelt het persoonlijk af.",
  },
  credits: {
    title: "Credits",
    description:
      "De opensourcesoftware en lettertypen waarmee deze galerie is gebouwd, en hun licenties.",
    intro:
      "Deze galerie is gebouwd met vrije opensourcesoftware en lettertypen. De makers vragen dat hun licenties met hun werk meereizen, dus hier zijn ze, met dank.",
    licenceNote:
      "De licentieteksten staan in het Engels, zoals hun auteurs ze schreven.",
    uses: {
      fraunces: "Het lettertype voor koppen en titels van schilderijen.",
      caveat:
        "Het handschrift in de handtekening en het briefje van het atelier.",
      three: "Bouwt het 3D-model achter “Bekijk aan uw muur”.",
      modelViewer: "Toont het schilderij aan uw muur in augmented reality.",
      lit: "Meegeleverd in <model-viewer>.",
      astro:
        "Bouwt de site en laat elk schilderij uitgroeien tot zijn eigen pagina.",
      zod: "Controleert de gegevens van het atelier bij binnenkomst.",
      qrcode: "Tekent de afdrukbare QR-kaartjes van het atelier.",
    },
  },
  thanks: {
    title: "Dank u",
    description: "Uw schilderij is onderweg.",
    eyebrow: "Betaling ontvangen",
    heading: "Dank u wel!",
    lede: "Het schilderij is van u. Stripe heeft uw bon gemaild, en Barbara Straka neemt per e-mail contact met u op over de verzending.",
    back: "Terug naar de galerie",
  },
  notFound: {
    title: "Niet gevonden — Barbara Straka, originele schilderijen",
    description:
      "Deze pagina bestaat niet. Bekijk in plaats daarvan de collectie originele schilderijen.",
    eyebrow: "Van de muur — 404",
    heading: "Die muur is leeg.",
    body: "De pagina die u zoekt is er niet — misschien is ze verplaatst. De collectie is deze kant op:",
    browse: "Bekijk de collectie",
  },
  emailPages: {
    heading: "Meldingen van nieuwe schilderijen",
    working: "Bezig…",
    back: "Terug naar de galerie",
    confirmedTitle: "U staat op de lijst — Barbara Straka",
    confirmNeedsLink:
      "Deze pagina werkt alleen via de link — meld u aan via een vak Houd me op de hoogte en tik op de e-mail die we sturen.",
    confirmed: "U staat op de lijst — nieuwe schilderijen en evenementen.",
    confirmFailed:
      "Die link werkte niet — misschien is hij ouder dan een week. Meld u opnieuw aan via een vak Houd me op de hoogte.",
    goodbyeTitle: "Afgemeld — Barbara Straka",
    goodbyeNeedsLink:
      "Deze pagina werkt alleen via de link — die staat in elke e-mail over een nieuw schilderij.",
    goodbye: "U bent afgemeld — geen e-mails meer.",
    goodbyeFailed:
      "Die link werkte niet — u staat waarschijnlijk al niet meer op de lijst.",
  },
  emails: {
    confirmSubject: "Bevestig uw berichten van het atelier",
    confirm: (url: string) =>
      [
        "Iemand (hopelijk u) heeft gevraagd om per e-mail te horen over nieuwe schilderijen",
        "en evenementen uit het atelier van Barbara Straka.",
        "",
        "Bevestig hier:",
        url,
        "",
        "Was u dit niet? Negeer dan dit bericht — zonder die klik",
        "komt niemand op de lijst.",
      ].join("\n"),
    alreadySubject: "U staat al op de lijst van het atelier",
    already: [
      "Iemand (hopelijk u) heeft gevraagd om de e-mails over nieuwe schilderijen",
      "van Barbara Straka te ontvangen, en dit adres staat al op de lijst.",
      "U hoeft niets te doen — nieuwe schilderijen en evenementen blijven komen.",
      "",
      "Was u dit niet? Negeer dan dit bericht.",
      "",
      "— Barbara",
    ].join("\n"),
    goodbyeSubject: "Verwijderd van de lijst voor nieuwe schilderijen",
    goodbye: [
      "Gedaan — u ontvangt geen e-mails meer van het atelier.",
      "U kunt zich altijd opnieuw aanmelden via de website.",
      "",
      "— Barbara",
    ].join("\n"),
  },
};
