import type { Strings } from "./en";

export const pt: Strings = {
  location: "Calgary, Alberta",
  meta: {
    siteTitle: "Barbara Straka — Pinturas originais",
    description:
      "Pinturas originais de natureza e abstratas, direto do ateliê da artista.",
  },
  layout: {
    skip: "Pular para o conteúdo",
    home: "Início — voltar à galeria",
    nav: "Principal",
    collection: "Coleção",
    about: "Sobre",
    notifyMe: "Avise-me",
    privacy: "Privacidade",
    privacyNote: "sem cookies, sem rastreadores",
    install: "Instalar o app da galeria",
    credits: "Créditos",
    language: "Idioma",
    readIn: "Ler este site em português",
    noThanks: "Agora não",
  },
  notify: {
    close: "Fechar avisos",
    title: "Não perca nenhuma pintura nova",
    body: "Receba um e-mail quando uma pintura nova for pendurada ou houver um evento. Cancele quando quiser, com um clique.",
    email: "Endereço de e-mail",
    join: "Entrar na lista",
    leave: "Sair da lista",
  },
  notifyClient: {
    badEmail: "Esse e-mail não parece certo — confira e tente de novo.",
    joining: "Entrando…",
    checkInbox: "Confira sua caixa de entrada — um toque confirma.",
    finishCheck:
      "Falta só um passo — conclua a verificação rápida acima e tente de novo.",
    failed: "Não deu certo — tente de novo daqui a pouco.",
    typeFirst: "Digite o endereço primeiro e depois toque em “Sair da lista”.",
    leaving: "Saindo…",
    left: "Pronto — esse endereço saiu da lista.",
    copied: "Copiado.",
    copyFailed: "Não deu para copiar — selecione o texto.",
    tapToCopy: "Toque para copiar esta mensagem",
  },
  home: {
    tagline: "Originais de natureza e abstratos, pintados à mão",
    headline: "Pinturas originais, direto do ateliê",
    lede: "Originais de natureza e abstratos, pintados à mão e vendidos direto do ateliê. O que você vê é a pintura de verdade — e, quando um original é vendido, ficam só as reproduções.",
    browse: "Ver a coleção",
    getNotified: "Receba avisos de obras novas",
    points: [
      ["Originais e reproduções", "pintados uma vez, impressos sob encomenda"],
      ["Direto", "do ateliê, sem comissão de galeria"],
      ["Enviado com cuidado", "combinado junto após a compra"],
    ],
    aboutEyebrow: "Do ateliê",
    aboutTitle: (place: string) => `Pintado em ${place}`,
    about: [
      "Barbara Straka pinta natureza e abstração em seu ateliê em Calgary — a luz das pradarias, águas tranquilas e estudos de cor que ficam em algum lugar entre a paisagem e o sentimento. Cada obra aqui nasce como original — a maioria também está disponível em reprodução. Quando um original é vendido, ele se vai para sempre — mas suas reproduções continuam.",
      "Tudo aqui é vendido direto do ateliê: o preço anunciado é o preço total, e o envio é combinado junto após a compra. Para perguntar sobre uma obra, abra-a e toque em <strong>Tem interesse?</strong> — sua mensagem vai direto para a artista.",
    ],
  },
  gallery: {
    newest: "Pintura mais recente",
    ask: "Perguntar sobre esta obra →",
    availableLabel: "Pinturas disponíveis",
    eyebrow: "A coleção",
    title: "Obras disponíveis",
    count: (n: number) =>
      n === 1 ? `${n} obra · peça única` : `${n} obras · cada uma é única`,
    soldLabel: "Pinturas vendidas",
    soldEyebrow: "Colecionadas",
    soldTitle: "Encontraram um lar",
    soldCount: (n: number) =>
      `${n} ${n === 1 ? "obra vendida" : "obras vendidas"}`,
    new: "Nova",
    sold: "Vendida",
  },
  painting: {
    back: "← Voltar à coleção",
    fullscreen: (title: string) => `Ver ${title} em tela cheia`,
    tapFullscreen: "Toque para ver em tela cheia",
    lightbox: "Pintura em tela cheia",
    closeFullscreen: "Fechar tela cheia",
    eyebrow: "Pintura original · peça única",
    soldNote: "Esta obra encontrou um lar.",
    priceOnRequest:
      "Preço sob consulta — mande uma mensagem abaixo para perguntar.",
    buyNow: (price: string) => `Comprar · ${price}`,
    payNote:
      "Cartão, Apple Pay ou Google Pay. Prefere Interac e-transfer (transferência bancária canadense), sem taxas de cartão? Pergunte abaixo e você receberá os detalhes por e-mail.",
    interested: "Tem interesse?",
    formTitle: "Perguntar sobre esta pintura",
    shipNote: "Envio combinado com a artista após a compra.",
    name: "Nome",
    email: "E-mail",
    message: "Mensagem",
    messagePlaceholder: "Olá, adorei esta obra…",
    send: "Enviar mensagem",
    wallTitle: "Experimente na sua parede",
    wallTouch:
      "Mostrada em tamanho quase real. Toque em <strong>Ver na sua parede</strong> e aponte o celular para onde ela ficaria pendurada.",
    wallDesk: "Mostrada em tamanho quase real.",
    machineNote: "Título e descrição traduzidos automaticamente do inglês.",
    wallScan:
      "Escaneie isto com a câmera do celular e depois toque em <strong>Ver na sua parede</strong>.",
  },
  paintingClient: {
    sending: "Enviando…",
    sent: "Obrigado — sua mensagem foi enviada para a artista.",
    savedOffline:
      "Salvo — será enviado automaticamente quando você voltar a ficar on-line.",
    finishCheck:
      "Falta só um passo — conclua a verificação rápida acima e toque em “Enviar mensagem” de novo.",
    failed: "Não foi possível enviar — confira seu e-mail e tente de novo.",
    askQuestion: "Fazer uma pergunta",
    openingCheckout: "Abrindo o pagamento seguro…",
    checkoutUnavailable:
      "O pagamento não está disponível agora. Por favor, tente de novo.",
    viewOnWall: "Ver na sua parede",
    share: "Compartilhar esta pintura",
    copyLink: "Copiar o link desta pintura",
    copied: "Copiado.",
    shareFailed: "Não deu para compartilhar — tente de novo.",
    copyFailed:
      "Não deu para copiar — mantenha pressionada a barra de endereço para copiar.",
  },
  privacy: {
    title: "Privacidade",
    description: "Como esta galeria trata suas informações.",
    intro:
      "Esta galeria é mantida por uma única artista em Calgary, Alberta. Ela segue a Lei de Proteção de Informações Pessoais de Alberta (Personal Information Protection Act, PIPA).",
    collectedTitle: "O que é coletado",
    collected: [
      [
        "Visualizações:",
        "contadores anônimos por pintura (sem cookies, sem impressão digital do navegador).",
      ],
      [
        "Estatísticas gerais:",
        "Cloudflare Web Analytics, que não usa cookies nem rastreia pessoas.",
      ],
      [
        "Perguntas:",
        "o nome, o e-mail e a mensagem que você digita no formulário de uma pintura — enviados por e-mail direto para a artista, para que ela possa responder. Nada da sua pergunta fica guardado no site.",
      ],
      [
        "Compras:",
        "pagamentos com cartão, Apple Pay e Google Pay acontecem na página segura da Stripe; os dados do cartão nunca chegam a este site. A Stripe repassa seu nome, e-mail, telefone e endereço de entrega para que a pintura possa ser enviada a você.",
      ],
      [
        "Avisos para compradores:",
        "a lista de e-mails fica com nosso serviço de envio (Resend), não no banco de dados do site — e só estão nela os endereços que tocaram no e-mail de confirmação; ninguém entra sem saber. Um e-mail por pintura nova ou evento; todo e-mail traz um link para sair com um clique, e a caixa “Avise-me” tem um botão “Sair da lista”.",
      ],
      [
        "Proteção contra spam:",
        "os formulários de compra e de e-mail usam o Cloudflare Turnstile, que confirma discretamente que você é humano. Sem quebra-cabeças, sem cookies de rastreamento.",
      ],
    ],
    notTitle: "O que não é coletado",
    not: "Sem contas, sem rastreadores de publicidade, sem rastreamento entre sites, sem venda de informações pessoais.",
    choicesTitle: "Suas escolhas",
    choices:
      "Para deixar de receber os avisos, use o link de cancelamento no fim de qualquer e-mail, ou saia da lista pela caixa de inscrição em qualquer página. Para qualquer dúvida sobre privacidade, escreva para a artista, que vai responder pessoalmente.",
  },
  credits: {
    title: "Créditos",
    description:
      "Os softwares e as fontes de código aberto usados nesta galeria, e suas licenças.",
    intro:
      "Esta galeria é feita com softwares e fontes livres e de código aberto. Seus criadores pedem que as licenças os acompanhem, então aqui estão elas, com gratidão.",
    licenceNote:
      "Os textos das licenças estão em inglês, como seus autores os escreveram.",
    uses: {
      fraunces: "A fonte dos títulos e dos nomes das pinturas.",
      caveat: "A letra manuscrita da assinatura e do bilhete do ateliê.",
      three: "Cria o modelo 3D por trás de “Ver na sua parede”.",
      modelViewer: "Mostra a pintura na sua parede em realidade aumentada.",
      lit: "Incluído dentro do <model-viewer>.",
      astro: "Constrói o site e faz cada pintura crescer até virar sua página.",
      zod: "Confere os dados do ateliê na entrada.",
      qrcode: "Desenha os cartões QR do ateliê, prontos para imprimir.",
    },
  },
  thanks: {
    title: "Obrigado",
    description: "Sua pintura está a caminho.",
    eyebrow: "Pagamento recebido",
    heading: "Obrigado!",
    lede: "A pintura é sua. A Stripe enviou o recibo por e-mail, e Barbara Straka vai entrar em contato por e-mail sobre o envio.",
    back: "Voltar à galeria",
  },
  notFound: {
    title: "Página não encontrada",
    description:
      "Esta página não existe. Veja a coleção de pinturas originais.",
    eyebrow: "Fora da parede — 404",
    heading: "Essa parede está vazia.",
    body: "A página que você procura não está aqui — talvez tenha mudado de lugar. A coleção fica por aqui:",
    browse: "Ver a coleção",
  },
  emailPages: {
    heading: "Avisos de pinturas novas",
    working: "Só um instante…",
    back: "Voltar à galeria",
    confirmedTitle: "Você está na lista",
    confirmNeedsLink:
      "Esta página precisa do link dela — entre pela caixa “Avise-me” e toque no e-mail que enviarmos.",
    confirmed: "Você está na lista — pinturas novas e eventos.",
    confirmFailed:
      "Esse link não funcionou — talvez tenha mais de uma semana. Entre de novo pela caixa “Avise-me”.",
    goodbyeTitle: "Inscrição cancelada",
    goodbyeNeedsLink:
      "Esta página precisa do link dela — ele vem em todo e-mail de pintura nova.",
    goodbye: "Você saiu da lista — não vai receber mais e-mails.",
    goodbyeFailed:
      "Esse link não funcionou — você provavelmente já saiu da lista.",
  },
  emails: {
    confirmSubject: "Confirme seus avisos do ateliê",
    confirm: (url: string) =>
      [
        "Alguém (esperamos que você) pediu para receber por e-mail",
        "as novas pinturas e eventos do ateliê de Barbara Straka.",
        "",
        "Confirme aqui:",
        url,
        "",
        "Se não foi você, ignore esta mensagem — ninguém entra na lista",
        "sem esse toque.",
      ].join("\n"),
    alreadySubject: "Você já está na lista do ateliê",
    already: [
      "Alguém (esperamos que você) pediu para receber os e-mails de novas pinturas",
      "de Barbara Straka, e este endereço já está na lista.",
      "Não precisa fazer nada — as novas pinturas e eventos continuarão chegando.",
      "",
      "Se não foi você, ignore esta mensagem.",
      "",
      "— Barbara",
    ].join("\n"),
    goodbyeSubject: "Removido da lista de novas pinturas",
    goodbye: [
      "Pronto — você não receberá mais e-mails do ateliê.",
      "Você pode voltar quando quiser pelo site.",
      "",
      "— Barbara",
    ].join("\n"),
  },
};
