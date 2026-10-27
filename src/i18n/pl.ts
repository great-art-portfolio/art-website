import type { Strings } from "./en";

/** Polish plural: 1 → one, 2–4 (not 12–14) → few, everything else → many. */
const plural = (n: number, one: string, few: string, many: string) => {
  if (n === 1) return one;
  const tens = n % 100;
  const units = n % 10;
  return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many;
};

export const pl: Strings = {
  location: "Calgary, Alberta",
  meta: {
    siteTitle: "Barbara Straka — Oryginalne obrazy",
    description:
      "Oryginalne obrazy przyrody i abstrakcje, prosto z pracowni artystki.",
    paintingTitle: (title: string, sold: boolean) =>
      `${title}, Barbara Straka — ${sold ? "Sprzedany" : "Oryginalny obraz"}`,
  },
  layout: {
    skip: "Przejdź do treści",
    home: "Strona główna — powrót do galerii",
    nav: "Główne menu",
    collection: "Kolekcja",
    about: "O artystce",
    notifyMe: "Powiadamiaj mnie",
    privacy: "Prywatność",
    privacyNote: "bez ciasteczek, bez śledzenia",
    install: "Zainstaluj aplikację galerii",
    credits: "Podziękowania",
    language: "Język",
    readIn: "Czytaj tę stronę po polsku",
    noThanks: "Nie, dziękuję",
  },
  notify: {
    close: "Zamknij powiadomienia",
    title: "Nie przegap żadnego nowego obrazu",
    body: "Dostaniesz e-mail, gdy w galerii zawiśnie nowy obraz albo zbliża się wydarzenie. Wypisać się możesz w każdej chwili jednym kliknięciem.",
    email: "Adres e-mail",
    join: "Zapisz się",
    leave: "Wypisz się",
  },
  notifyClient: {
    badEmail:
      "Ten adres e-mail wygląda na niepoprawny — sprawdź go i spróbuj ponownie.",
    joining: "Zapisywanie…",
    checkInbox:
      "Sprawdź skrzynkę — jedno dotknięcie wystarczy, by potwierdzić.",
    finishCheck:
      "Jeszcze jeden krok — dokończ krótką weryfikację powyżej i spróbuj ponownie.",
    failed: "Nie udało się — spróbuj ponownie za chwilę.",
    typeFirst: "Najpierw wpisz adres, potem dotknij Wypisz się.",
    leaving: "Wypisywanie…",
    left: "Gotowe — tego adresu nie ma już na liście.",
    copied: "Skopiowano.",
    copyFailed: "Nie udało się skopiować — zaznacz tekst ręcznie.",
    tapToCopy: "Dotknij, aby skopiować tę wiadomość",
  },
  home: {
    tagline: "Oryginały — przyroda i abstrakcja, malowane ręcznie",
    headline: "Oryginalne obrazy, prosto z pracowni",
    lede: "Oryginalne obrazy przyrody i abstrakcje, malowane ręcznie i sprzedawane bezpośrednio z pracowni. To, co widzisz, to prawdziwy obraz — a gdy oryginał zostanie sprzedany, zostają już tylko jego reprodukcje.",
    browse: "Zobacz kolekcję",
    getNotified: "Powiadom mnie o nowych pracach",
    points: [
      ["Oryginały i reprodukcje", "namalowane raz, drukowane na zamówienie"],
      ["Bezpośrednio", "z pracowni, bez marży galerii"],
      ["Starannie wysyłane", "wysyłkę ustalamy wspólnie po zakupie"],
    ],
    aboutEyebrow: "Z pracowni",
    aboutTitle: (place: string) => `Malowane w ${place}`,
    about: [
      "Barbara Straka maluje przyrodę i abstrakcję w swojej pracowni w Calgary — światło prerii, spokojną wodę i studia koloru, które sytuują się gdzieś między pejzażem a uczuciem. Każda praca zaczyna się tu jako oryginał — większość jest też dostępna jako reprodukcja. Sprzedany oryginał znika na dobre — ale jego reprodukcje pozostają.",
      "Wszystko tutaj sprzedawane jest bezpośrednio z pracowni: podana cena to cena pełna, a wysyłkę ustalamy wspólnie po zakupie. Aby zapytać o pracę, otwórz ją i dotknij <strong>Interesuje Cię?</strong> — Twoja wiadomość trafi prosto do artystki.",
    ],
  },
  gallery: {
    newest: "Najnowszy obraz",
    ask: "Zapytaj o tę pracę →",
    availableLabel: "Dostępne obrazy",
    eyebrow: "Kolekcja",
    title: "Dostępne prace",
    count: (n: number) =>
      `${n} ${plural(n, "praca", "prace", "prac")} · każda jedyna w swoim rodzaju`,
    soldLabel: "Sprzedane obrazy",
    soldEyebrow: "W kolekcjach",
    soldTitle: "Znalazły swój dom",
    soldCount: (n: number) =>
      `${n} ${plural(n, "praca sprzedana", "prace sprzedane", "prac sprzedanych")}`,
    new: "Nowy",
    sold: "Sprzedany",
  },
  painting: {
    back: "← Powrót do kolekcji",
    fullscreen: (title: string) => `Zobacz „${title}” na pełnym ekranie`,
    tapFullscreen: "Dotknij, aby zobaczyć na pełnym ekranie",
    lightbox: "Obraz na pełnym ekranie",
    closeFullscreen: "Zamknij pełny ekran",
    eyebrow: "Oryginalny obraz · jedyny w swoim rodzaju",
    soldNote: "Ta praca znalazła już swój dom.",
    priceOnRequest: "Cena na zapytanie — napisz poniżej, aby ją poznać.",
    buyNow: (price: string) => `Kup teraz · ${price}`,
    payNote:
      "Karta, Apple Pay lub Google Pay. Wolisz Interac e-transfer, bez opłat za kartę? Zapytaj poniżej, a szczegóły dostaniesz e-mailem.",
    interested: "Interesuje Cię?",
    formTitle: "Zapytaj o ten obraz",
    shipNote: "Wysyłkę ustalasz z artystką po zakupie.",
    name: "Imię",
    email: "E-mail",
    message: "Wiadomość",
    messagePlaceholder: "Dzień dobry, ten obraz bardzo mi się podoba…",
    send: "Wyślij zapytanie",
    wallTitle: "Sprawdź, jak wygląda na ścianie",
    wallTouch:
      "Pokazany mniej więcej w rzeczywistym rozmiarze. Dotknij <strong>Zobacz na swojej ścianie</strong>, a potem skieruj telefon tam, gdzie miałby zawisnąć.",
    wallDesk: "Pokazany mniej więcej w rzeczywistym rozmiarze.",
    machineNote: "Tytuł i opis przetłumaczono automatycznie z angielskiego.",
    wallScan:
      "Zeskanuj ten kod aparatem telefonu, a potem dotknij <strong>Zobacz na swojej ścianie</strong>.",
  },
  paintingClient: {
    sending: "Wysyłanie…",
    sent: "Dziękujemy — Twoja wiadomość trafiła do artystki.",
    savedOffline:
      "Zapisano — wiadomość wyśle się automatycznie, gdy wrócisz do sieci.",
    finishCheck:
      "Jeszcze jeden krok — dokończ krótką weryfikację powyżej i ponownie dotknij Wyślij zapytanie.",
    failed: "Nie udało się wysłać — sprawdź adres e-mail i spróbuj ponownie.",
    askQuestion: "Zadaj pytanie",
    openingCheckout: "Otwieranie bezpiecznej płatności…",
    checkoutUnavailable: "Płatność jest teraz niedostępna. Spróbuj ponownie.",
    viewOnWall: "Zobacz na swojej ścianie",
    share: "Udostępnij ten obraz",
    copyLink: "Skopiuj link do tego obrazu",
    copied: "Skopiowano.",
    shareFailed: "Nie udało się udostępnić — spróbuj ponownie.",
    copyFailed:
      "Nie udało się skopiować — przytrzymaj pasek adresu, aby go skopiować.",
  },
  privacy: {
    title: "Prywatność",
    description: "Jak ta galeria postępuje z Twoimi danymi.",
    intro:
      "Tę galerię prowadzi jedna artystka z Calgary w Albercie. Galeria przestrzega albertańskiej ustawy o ochronie danych osobowych (PIPA).",
    collectedTitle: "Co zbieramy",
    collected: [
      [
        "Wyświetlenia stron:",
        "anonimowe liczniki dla każdego obrazu (bez ciasteczek, bez fingerprintingu).",
      ],
      [
        "Zbiorcze statystyki:",
        "Cloudflare Web Analytics, które nie zapisuje ciasteczek i nie śledzi pojedynczych osób.",
      ],
      [
        "Zapytania:",
        "imię, adres e-mail i wiadomość wpisane w formularzu przy obrazie — wysyłane e-mailem prosto do artystki, żeby mogła odpowiedzieć. Nic z Twojego zapytania nie jest przechowywane na stronie.",
      ],
      [
        "Zakupy:",
        "płatności kartą, Apple Pay i Google Pay odbywają się na bezpiecznej stronie Stripe; dane karty nigdy nie trafiają na tę stronę. Stripe przekazuje Twoje imię i nazwisko, e-mail, telefon i adres wysyłki, żeby obraz mógł do Ciebie dotrzeć.",
      ],
      [
        "Powiadomienia dla kupujących:",
        "lista mailingowa jest przechowywana u naszego dostawcy poczty (Resend), a nie w bazie danych strony — i są na niej tylko adresy, które potwierdziły zapis w e-mailu; nikt nie trafia na nią po cichu. Jeden e-mail na każdy nowy obraz lub wydarzenie; każdy zawiera link do wypisania się jednym kliknięciem, a okienko Powiadamiaj mnie ma przycisk Wypisz się.",
      ],
      [
        "Ochrona przed spamem:",
        "formularze zakupu i zapisu używają Cloudflare Turnstile, które dyskretnie sprawdza, czy jesteś człowiekiem. Bez łamigłówek, bez śledzących ciasteczek.",
      ],
    ],
    notTitle: "Czego nie zbieramy",
    not: "Żadnych kont, żadnych reklamowych narzędzi śledzących, żadnego śledzenia między stronami, żadnej sprzedaży danych osobowych.",
    choicesTitle: "Twoje wybory",
    choices:
      "Aby przestać otrzymywać powiadomienia, użyj linku do wypisania się na dole dowolnego e-maila albo opuść listę w okienku zapisu na dowolnej stronie. W sprawie prywatności napisz do artystki — zajmie się tym osobiście.",
  },
  credits: {
    title: "Podziękowania",
    description:
      "Otwarte oprogramowanie i fonty, z których zbudowano tę galerię, oraz ich licencje.",
    intro:
      "Ta galeria powstała dzięki wolnemu, otwartemu oprogramowaniu i fontom. Ich twórcy proszą, by licencje zawsze im towarzyszyły — oto one, z podziękowaniem.",
    licenceNote:
      "Teksty licencji są po angielsku, tak jak napisali je ich autorzy.",
    uses: {
      fraunces: "Krój pisma nagłówków i tytułów obrazów.",
      caveat: "Odręczne pismo w podpisie i w liściku z pracowni.",
      three: "Buduje model 3D stojący za „Zobacz na swojej ścianie”.",
      modelViewer:
        "Pokazuje obraz na Twojej ścianie w rozszerzonej rzeczywistości.",
      lit: "Dołączony wewnątrz <model-viewer>.",
      astro:
        "Buduje stronę i sprawia, że każdy obraz rozrasta się w swoją własną stronę.",
      zod: "Sprawdza dane pracowni, zanim zostaną przyjęte.",
      qrcode: "Rysuje karty z kodami QR do wydruku.",
    },
  },
  thanks: {
    title: "Dziękujemy",
    description: "Twój obraz jest już w drodze.",
    eyebrow: "Płatność otrzymana",
    heading: "Dziękujemy!",
    lede: "Obraz jest Twój. Stripe wysłał Ci potwierdzenie e-mailem, a Barbara Straka skontaktuje się z Tobą mailowo w sprawie wysyłki.",
    back: "Powrót do galerii",
  },
  notFound: {
    title: "Nie znaleziono — Barbara Straka, oryginalne obrazy",
    description:
      "Ta strona nie istnieje. Zobacz zamiast tego kolekcję oryginalnych obrazów.",
    eyebrow: "Pusta ściana — 404",
    heading: "Ta ściana jest pusta.",
    body: "Strony, której szukasz, tu nie ma — mogła zostać przeniesiona. Kolekcja jest tędy:",
    browse: "Zobacz kolekcję",
  },
  emailPages: {
    heading: "Powiadomienia o nowych obrazach",
    working: "Chwileczkę…",
    back: "Powrót do galerii",
    confirmedTitle: "Jesteś na liście — Barbara Straka",
    confirmNeedsLink:
      "Ta strona działa tylko z linku — zapisz się w dowolnym okienku Powiadamiaj mnie i dotknij linku w e-mailu, który wyślemy.",
    confirmed: "Jesteś na liście — nowe obrazy i wydarzenia.",
    confirmFailed:
      "Ten link nie zadziałał — może być starszy niż tydzień. Zapisz się ponownie w dowolnym okienku Powiadamiaj mnie.",
    goodbyeTitle: "Wypisano — Barbara Straka",
    goodbyeNeedsLink:
      "Ta strona działa tylko z linku — znajdziesz go w każdym e-mailu o nowym obrazie.",
    goodbye: "Adres usunięty — koniec z e-mailami.",
    goodbyeFailed:
      "Ten link nie zadziałał — prawdopodobnie nie ma Cię już na liście.",
  },
  emails: {
    confirmSubject: "Potwierdź powiadomienia z pracowni",
    confirm: (url: string) =>
      [
        "Ktoś (mamy nadzieję, że Ty) poprosił o e-maile o nowych obrazach",
        "i wydarzeniach z pracowni artystki Barbara Straka.",
        "",
        "Potwierdź tutaj:",
        url,
        "",
        "Jeśli to nie Ty, zignoruj tę wiadomość — bez kliknięcia",
        "nikt nie trafi na listę.",
      ].join("\n"),
    alreadySubject: "Jesteś już na liście pracowni",
    already: [
      "Ktoś (mamy nadzieję, że Ty) poprosił o e-maile o nowych obrazach",
      "artystki Barbara Straka, a ten adres jest już na liście.",
      "Nic nie musisz robić — nowe obrazy i wydarzenia będą nadal przychodzić.",
      "",
      "Jeśli to nie Ty, zignoruj tę wiadomość.",
      "",
      "— Barbara",
    ].join("\n"),
    goodbyeSubject: "Usunięto z listy nowych obrazów",
    goodbye: [
      "Gotowe — nie dostaniesz już e-maili z pracowni.",
      "Możesz zapisać się ponownie w każdej chwili na stronie.",
      "",
      "— Barbara",
    ].join("\n"),
  },
};
