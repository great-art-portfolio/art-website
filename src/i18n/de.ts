import type { Strings } from "./en";

export const de: Strings = {
  location: "Calgary, Alberta",
  meta: {
    siteTitle: "Barbara Straka — Originalgemälde",
    description:
      "Originale Natur- und abstrakte Gemälde, direkt aus dem Atelier der Künstlerin.",
    paintingTitle: (title: string, sold: boolean) =>
      `${title} von Barbara Straka — ${sold ? "Verkauft" : "Originalgemälde"}`,
  },
  layout: {
    skip: "Zum Inhalt springen",
    home: "Startseite — zurück zur Galerie",
    nav: "Hauptmenü",
    collection: "Sammlung",
    about: "Über",
    notifyMe: "Benachrichtigen",
    privacy: "Datenschutz",
    privacyNote: "keine Cookies, keine Tracker",
    install: "Galerie-App installieren",
    credits: "Credits",
    language: "Sprache",
    readIn: "Diese Seite auf Deutsch lesen",
    noThanks: "Nein, danke",
  },
  notify: {
    close: "Benachrichtigungen schließen",
    title: "Kein neues Gemälde verpassen",
    body: "Erhalten Sie eine E-Mail, wenn ein neues Gemälde aufgehängt wird oder eine Veranstaltung ansteht. Jederzeit mit einem Klick abbestellbar.",
    email: "E-Mail-Adresse",
    join: "Eintragen",
    leave: "Austragen",
  },
  notifyClient: {
    badEmail:
      "Diese E-Mail-Adresse sieht nicht richtig aus — bitte prüfen und erneut versuchen.",
    joining: "Wird eingetragen…",
    checkInbox:
      "Schauen Sie in Ihr Postfach — ein Klick genügt zur Bestätigung.",
    finishCheck:
      "Noch ein Schritt — schließen Sie die kurze Prüfung oben ab und versuchen Sie es dann erneut.",
    failed:
      "Das hat nicht geklappt — bitte versuchen Sie es gleich noch einmal.",
    typeFirst: "Geben Sie zuerst die Adresse ein, dann „Austragen“.",
    leaving: "Wird ausgetragen…",
    left: "Erledigt — diese Adresse steht nicht mehr auf der Liste.",
    copied: "Kopiert.",
    copyFailed: "Kopieren nicht möglich — markieren Sie stattdessen den Text.",
    tapToCopy: "Tippen, um diese Nachricht zu kopieren",
  },
  home: {
    tagline: "Natur- und abstrakte Originale, von Hand gemalt",
    headline: "Originalgemälde, direkt aus dem Atelier",
    lede: "Natur- und abstrakte Originale, von Hand gemalt und direkt aus dem Atelier verkauft. Was Sie sehen, ist das echte Gemälde — und wenn ein Original verkauft ist, bleiben nur noch seine Drucke.",
    browse: "Zur Sammlung",
    getNotified: "Über neue Werke informiert werden",
    points: [
      ["Originale & Drucke", "einmal gemalt, auf Bestellung gedruckt"],
      ["Direkt", "aus dem Atelier, ohne Galerieaufschlag"],
      ["Sorgfältig versandt", "nach dem Kauf gemeinsam abgestimmt"],
    ],
    aboutEyebrow: "Aus dem Atelier",
    aboutTitle: (place: string) => `Gemalt in ${place}`,
    about: [
      "Barbara Straka malt Natur und Abstraktion in ihrem Atelier in Calgary — Prärielicht, stilles Wasser und Farbstudien, die irgendwo zwischen Landschaft und Gefühl liegen. Jedes Stück hier beginnt als Original — die meisten gibt es auch als Druck. Ist ein Original verkauft, ist es für immer fort — seine Drucke aber bleiben.",
      "Alles hier wird direkt aus dem Atelier verkauft: Der angegebene Preis ist der volle Preis, und der Versand wird nach dem Kauf gemeinsam abgestimmt. Um nach einem Werk zu fragen, öffnen Sie es und tippen Sie auf <strong>Interesse?</strong> — Ihre Nachricht geht direkt an die Künstlerin.",
    ],
  },
  gallery: {
    newest: "Neuestes Gemälde",
    ask: "Nach diesem Werk fragen →",
    availableLabel: "Verfügbare Gemälde",
    eyebrow: "Die Sammlung",
    title: "Verfügbare Werke",
    count: (n: number) =>
      n === 1 ? `${n} Werk · ein Unikat` : `${n} Werke · jedes ein Unikat`,
    soldLabel: "Verkaufte Gemälde",
    soldEyebrow: "In Sammlungen",
    soldTitle: "Haben ein Zuhause gefunden",
    soldCount: (n: number) => `${n} ${n === 1 ? "Werk" : "Werke"} verkauft`,
    new: "Neu",
    sold: "Verkauft",
  },
  painting: {
    back: "← Zurück zur Sammlung",
    fullscreen: (title: string) => `${title} im Vollbild ansehen`,
    tapFullscreen: "Tippen für Vollbild",
    lightbox: "Gemälde im Vollbild",
    closeFullscreen: "Vollbild schließen",
    eyebrow: "Originalgemälde · Unikat",
    soldNote: "Dieses Werk hat ein Zuhause gefunden.",
    priceOnRequest:
      "Preis auf Anfrage — schreiben Sie unten eine kurze Nachricht.",
    buyNow: (price: string) => `Jetzt kaufen · ${price}`,
    payNote:
      "Karte, Apple Pay oder Google Pay. Lieber per Interac e-transfer (kanadische Banküberweisung), ohne Kartengebühren? Fragen Sie unten, und Sie erhalten die Details per E-Mail.",
    interested: "Interesse?",
    formTitle: "Nach diesem Gemälde fragen",
    shipNote: "Der Versand wird nach dem Kauf mit der Künstlerin abgestimmt.",
    name: "Name",
    email: "E-Mail",
    message: "Nachricht",
    messagePlaceholder: "Hallo, dieses Bild gefällt mir sehr…",
    send: "Anfrage senden",
    wallTitle: "An Ihrer Wand ausprobieren",
    wallTouch:
      "Ungefähr in Originalgröße dargestellt. Tippen Sie auf <strong>An Ihrer Wand ansehen</strong> und richten Sie Ihr Handy dorthin, wo es hängen würde.",
    wallDesk: "Ungefähr in Originalgröße dargestellt.",
    machineNote:
      "Titel und Beschreibung wurden automatisch aus dem Englischen übersetzt.",
    wallScan:
      "Um es an Ihrer Wand zu sehen, scannen Sie dies mit der Handykamera und tippen Sie dann auf <strong>An Ihrer Wand ansehen</strong>.",
  },
  paintingClient: {
    sending: "Wird gesendet…",
    sent: "Danke — Ihre Nachricht wurde an die Künstlerin gesendet.",
    savedOffline:
      "Gespeichert — sie wird automatisch gesendet, sobald Sie wieder online sind.",
    finishCheck:
      "Noch ein Schritt — schließen Sie die kurze Prüfung oben ab und tippen Sie dann erneut auf „Anfrage senden“.",
    failed:
      "Das hat nicht geklappt — prüfen Sie Ihre E-Mail-Adresse und versuchen Sie es erneut.",
    askQuestion: "Eine Frage stellen",
    openingCheckout: "Sichere Kasse wird geöffnet…",
    checkoutUnavailable:
      "Die Kasse ist gerade nicht verfügbar. Bitte versuchen Sie es erneut.",
    viewOnWall: "An Ihrer Wand ansehen",
    share: "Dieses Gemälde teilen",
    copyLink: "Link zu diesem Gemälde kopieren",
    copied: "Kopiert.",
    shareFailed: "Teilen nicht möglich — bitte erneut versuchen.",
    copyFailed:
      "Kopieren nicht möglich — halten Sie die Adressleiste gedrückt, um den Link zu kopieren.",
  },
  privacy: {
    title: "Datenschutz",
    description: "Wie diese Galerie mit Ihren Daten umgeht.",
    intro:
      "Diese Galerie wird von einer einzelnen Künstlerin in Calgary, Alberta, betrieben. Sie folgt dem Datenschutzgesetz der Provinz Alberta (Personal Information Protection Act, PIPA).",
    collectedTitle: "Was erfasst wird",
    collected: [
      [
        "Seitenaufrufe:",
        "anonyme Zähler pro Gemälde (keine Cookies, kein Fingerprinting).",
      ],
      [
        "Gesamtstatistik:",
        "Cloudflare Web Analytics, das keine Cookies setzt und keine einzelnen Personen verfolgt.",
      ],
      [
        "Anfragen:",
        "Name, E-Mail-Adresse und Nachricht, die Sie in das Formular eines Gemäldes eingeben — direkt per E-Mail an die Künstlerin, damit sie antworten kann. Von Ihrer Anfrage wird nichts auf der Website gespeichert.",
      ],
      [
        "Käufe:",
        "Zahlungen per Karte, Apple Pay und Google Pay laufen über die sichere Seite von Stripe; Kartendaten erreichen diese Website nie. Stripe übermittelt Ihren Namen, Ihre E-Mail-Adresse, Telefonnummer und Lieferadresse, damit das Gemälde an Sie versandt werden kann.",
      ],
      [
        "Benachrichtigungen für Käufer:",
        "die E-Mail-Liste liegt bei unserem Mailversender (Resend), nicht in der Datenbank der Website — und nur Adressen, die in der Bestätigungs-E-Mail getippt haben, stehen darauf; niemand wird ungefragt eingetragen. Eine E-Mail pro neuem Gemälde oder Veranstaltung; jede E-Mail enthält einen Abmeldelink für einen Klick, und das Feld „Benachrichtigen“ hat eine Schaltfläche „Austragen“.",
      ],
      [
        "Spamschutz:",
        "die Kauf- und E-Mail-Formulare nutzen Cloudflare Turnstile, das unauffällig bestätigt, dass Sie ein Mensch sind. Keine Rätsel, keine Tracking-Cookies.",
      ],
    ],
    notTitle: "Was nicht erfasst wird",
    not: "Keine Konten, keine Werbetracker, kein seitenübergreifendes Tracking, kein Verkauf personenbezogener Daten.",
    choicesTitle: "Ihre Möglichkeiten",
    choices:
      "Um keine Benachrichtigungen mehr zu erhalten, tippen Sie erneut auf die Schaltfläche „Benachrichtigen“. Bei Fragen zum Datenschutz schreiben Sie der Künstlerin eine E-Mail — sie kümmert sich persönlich darum.",
  },
  credits: {
    title: "Credits",
    description:
      "Die Open-Source-Software und Schriften, mit denen diese Galerie gebaut ist, und ihre Lizenzen.",
    intro:
      "Diese Galerie ist mit freier Open-Source-Software und freien Schriften gebaut. Ihre Urheber bitten darum, dass ihre Lizenzen sie begleiten — hier sind sie, mit Dank.",
    licenceNote:
      "Die Lizenztexte sind auf Englisch, so wie ihre Autoren sie geschrieben haben.",
    uses: {
      fraunces: "Die Schrift für Überschriften und Gemäldetitel.",
      caveat: "Die Handschrift in der Signatur und der Atelier-Notiz.",
      three: "Erzeugt das 3D-Modell hinter „An Ihrer Wand ansehen“.",
      modelViewer: "Zeigt das Gemälde in Augmented Reality an Ihrer Wand.",
      lit: "In <model-viewer> enthalten.",
      astro:
        "Baut die Website und lässt jedes Gemälde in seine Seite hineinwachsen.",
      zod: "Prüft die Daten des Ateliers beim Eingang.",
      qrcode: "Zeichnet die druckbaren QR-Karten des Ateliers.",
    },
  },
  thanks: {
    title: "Vielen Dank",
    description: "Ihr Gemälde ist unterwegs.",
    eyebrow: "Zahlung erhalten",
    heading: "Vielen Dank!",
    lede: "Das Gemälde gehört Ihnen. Stripe hat Ihnen die Quittung per E-Mail geschickt, und Barbara Straka meldet sich per E-Mail wegen des Versands.",
    back: "Zurück zur Galerie",
  },
  notFound: {
    title: "Nicht gefunden — Barbara Straka Originalgemälde",
    description:
      "Diese Seite gibt es nicht. Sehen Sie sich stattdessen die Sammlung der Originalgemälde an.",
    eyebrow: "Abgehängt — 404",
    heading: "Diese Wand ist leer.",
    body: "Die gesuchte Seite ist nicht hier — vielleicht wurde sie verschoben. Zur Sammlung geht es hier entlang:",
    browse: "Zur Sammlung",
  },
  emailPages: {
    heading: "Benachrichtigungen über neue Gemälde",
    working: "Einen Moment…",
    back: "Zurück zur Galerie",
    confirmedTitle: "Sie sind eingetragen — Barbara Straka",
    confirmNeedsLink:
      "Diese Seite braucht ihren Link — tragen Sie sich über ein beliebiges „Benachrichtigen“-Feld ein und tippen Sie auf den Link in unserer E-Mail.",
    confirmed: "Sie sind eingetragen — für neue Gemälde und Veranstaltungen.",
    confirmFailed:
      "Dieser Link hat nicht funktioniert — vielleicht ist er älter als eine Woche. Tragen Sie sich über ein „Benachrichtigen“-Feld erneut ein.",
    goodbyeTitle: "Abgemeldet — Barbara Straka",
    goodbyeNeedsLink:
      "Diese Seite braucht ihren Link — er steht in jeder E-Mail zu einem neuen Gemälde.",
    goodbye: "Sie wurden ausgetragen — keine weiteren E-Mails.",
    goodbyeFailed:
      "Dieser Link hat nicht funktioniert — wahrscheinlich sind Sie bereits ausgetragen.",
  },
};
