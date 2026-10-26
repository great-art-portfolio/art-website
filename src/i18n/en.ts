/** Every word buyers read on the public site, in English. Each other
 * language file has this exact shape, so a missing line is a type error.
 * Strings with markup (<strong>) are rendered as HTML; they are ours, never
 * visitor input. Names (the artist, her paintings, the fonts and
 * libraries) aren't translated here: paintings get their own translations,
 * written by the studio when she saves. */
export const en = {
  /** "Calgary, Alberta", as written in this language. */
  location: "Calgary, Alberta",
  meta: {
    siteTitle: "Barbara Straka — Original Paintings",
    description:
      "Original nature and abstract paintings, direct from the artist's studio.",
    /** Browser tab and link preview for a painting page. */
    paintingTitle: (title: string, sold: boolean) =>
      `${title} by Barbara Straka — ${sold ? "Sold" : "Original Painting"}`,
  },
  layout: {
    skip: "Skip to content",
    home: "Home — back to the gallery",
    nav: "Main",
    collection: "Collection",
    about: "About",
    notifyMe: "Notify me",
    privacy: "Privacy",
    privacyNote: "no cookies, no trackers",
    install: "Install the gallery app",
    credits: "Credits",
    language: "Language",
    /** Offered, in this language, to a visitor whose browser prefers it. */
    readIn: "Read this site in English",
    noThanks: "No thanks",
  },
  notify: {
    close: "Close notifications",
    title: "Never miss a new painting",
    body: "Get an email when a new painting is hung or an event comes up. Unsubscribe any time with one click.",
    email: "Email address",
    join: "Join the list",
    leave: "Leave the list",
  },
  /** Said by the sign-up box's script. */
  notifyClient: {
    badEmail: "That email doesn't look right — check it and try again.",
    joining: "Joining…",
    checkInbox: "Check your inbox — one tap confirms it.",
    finishCheck:
      "One more step — finish the quick check above, then try again.",
    failed: "That didn't work — try again in a bit.",
    typeFirst: "Type the address first, then Leave the list.",
    leaving: "Leaving…",
    left: "Done — that address is off the list.",
    copied: "Copied.",
    copyFailed: "Couldn't copy — select the text instead.",
    tapToCopy: "Tap to copy this message",
  },
  home: {
    tagline: "Nature & abstract originals, painted by hand",
    headline: "Original paintings, from the studio",
    lede: "Nature and abstract originals, painted by hand and sold directly from the studio. What you see is the actual painting — and when an original sells, only its prints remain.",
    browse: "Browse the collection",
    getNotified: "Get notified of new work",
    points: [
      ["Originals & prints", "painted once, printed to order"],
      ["Direct", "from the studio, no gallery markup"],
      ["Shipped with care", "arranged together after purchase"],
    ],
    aboutEyebrow: "From the studio",
    aboutTitle: (place: string) => `Painted in ${place}`,
    about: [
      "Barbara Straka paints nature and abstraction from her Calgary studio — prairie light, quiet water, and colour studies that sit somewhere between landscape and feeling. Every piece here starts as an original — most are also available as prints. When an original sells, it's gone for good — though its prints live on.",
      "Everything here sells directly from the studio: the listed price is the full price, and shipping is arranged together after purchase. To ask about a piece, open it and tap <strong>Interested?</strong> — your note goes straight to the artist.",
    ],
  },
  gallery: {
    newest: "Newest painting",
    ask: "Ask about this piece →",
    availableLabel: "Available paintings",
    eyebrow: "The collection",
    title: "Available works",
    count: (n: number) =>
      `${n} ${n === 1 ? "work" : "works"} · each one of a kind`,
    soldLabel: "Sold paintings",
    soldEyebrow: "Collected",
    soldTitle: "Found their homes",
    soldCount: (n: number) => `${n} ${n === 1 ? "work" : "works"} sold`,
    new: "New",
    sold: "Sold",
  },
  painting: {
    back: "← Back to the collection",
    fullscreen: (title: string) => `View ${title} fullscreen`,
    tapFullscreen: "Tap to view fullscreen",
    lightbox: "Painting fullscreen view",
    closeFullscreen: "Close fullscreen",
    eyebrow: "Original painting · one of a kind",
    soldNote: "This piece has found a home.",
    priceOnRequest: "Price on request — send a note below to ask.",
    buyNow: (price: string) => `Buy now · ${price}`,
    payNote:
      "Card, Apple Pay, or Google Pay. Prefer Interac e-transfer, with no card fees? Ask below and you'll get the details by email.",
    interested: "Interested?",
    formTitle: "Ask about this painting",
    shipNote: "Shipping arranged with the artist after purchase.",
    name: "Name",
    email: "Email",
    message: "Message",
    messagePlaceholder: "Hi, I love this piece…",
    send: "Send inquiry",
    wallTitle: "Try it on your wall",
    wallTouch:
      "Shown about true size. Tap <strong>View on your wall</strong>, then point your phone where it would hang.",
    wallDesk: "Shown about true size.",
    /** Under a painting's title and description in other languages. */
    machineNote: "Title and description translated automatically from English.",
    wallScan:
      "To see it on your wall, scan this with your phone's camera, then tap <strong>View on your wall</strong>.",
  },
  /** Said by the painting page's script. */
  paintingClient: {
    sending: "Sending…",
    sent: "Thanks — your note has been sent to the artist.",
    savedOffline: "Saved — it will send automatically when you're back online.",
    finishCheck:
      "One more step — finish the quick check above, then tap Send inquiry again.",
    failed: "That didn't go through — check your email address and try again.",
    askQuestion: "Ask a question",
    openingCheckout: "Opening secure checkout…",
    checkoutUnavailable:
      "Checkout isn't available right now. Please try again.",
    viewOnWall: "View on your wall",
    share: "Share this painting",
    copyLink: "Copy the link to this painting",
    copied: "Copied.",
    shareFailed: "Couldn't share — try again.",
    copyFailed: "Couldn't copy — hold the address bar to copy it.",
  },
  privacy: {
    title: "Privacy",
    description: "How this gallery handles your information.",
    intro:
      "This gallery is run by a single artist in Calgary, Alberta. It follows Alberta's Personal Information Protection Act (PIPA).",
    collectedTitle: "What is collected",
    collected: [
      [
        "Page views:",
        "anonymous counters per painting (no cookies, no fingerprinting).",
      ],
      [
        "Aggregate analytics:",
        "Cloudflare Web Analytics, which sets no cookies and tracks no individuals.",
      ],
      [
        "Inquiries:",
        "the name, email, and message you type into a painting's form — emailed straight to the artist so she can reply. Nothing about your inquiry is stored on the site.",
      ],
      [
        "Purchases:",
        "card, Apple Pay, and Google Pay payments happen on Stripe's secure page; card details never reach this site. Stripe passes along your name, email, phone, and shipping address so the painting can be shipped to you.",
      ],
      [
        "Buyer alerts:",
        "the email list lives with our mail sender (Resend), not in the site's database — and only addresses that tapped the confirmation email are on it, nothing joins silently. One email per new painting or event; every email carries a one-click unsubscribe link, and the Notify me box has a Leave the list button.",
      ],
      [
        "Spam check:",
        "the buy and email forms use Cloudflare Turnstile, which quietly confirms you're human. No puzzles, no tracking cookies.",
      ],
    ],
    notTitle: "What is not collected",
    not: "No accounts, no advertising trackers, no cross-site tracking, no sale of personal information.",
    choicesTitle: "Your choices",
    choices:
      "To stop buyer alerts, use the unsubscribe link at the bottom of any of the emails, or leave the list from the sign-up box on any page. To ask anything about privacy, email the artist and it will be handled personally.",
  },
  credits: {
    title: "Credits",
    description:
      "The open-source software and fonts this gallery is built with, and their licences.",
    intro:
      "This gallery is built with free, open-source software and fonts. Their makers ask that their licences travel with them, so here they are, with thanks.",
    /** The licences themselves stay in English, as written. */
    licenceNote: "Licence texts are in English, as their authors wrote them.",
    uses: {
      fraunces: "The typeface for headings and painting titles.",
      caveat: "The handwriting in the signature and the studio note.",
      three:
        "Builds the 3D model for “Try it on your wall”, the AR wall preview.",
      modelViewer:
        "Shows that wall preview, and hangs it on your real wall in AR.",
      lit: "Bundled inside <model-viewer>.",
      astro: "Builds the site, and makes each painting grow into its page.",
      zod: "Checks the studio's data on its way in.",
      qrcode: "Draws the studio's printable QR cards.",
    },
  },
  thanks: {
    title: "Thank you",
    description: "Your painting is on its way.",
    eyebrow: "Payment received",
    heading: "Thank you!",
    lede: "The painting is yours. Stripe has emailed your receipt, and Barbara Straka will be in touch by email about shipping.",
    back: "Back to the gallery",
  },
  notFound: {
    title: "Not found — Barbara Straka Original Paintings",
    description:
      "This page doesn't exist. Browse the collection of original paintings instead.",
    eyebrow: "Off the wall — 404",
    heading: "That wall is empty.",
    body: "The page you're looking for isn't here — it may have moved. The collection is this way:",
    browse: "Browse the collection",
  },
  emailPages: {
    heading: "New-painting alerts",
    working: "Working…",
    back: "Back to the gallery",
    confirmedTitle: "You're on the list — Barbara Straka",
    confirmNeedsLink:
      "This page needs its link — join from any Notify me box and tap the email we send.",
    confirmed: "You're on the list — new paintings and events.",
    confirmFailed:
      "That link didn't work — it may be older than a week. Join again from any Notify me box.",
    goodbyeTitle: "Unsubscribed — Barbara Straka",
    goodbyeNeedsLink:
      "This page needs its link — it arrives inside every new-painting email.",
    goodbye: "You've been removed — no more emails.",
    goodbyeFailed:
      "That link didn't work — you're probably already off the list.",
  },
  /** Emails to visitors who join or leave her list, in the language
   * they read the site in. Plain text, one line per item. */
  emails: {
    confirmSubject: "Confirm your studio alerts",
    confirm: (url: string) =>
      [
        "Someone (hopefully you) asked for new paintings and events",
        "by email from Barbara Straka's studio.",
        "",
        "Confirm here:",
        url,
        "",
        "If that wasn't you, ignore this — nothing joins the list",
        "without the tap.",
      ].join("\n"),
    alreadySubject: "You're already on the studio list",
    already: [
      "Someone (hopefully you) asked to join Barbara Straka's",
      "new-painting emails, and this address is already on the list.",
      "Nothing to do — new paintings and events will keep arriving.",
      "",
      "If that wasn't you, ignore this.",
      "",
      "— Barbara",
    ].join("\n"),
    goodbyeSubject: "Removed from the new-painting list",
    goodbye: [
      "You've been removed — no more emails from the studio.",
      "Rejoin any time from any Notify me box.",
      "",
      "— Barbara",
    ].join("\n"),
  },
};

/** The shape every language file follows. */
export type Strings = typeof en;
