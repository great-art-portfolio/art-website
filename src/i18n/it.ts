import type { Strings } from "./en";

export const it: Strings = {
  location: "Calgary, Alberta",
  meta: {
    siteTitle: "Barbara Straka — Dipinti originali",
    description:
      "Dipinti originali di natura e astratti, direttamente dallo studio dell’artista.",
  },
  layout: {
    skip: "Vai al contenuto",
    home: "Home — torna alla galleria",
    nav: "Principale",
    collection: "Collezione",
    about: "L’artista",
    notifyMe: "Avvisami",
    privacy: "Privacy",
    privacyNote: "niente cookie, niente tracciamento",
    install: "Installa l’app della galleria",
    credits: "Crediti",
    language: "Lingua",
    readIn: "Leggi questo sito in italiano",
    noThanks: "No, grazie",
  },
  notify: {
    close: "Chiudi gli avvisi",
    title: "Non perderti nessun nuovo dipinto",
    body: "Ricevi un’email quando un nuovo dipinto arriva in galleria o c’è un evento in programma. Puoi cancellarti quando vuoi, con un clic.",
    email: "Indirizzo email",
    join: "Iscriviti alla lista",
    leave: "Esci dalla lista",
  },
  notifyClient: {
    badEmail: "Questa email non sembra corretta — controllala e riprova.",
    joining: "Iscrizione in corso…",
    checkInbox: "Controlla la posta — basta un tocco per confermare.",
    finishCheck:
      "Ancora un passo — completa il breve controllo qui sopra, poi riprova.",
    failed: "Non ha funzionato — riprova tra poco.",
    typeFirst: "Scrivi prima l’indirizzo, poi tocca Esci dalla lista.",
    leaving: "Uscita in corso…",
    left: "Fatto — quell’indirizzo non è più nella lista.",
    copied: "Copiato.",
    copyFailed: "Impossibile copiare — seleziona il testo.",
    tapToCopy: "Tocca per copiare questo messaggio",
  },
  home: {
    tagline: "Originali di natura e astratti, dipinti a mano",
    headline: "Dipinti originali, dallo studio",
    lede: "Originali di natura e astratti, dipinti a mano e venduti direttamente dallo studio. Quello che vedi è il dipinto vero — e quando un originale viene venduto, restano solo le sue stampe.",
    browse: "Sfoglia la collezione",
    getNotified: "Ricevi un avviso per le nuove opere",
    points: [
      ["Originali e stampe", "dipinti una volta, stampati su richiesta"],
      ["Direttamente", "dallo studio, senza ricarichi di galleria"],
      ["Spedizione con cura", "organizzata insieme dopo l’acquisto"],
    ],
    aboutEyebrow: "Dallo studio",
    aboutTitle: (place: string) => `Dipinti a ${place}`,
    about: [
      "Barbara Straka dipinge la natura e l’astrazione nel suo studio di Calgary — la luce della prateria, acque tranquille e studi di colore a metà strada tra paesaggio ed emozione. Ogni opera qui nasce come originale, e la maggior parte è disponibile anche in stampa. Quando un originale viene venduto, non torna più — ma le sue stampe restano.",
      "Qui tutto si vende direttamente dallo studio: il prezzo indicato è il prezzo pieno, e la spedizione si organizza insieme dopo l’acquisto. Per chiedere di un’opera, aprila e tocca <strong>Ti interessa?</strong> — il tuo messaggio arriva direttamente all’artista.",
    ],
  },
  gallery: {
    newest: "Il dipinto più recente",
    ask: "Chiedi di quest’opera →",
    availableLabel: "Dipinti disponibili",
    eyebrow: "La collezione",
    title: "Opere disponibili",
    count: (n: number) =>
      `${n} ${n === 1 ? "opera" : "opere"} · ognuna un pezzo unico`,
    soldLabel: "Dipinti venduti",
    soldEyebrow: "Collezionati",
    soldTitle: "Hanno trovato casa",
    soldCount: (n: number) =>
      `${n} ${n === 1 ? "opera venduta" : "opere vendute"}`,
    new: "Nuovo",
    sold: "Venduto",
  },
  painting: {
    back: "← Torna alla collezione",
    fullscreen: (title: string) => `Guarda ${title} a schermo intero`,
    tapFullscreen: "Tocca per vedere a schermo intero",
    lightbox: "Dipinto a schermo intero",
    closeFullscreen: "Chiudi schermo intero",
    eyebrow: "Dipinto originale · pezzo unico",
    soldNote: "Quest’opera ha trovato casa.",
    priceOnRequest: "Prezzo su richiesta — scrivi qui sotto per chiederlo.",
    buyNow: (price: string) => `Acquista ora · ${price}`,
    payNote:
      "Carta, Apple Pay o Google Pay. Preferisci Interac e-transfer, senza commissioni sulla carta? Chiedi qui sotto e riceverai i dettagli via email.",
    interested: "Ti interessa?",
    formTitle: "Chiedi di questo dipinto",
    shipNote: "Spedizione da concordare con l’artista dopo l’acquisto.",
    name: "Nome",
    email: "Email",
    message: "Messaggio",
    messagePlaceholder: "Ciao, adoro quest’opera…",
    send: "Invia la richiesta",
    wallTitle: "Provalo sulla tua parete",
    wallTouch:
      "Mostrato in dimensioni quasi reali. Tocca <strong>Guardalo sulla tua parete</strong>, poi punta il telefono dove lo appenderesti.",
    wallDesk: "Mostrato in dimensioni quasi reali.",
    machineNote: "Titolo e descrizione tradotti automaticamente dall’inglese.",
    wallScan:
      "Inquadra questo codice con la fotocamera del telefono, poi tocca <strong>Guardalo sulla tua parete</strong>.",
  },
  paintingClient: {
    sending: "Invio in corso…",
    sent: "Grazie — il tuo messaggio è stato inviato all’artista.",
    savedOffline:
      "Salvato — verrà inviato automaticamente appena torni online.",
    finishCheck:
      "Ancora un passo — completa il breve controllo qui sopra, poi tocca di nuovo Invia la richiesta.",
    failed:
      "Non è andato a buon fine — controlla il tuo indirizzo email e riprova.",
    askQuestion: "Fai una domanda",
    openingCheckout: "Apertura del pagamento sicuro…",
    checkoutUnavailable: "Il pagamento non è disponibile al momento. Riprova.",
    viewOnWall: "Guardalo sulla tua parete",
    share: "Condividi questo dipinto",
    copyLink: "Copia il link a questo dipinto",
    copied: "Copiato.",
    shareFailed: "Impossibile condividere — riprova.",
    copyFailed:
      "Impossibile copiare — tieni premuta la barra degli indirizzi per copiarlo.",
  },
  privacy: {
    title: "Privacy",
    description: "Come questa galleria tratta i tuoi dati.",
    intro:
      "Questa galleria è gestita da una sola artista a Calgary, Alberta. Rispetta la legge dell’Alberta sulla protezione dei dati personali (PIPA).",
    collectedTitle: "Cosa viene raccolto",
    collected: [
      [
        "Visualizzazioni:",
        "contatori anonimi per ogni dipinto (niente cookie, niente fingerprinting).",
      ],
      [
        "Statistiche aggregate:",
        "Cloudflare Web Analytics, che non imposta cookie e non traccia le singole persone.",
      ],
      [
        "Richieste:",
        "il nome, l’email e il messaggio che scrivi nel modulo di un dipinto — inviati via email direttamente all’artista, perché possa risponderti. Nulla della tua richiesta viene salvato sul sito.",
      ],
      [
        "Acquisti:",
        "i pagamenti con carta, Apple Pay e Google Pay avvengono sulla pagina sicura di Stripe; i dati della carta non arrivano mai a questo sito. Stripe trasmette nome, email, telefono e indirizzo di spedizione, così il dipinto può esserti spedito.",
      ],
      [
        "Avvisi per gli acquirenti:",
        "la lista email è custodita dal nostro servizio di invio (Resend), non nel database del sito — e contiene solo gli indirizzi che hanno toccato l’email di conferma: nessuno viene iscritto a sua insaputa. Un’email per ogni nuovo dipinto o evento; ogni email contiene un link per cancellarsi con un clic, e il riquadro Avvisami ha un pulsante Esci dalla lista.",
      ],
      [
        "Controllo antispam:",
        "i moduli di acquisto e di iscrizione usano Cloudflare Turnstile, che verifica in silenzio che tu sia una persona. Niente rompicapi, niente cookie di tracciamento.",
      ],
    ],
    notTitle: "Cosa non viene raccolto",
    not: "Nessun account, nessun tracciamento pubblicitario, nessun tracciamento tra siti, nessuna vendita di dati personali.",
    choicesTitle: "Le tue scelte",
    choices:
      "Per non ricevere più gli avvisi, usa il link di disiscrizione in fondo a qualsiasi email, oppure lascia la lista dal riquadro di iscrizione in qualsiasi pagina. Per qualsiasi domanda sulla privacy, scrivi all’artista: se ne occuperà di persona.",
  },
  credits: {
    title: "Crediti",
    description:
      "Il software open source e i caratteri con cui è costruita questa galleria, e le loro licenze.",
    intro:
      "Questa galleria è costruita con software e caratteri liberi e open source. I loro autori chiedono che le licenze li accompagnino, quindi eccole qui, con gratitudine.",
    licenceNote:
      "I testi delle licenze sono in inglese, come li hanno scritti i loro autori.",
    uses: {
      fraunces: "Il carattere dei titoli e dei nomi dei dipinti.",
      caveat: "La scrittura a mano della firma e del biglietto dello studio.",
      three: "Costruisce il modello 3D dietro «Guardalo sulla tua parete».",
      modelViewer: "Mostra il dipinto sulla tua parete in realtà aumentata.",
      lit: "Incluso dentro <model-viewer>.",
      astro:
        "Costruisce il sito e fa sì che ogni dipinto si allarghi fino a diventare la sua pagina.",
      zod: "Controlla i dati dello studio al loro arrivo.",
      qrcode: "Disegna i biglietti QR stampabili dello studio.",
    },
  },
  thanks: {
    title: "Grazie",
    description: "Il tuo dipinto è in arrivo.",
    eyebrow: "Pagamento ricevuto",
    heading: "Grazie!",
    lede: "Il dipinto è tuo. Stripe ti ha inviato la ricevuta via email, e Barbara Straka ti scriverà per organizzare la spedizione.",
    back: "Torna alla galleria",
  },
  notFound: {
    title: "Pagina non trovata",
    description:
      "Questa pagina non esiste. Sfoglia invece la collezione di dipinti originali.",
    eyebrow: "Parete vuota — 404",
    heading: "Questa parete è vuota.",
    body: "La pagina che cerchi non è qui — forse è stata spostata. La collezione è da questa parte:",
    browse: "Sfoglia la collezione",
  },
  emailPages: {
    heading: "Avvisi per i nuovi dipinti",
    working: "Un momento…",
    back: "Torna alla galleria",
    confirmedTitle: "Sei nella lista",
    confirmNeedsLink:
      "Questa pagina ha bisogno del suo link — iscriviti da un qualsiasi riquadro Avvisami e tocca l’email che ti mandiamo.",
    confirmed: "Sei nella lista — nuovi dipinti ed eventi.",
    confirmFailed:
      "Quel link non ha funzionato — forse ha più di una settimana. Iscriviti di nuovo da un qualsiasi riquadro Avvisami.",
    goodbyeTitle: "Iscrizione annullata",
    goodbyeNeedsLink:
      "Questa pagina ha bisogno del suo link — lo trovi in ogni email sui nuovi dipinti.",
    goodbye: "Indirizzo rimosso — niente più email.",
    goodbyeFailed:
      "Quel link non ha funzionato — probabilmente sei già fuori dalla lista.",
  },
  emails: {
    confirmSubject: "Conferma gli avvisi dello studio",
    confirm: (url: string) =>
      [
        "Qualcuno (speriamo tu) ha chiesto di ricevere via email",
        "i nuovi dipinti e gli eventi dello studio di Barbara Straka.",
        "",
        "Conferma qui:",
        url,
        "",
        "Se non sei stato tu, ignora questo messaggio: nessuno entra nella lista",
        "senza quel clic.",
      ].join("\n"),
    alreadySubject: "Sei già nella lista dello studio",
    already: [
      "Qualcuno (speriamo tu) ha chiesto di ricevere le email sui nuovi dipinti",
      "di Barbara Straka, e questo indirizzo è già nella lista.",
      "Non devi fare nulla: nuovi dipinti ed eventi continueranno ad arrivare.",
      "",
      "Se non sei stato tu, ignora questo messaggio.",
      "",
      "— Barbara",
    ].join("\n"),
    goodbyeSubject: "Rimosso dalla lista dei nuovi dipinti",
    goodbye: [
      "Fatto: non riceverai più email dallo studio.",
      "Puoi iscriverti di nuovo quando vuoi dal sito.",
      "",
      "— Barbara",
    ].join("\n"),
  },
};
