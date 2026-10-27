import type { Strings } from "./en";

export const es: Strings = {
  location: "Calgary, Alberta",
  meta: {
    siteTitle: "Barbara Straka — Pinturas originales",
    description:
      "Pinturas originales de naturaleza y abstractas, directo del estudio de la artista.",
  },
  layout: {
    skip: "Saltar al contenido",
    home: "Inicio — volver a la galería",
    nav: "Principal",
    collection: "Colección",
    about: "Acerca de",
    notifyMe: "Avisarme",
    privacy: "Privacidad",
    privacyNote: "sin cookies ni rastreadores",
    install: "Instalar la app de la galería",
    credits: "Créditos",
    language: "Idioma",
    readIn: "Leer este sitio en español",
    noThanks: "No, gracias",
  },
  notify: {
    close: "Cerrar avisos",
    title: "No se pierda ninguna pintura nueva",
    body: "Reciba un correo cuando se cuelgue una pintura nueva o haya un evento. Puede darse de baja cuando quiera, con un clic.",
    email: "Correo electrónico",
    join: "Unirme a la lista",
    leave: "Salir de la lista",
  },
  notifyClient: {
    badEmail: "Ese correo no parece correcto — revíselo e intente de nuevo.",
    joining: "Inscribiendo…",
    checkInbox: "Revise su bandeja de entrada — un toque basta para confirmar.",
    finishCheck:
      "Falta un paso — complete la verificación rápida de arriba e intente de nuevo.",
    failed: "No funcionó — intente de nuevo en un rato.",
    typeFirst:
      "Escriba primero la dirección y luego toque “Salir de la lista”.",
    leaving: "Saliendo…",
    left: "Listo — esa dirección ya no está en la lista.",
    copied: "Copiado.",
    copyFailed: "No se pudo copiar — mejor seleccione el texto.",
    tapToCopy: "Toque para copiar este mensaje",
  },
  home: {
    tagline: "Originales de naturaleza y abstractos, pintados a mano",
    headline: "Pinturas originales, desde el estudio",
    lede: "Originales de naturaleza y abstractos, pintados a mano y vendidos directamente desde el estudio. Lo que ve es la pintura real — y cuando se vende un original, solo quedan sus reproducciones.",
    browse: "Ver la colección",
    getNotified: "Reciba avisos de obras nuevas",
    points: [
      ["Originales y reproducciones", "pintados una vez, impresos por encargo"],
      ["Directo", "del estudio, sin comisión de galería"],
      ["Envío cuidadoso", "lo coordinamos juntos tras la compra"],
    ],
    aboutEyebrow: "Desde el estudio",
    aboutTitle: (place: string) => `Pintado en ${place}`,
    about: [
      "Barbara Straka pinta naturaleza y abstracción en su estudio de Calgary — luz de la pradera, aguas tranquilas y estudios de color que quedan en algún lugar entre el paisaje y el sentimiento. Cada obra aquí nace como un original — la mayoría también está disponible en reproducción. Cuando un original se vende, se va para siempre — aunque sus reproducciones siguen vivas.",
      "Todo aquí se vende directamente desde el estudio: el precio indicado es el precio completo, y el envío se coordina juntos después de la compra. Para preguntar por una obra, ábrala y toque <strong>¿Le interesa?</strong> — su mensaje le llega directo a la artista.",
    ],
  },
  gallery: {
    newest: "La pintura más reciente",
    ask: "Preguntar por esta obra →",
    availableLabel: "Pinturas disponibles",
    eyebrow: "La colección",
    title: "Obras disponibles",
    count: (n: number) =>
      n === 1 ? `${n} obra · única` : `${n} obras · cada una es única`,
    soldLabel: "Pinturas vendidas",
    soldEyebrow: "Coleccionadas",
    soldTitle: "Ya encontraron hogar",
    soldCount: (n: number) =>
      `${n} ${n === 1 ? "obra vendida" : "obras vendidas"}`,
    new: "Nueva",
    sold: "Vendida",
  },
  painting: {
    back: "← Volver a la colección",
    fullscreen: (title: string) => `Ver ${title} en pantalla completa`,
    tapFullscreen: "Toque para ver en pantalla completa",
    lightbox: "Pintura en pantalla completa",
    closeFullscreen: "Cerrar pantalla completa",
    eyebrow: "Pintura original · obra única",
    soldNote: "Esta obra ya encontró hogar.",
    priceOnRequest: "Precio a consultar — escriba abajo para preguntar.",
    buyNow: (price: string) => `Comprar · ${price}`,
    payNote:
      "Tarjeta, Apple Pay o Google Pay. ¿Prefiere Interac e-transfer (transferencia bancaria canadiense), sin comisiones de tarjeta? Pregunte abajo y recibirá los datos por correo.",
    interested: "¿Le interesa?",
    formTitle: "Preguntar por esta pintura",
    shipNote: "El envío se coordina con la artista después de la compra.",
    name: "Nombre",
    email: "Correo electrónico",
    message: "Mensaje",
    messagePlaceholder: "Hola, me encanta esta obra…",
    send: "Enviar consulta",
    wallTitle: "Pruébela en su pared",
    wallTouch:
      "Se muestra casi a tamaño real. Toque <strong>Ver en su pared</strong> y apunte el teléfono hacia donde la colgaría.",
    wallDesk: "Se muestra casi a tamaño real.",
    machineNote: "Título y descripción traducidos automáticamente del inglés.",
    wallScan:
      "Escanee esto con la cámara de su teléfono y luego toque <strong>Ver en su pared</strong>.",
  },
  paintingClient: {
    sending: "Enviando…",
    sent: "Gracias — su mensaje fue enviado a la artista.",
    savedOffline: "Guardado — se enviará solo cuando vuelva a tener conexión.",
    finishCheck:
      "Falta un paso — complete la verificación rápida de arriba y toque “Enviar consulta” otra vez.",
    failed:
      "No se pudo enviar — revise su correo electrónico e intente de nuevo.",
    askQuestion: "Hacer una pregunta",
    openingCheckout: "Abriendo el pago seguro…",
    checkoutUnavailable:
      "El pago no está disponible en este momento. Por favor, intente de nuevo.",
    viewOnWall: "Ver en su pared",
    share: "Compartir esta pintura",
    copyLink: "Copiar el enlace de esta pintura",
    copied: "Copiado.",
    shareFailed: "No se pudo compartir — intente de nuevo.",
    copyFailed:
      "No se pudo copiar — mantenga presionada la barra de direcciones para copiarlo.",
  },
  privacy: {
    title: "Privacidad",
    description: "Cómo esta galería maneja su información.",
    intro:
      "Esta galería la lleva una sola artista en Calgary, Alberta. Cumple con la Ley de Protección de Información Personal de Alberta (Personal Information Protection Act, PIPA).",
    collectedTitle: "Qué se recopila",
    collected: [
      [
        "Visitas:",
        "contadores anónimos por pintura (sin cookies ni huellas digitales del navegador).",
      ],
      [
        "Estadísticas generales:",
        "Cloudflare Web Analytics, que no usa cookies ni sigue a personas.",
      ],
      [
        "Consultas:",
        "el nombre, el correo y el mensaje que escribe en el formulario de una pintura — enviados por correo directamente a la artista para que pueda responderle. Nada de su consulta se guarda en el sitio.",
      ],
      [
        "Compras:",
        "los pagos con tarjeta, Apple Pay y Google Pay se hacen en la página segura de Stripe; los datos de la tarjeta nunca llegan a este sitio. Stripe nos pasa su nombre, correo, teléfono y dirección de envío para poder enviarle la pintura.",
      ],
      [
        "Avisos para compradores:",
        "la lista de correo está en nuestro servicio de envío de correos (Resend), no en la base de datos del sitio — y solo están en ella las direcciones que tocaron el correo de confirmación; nadie se une sin saberlo. Un correo por cada pintura nueva o evento; cada correo trae un enlace para darse de baja con un clic, y la ventana “Avisarme” tiene un botón “Salir de la lista”.",
      ],
      [
        "Control de spam:",
        "los formularios de compra y de correo usan Cloudflare Turnstile, que confirma discretamente que usted es una persona. Sin acertijos ni cookies de rastreo.",
      ],
    ],
    notTitle: "Qué no se recopila",
    not: "Sin cuentas, sin rastreadores publicitarios, sin seguimiento entre sitios, sin venta de información personal.",
    choicesTitle: "Sus opciones",
    choices:
      "Para dejar de recibir avisos, use el enlace para darse de baja al final de cualquiera de los correos, o salga de la lista desde el cuadro de suscripción de cualquier página. Para cualquier pregunta sobre privacidad, escriba a la artista y lo atenderá personalmente.",
  },
  credits: {
    title: "Créditos",
    description:
      "El software y las tipografías de código abierto con que está hecha esta galería, y sus licencias.",
    intro:
      "Esta galería está hecha con software y tipografías libres y de código abierto. Sus creadores piden que sus licencias los acompañen, así que aquí están, con agradecimiento.",
    licenceNote:
      "Los textos de las licencias están en inglés, tal como los escribieron sus autores.",
    uses: {
      fraunces:
        "La tipografía de los títulos y de los nombres de las pinturas.",
      caveat: "La letra manuscrita de la firma y de la nota del estudio.",
      three: "Construye el modelo 3D detrás de “Ver en su pared”.",
      modelViewer: "Muestra la pintura en su pared con realidad aumentada.",
      lit: "Incluido dentro de <model-viewer>.",
      astro:
        "Construye el sitio y hace que cada pintura crezca hasta su página.",
      zod: "Revisa los datos del estudio cuando entran.",
      qrcode: "Dibuja las tarjetas QR imprimibles del estudio.",
    },
  },
  thanks: {
    title: "Gracias",
    description: "Su pintura va en camino.",
    eyebrow: "Pago recibido",
    heading: "¡Gracias!",
    lede: "La pintura es suya. Stripe le envió el recibo por correo, y Barbara Straka le escribirá para coordinar el envío.",
    back: "Volver a la galería",
  },
  notFound: {
    title: "Página no encontrada",
    description:
      "Esta página no existe. Mejor explore la colección de pinturas originales.",
    eyebrow: "Fuera de la pared — 404",
    heading: "Esa pared está vacía.",
    body: "La página que busca no está aquí — puede que se haya movido. La colección está por aquí:",
    browse: "Ver la colección",
  },
  emailPages: {
    heading: "Avisos de pinturas nuevas",
    working: "Un momento…",
    back: "Volver a la galería",
    confirmedTitle: "Ya está en la lista",
    confirmNeedsLink:
      "Esta página necesita su enlace — únase desde cualquier ventana “Avisarme” y toque el correo que le enviamos.",
    confirmed: "Ya está en la lista — pinturas nuevas y eventos.",
    confirmFailed:
      "Ese enlace no funcionó — puede que tenga más de una semana. Vuelva a unirse desde cualquier ventana “Avisarme”.",
    goodbyeTitle: "Baja confirmada",
    goodbyeNeedsLink:
      "Esta página necesita su enlace — viene dentro de cada correo de pintura nueva.",
    goodbye: "Ya no está en la lista — no recibirá más correos.",
    goodbyeFailed:
      "Ese enlace no funcionó — probablemente ya no está en la lista.",
  },
  emails: {
    confirmSubject: "Confirme sus avisos del estudio",
    confirm: (url: string) =>
      [
        "Alguien (esperamos que usted) pidió recibir por correo",
        "las nuevas pinturas y eventos del estudio de Barbara Straka.",
        "",
        "Confirme aquí:",
        url,
        "",
        "Si no fue usted, ignore este mensaje: nadie entra en la lista",
        "sin ese toque.",
      ].join("\n"),
    alreadySubject: "Ya está en la lista del estudio",
    already: [
      "Alguien (esperamos que usted) pidió recibir los correos de nuevas pinturas",
      "de Barbara Straka, y esta dirección ya está en la lista.",
      "No tiene que hacer nada: las nuevas pinturas y eventos seguirán llegando.",
      "",
      "Si no fue usted, ignore este mensaje.",
      "",
      "— Barbara",
    ].join("\n"),
    goodbyeSubject: "Eliminado de la lista de nuevas pinturas",
    goodbye: [
      "Listo: ya no recibirá más correos del estudio.",
      "Puede volver a unirse cuando quiera desde el sitio.",
      "",
      "— Barbara",
    ].join("\n"),
  },
};
