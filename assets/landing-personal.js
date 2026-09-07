(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  root.classList.add("motion-ready");

  var features = [
    {
      tag: "Seu dia",
      title: "Abra. Resolva. Treine.",
      description: "O painel mostra quem cobrar, quem chamar e qual é a próxima sessão — com a ação certa ao lado.",
      returnText: "A lista mental que você carrega o dia inteiro.",
      image: "assets/vendas/painel-inicio.webp",
      alt: "Painel inicial com a próxima sessão e a lista Resolver hoje"
    },
    {
      tag: "Produto",
      title: "Treino em minutos, não em noites.",
      description: "Monte fichas com vídeos, progressão, circuito e corrida. A IA propõe o mês obedecendo às regras que você definiu para cada aluno.",
      returnText: "A noite de domingo montando ficha.",
      image: "assets/vendas/painel-treinos.webp",
      alt: "Tela de montagem de treino com fichas e opção de gerar com IA"
    },
    {
      tag: "Financeiro",
      title: "Cobrança sem caça ao recibo.",
      description: "Atrasados aparecem no topo, com link, Pix e baixa na própria linha. O pagamento entra direto na sua conta.",
      returnText: "A planilha e a conversa constrangedora.",
      image: "assets/vendas/painel-financeiro.webp",
      alt: "Painel financeiro com recebido do mês e lista de pagamentos atrasados"
    },
    {
      tag: "Alunos",
      title: "Perceba antes que ele suma.",
      description: "Os filtros Ativos, Sumindo e Devendo deixam claro quem precisa de contato antes de virar cancelamento.",
      returnText: "O aluno que você só percebeu tarde demais.",
      image: "assets/vendas/painel-alunos.webp",
      alt: "Lista de alunos com filtros Ativos, Sumindo e Devendo"
    },
    {
      tag: "Atendimento",
      title: "Uma conversa que não se perde.",
      description: "Chat dentro do app, respostas rápidas e lembretes no celular do aluno. Tudo ligado à ficha dele.",
      returnText: "As vinte respostas para a mesma pergunta.",
      image: "assets/vendas/painel-chat.webp",
      alt: "Chat com aluno e atalhos de respostas rápidas"
    },
    {
      tag: "Avaliação",
      title: "Resultado que o aluno enxerga.",
      description: "Compare medições, composição corporal e evolução. O histórico fica organizado e o laudo sai pronto para compartilhar.",
      returnText: "Digitar medidas e montar laudo à mão.",
      image: "assets/vendas/painel-avaliacao.webp",
      alt: "Histórico de avaliação física com comparação entre medições"
    },
    {
      tag: "Agenda",
      title: "A sessão se resolve na linha.",
      description: "Confirme pedidos, registre faltas e leve os horários para o calendário do celular sem o vai-e-vem de mensagens.",
      returnText: "A remarcação que atravessa o seu dia.",
      image: "assets/vendas/painel-agenda.webp",
      alt: "Agenda com pedidos de horário e ações de cada sessão"
    }
  ];

  var studentScreens = [
    {
      image: "assets/vendas/app-fichas.webp",
      alt: "Lista de fichas e semana atual no aplicativo do aluno"
    },
    {
      image: "assets/vendas/app-treino.webp",
      alt: "Treino guiado com exercício, carga e histórico da última sessão"
    },
    {
      image: "assets/vendas/app-corrida.webp",
      alt: "Corrida com distância, tempo, ritmo e calorias"
    },
    {
      image: "assets/vendas/app-conquistas.webp",
      alt: "Tela de conquistas com experiência, medalhas e sequência de treinos"
    }
  ];

  function ready() {
    window.requestAnimationFrame(function () {
      root.classList.add("is-ready");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready, { once: true });
  } else {
    ready();
  }

  var revealItems = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach(function (item) { item.classList.add("is-visible"); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: .14, rootMargin: "0px 0px -5%" });

    revealItems.forEach(function (item, index) {
      item.style.transitionDelay = Math.min(index % 3, 2) * 70 + "ms";
      revealObserver.observe(item);
    });
  }

  var wordHeading = document.querySelector(".word-reveal");
  var wordNodes = [];
  if (wordHeading) {
    var words = wordHeading.textContent.trim().split(/\s+/);
    wordHeading.textContent = "";
    words.forEach(function (word) {
      var span = document.createElement("span");
      span.className = "word";
      span.textContent = word;
      wordHeading.appendChild(span);
      wordHeading.appendChild(document.createTextNode(" "));
      wordNodes.push(span);
    });
  }

  var scrollPending = false;
  var topbar = document.querySelector(".topbar");
  var progress = document.querySelector(".scroll-progress span");
  var studentPhoto = document.querySelector(".student-photo");
  var finale = document.querySelector(".finale");

  function updateScrollEffects() {
    scrollPending = false;
    var scrollY = window.scrollY || window.pageYOffset;
    var docHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    var ratio = Math.min(1, Math.max(0, scrollY / docHeight));

    root.style.setProperty("--scroll-y", String(scrollY));
    if (progress) progress.style.transform = "scaleX(" + ratio + ")";
    if (topbar) topbar.classList.toggle("is-scrolled", scrollY > 48);

    if (wordHeading && wordNodes.length) {
      var wordRect = wordHeading.getBoundingClientRect();
      var wordProgress = Math.min(1, Math.max(0, (window.innerHeight * .83 - wordRect.top) / (wordRect.height + window.innerHeight * .25)));
      wordNodes.forEach(function (word, index) {
        var start = index / wordNodes.length * .82;
        var local = Math.min(1, Math.max(0, (wordProgress - start) / .18));
        word.style.setProperty("--word-opacity", (.18 + local * .82).toFixed(3));
      });
    }

    if (!reduceMotion && studentPhoto) {
      var studentRect = studentPhoto.getBoundingClientRect();
      var studentShift = Math.max(-24, Math.min(24, (studentRect.top - window.innerHeight * .5) * -.025));
      root.style.setProperty("--student-shift", studentShift.toFixed(2));
    }

    if (!reduceMotion && finale) {
      var finalRect = finale.getBoundingClientRect();
      var finalShift = Math.max(-70, Math.min(0, (finalRect.top - window.innerHeight) * .055));
      root.style.setProperty("--final-shift", finalShift.toFixed(2));
    }
  }

  function requestScrollUpdate() {
    if (scrollPending) return;
    scrollPending = true;
    window.requestAnimationFrame(updateScrollEffects);
  }

  window.addEventListener("scroll", requestScrollUpdate, { passive: true });
  window.addEventListener("resize", requestScrollUpdate, { passive: true });
  updateScrollEffects();

  var featureButtons = Array.prototype.slice.call(document.querySelectorAll("[data-feature]"));
  var featureImage = document.getElementById("feature-image");
  var featureTag = document.getElementById("feature-tag");
  var featureTitle = document.getElementById("feature-title");
  var featureDescription = document.getElementById("feature-description");
  var featureReturn = document.getElementById("feature-return");
  var featureCopy = document.querySelector(".feature-copy");
  var dashboard = document.querySelector(".dashboard-device");
  var featureStage = document.querySelector(".system-stage");
  var featureIndex = 0;
  var featureTimer = null;

  function restartFeatureProgress() {
    var bar = document.querySelector(".feature-progress span");
    if (!bar || reduceMotion) return;
    bar.style.animation = "none";
    void bar.offsetWidth;
    bar.style.animation = "feature-time 7s linear";
  }

  function selectFeature(index, userInitiated) {
    if (!features[index]) return;
    featureIndex = index;
    featureButtons.forEach(function (button, buttonIndex) {
      button.setAttribute("aria-selected", buttonIndex === index ? "true" : "false");
      button.tabIndex = buttonIndex === index ? 0 : -1;
    });

    if (featureCopy) featureCopy.classList.add("is-switching");
    if (dashboard) dashboard.classList.add("is-switching");

    window.setTimeout(function () {
      var feature = features[index];
      featureImage.src = feature.image;
      featureImage.alt = feature.alt;
      featureTag.textContent = feature.tag;
      featureTitle.textContent = feature.title;
      featureDescription.textContent = feature.description;
      featureReturn.textContent = feature.returnText;
      if (featureCopy) featureCopy.classList.remove("is-switching");
      if (dashboard) dashboard.classList.remove("is-switching");
      restartFeatureProgress();
    }, reduceMotion ? 0 : 190);

    if (userInitiated) restartFeatureTimer();
  }

  function restartFeatureTimer() {
    window.clearInterval(featureTimer);
    if (reduceMotion || document.hidden) return;
    featureTimer = window.setInterval(function () {
      selectFeature((featureIndex + 1) % features.length, false);
    }, 7000);
  }

  featureButtons.forEach(function (button, index) {
    button.addEventListener("click", function () { selectFeature(index, true); });
    button.addEventListener("keydown", function (event) {
      var next = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % featureButtons.length;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + featureButtons.length) % featureButtons.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = featureButtons.length - 1;
      if (next === null) return;
      event.preventDefault();
      featureButtons[next].focus();
      selectFeature(next, true);
    });
  });

  if (featureStage) {
    featureStage.addEventListener("mouseenter", function () { window.clearInterval(featureTimer); });
    featureStage.addEventListener("mouseleave", restartFeatureTimer);
    featureStage.addEventListener("focusin", function () { window.clearInterval(featureTimer); });
    featureStage.addEventListener("focusout", function (event) {
      if (!featureStage.contains(event.relatedTarget)) restartFeatureTimer();
    });
  }
  restartFeatureTimer();

  var studentButtons = Array.prototype.slice.call(document.querySelectorAll("[data-student]"));
  var studentImage = document.getElementById("student-image");

  function selectStudentScreen(index) {
    var screen = studentScreens[index];
    if (!screen || !studentImage) return;
    studentButtons.forEach(function (button, buttonIndex) {
      button.setAttribute("aria-selected", buttonIndex === index ? "true" : "false");
      button.tabIndex = buttonIndex === index ? 0 : -1;
    });
    studentImage.animate([
      { opacity: 1, transform: "translateY(0) scale(1)" },
      { opacity: 0, transform: "translateY(10px) scale(.98)" }
    ], { duration: reduceMotion ? 1 : 180, easing: "ease", fill: "forwards" }).finished.then(function () {
      studentImage.src = screen.image;
      studentImage.alt = screen.alt;
      studentImage.animate([
        { opacity: 0, transform: "translateY(12px) scale(.98)" },
        { opacity: 1, transform: "translateY(0) scale(1)" }
      ], { duration: reduceMotion ? 1 : 420, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });
    });
  }

  studentButtons.forEach(function (button, index) {
    button.addEventListener("click", function () { selectStudentScreen(index); });
    button.addEventListener("keydown", function (event) {
      var next = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % studentButtons.length;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + studentButtons.length) % studentButtons.length;
      if (next === null) return;
      event.preventDefault();
      studentButtons[next].focus();
      selectStudentScreen(next);
    });
  });

  document.addEventListener("visibilitychange", restartFeatureTimer);

  var details = Array.prototype.slice.call(document.querySelectorAll(".faq details"));
  details.forEach(function (detail) {
    detail.addEventListener("toggle", function () {
      if (!detail.open) return;
      details.forEach(function (other) {
        if (other !== detail) other.open = false;
      });
    });
  });

  if (finePointer && !reduceMotion) {
    document.body.classList.add("has-pointer");
    window.addEventListener("pointermove", function (event) {
      root.style.setProperty("--pointer-x", event.clientX + "px");
      root.style.setProperty("--pointer-y", event.clientY + "px");
    }, { passive: true });

    Array.prototype.slice.call(document.querySelectorAll("[data-tilt]")).forEach(function (card) {
      card.addEventListener("pointermove", function (event) {
        var rect = card.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width - .5;
        var y = (event.clientY - rect.top) / rect.height - .5;
        card.style.transform = "perspective(1100px) rotateX(" + (-y * 5).toFixed(2) + "deg) rotateY(" + (x * 7).toFixed(2) + "deg)";
      });
      card.addEventListener("pointerleave", function () {
        card.style.transform = "";
      });
    });

    Array.prototype.slice.call(document.querySelectorAll(".magnetic")).forEach(function (button) {
      button.addEventListener("pointermove", function (event) {
        var rect = button.getBoundingClientRect();
        var x = (event.clientX - rect.left - rect.width / 2) * .13;
        var y = (event.clientY - rect.top - rect.height / 2) * .16;
        button.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0)";
      });
      button.addEventListener("pointerleave", function () {
        button.style.transform = "";
      });
    });
  }

  try {
    var query = new URLSearchParams(window.location.search);
    var whatsapp = (query.get("zap") || "5521994429198").replace(/\D/g, "");
    if (whatsapp) {
      var message = encodeURIComponent("Oi! Quero conhecer o TORQUE PERSONAL. Como funciona?");
      Array.prototype.slice.call(document.querySelectorAll("[data-zap]")).forEach(function (link) {
        link.href = "https://wa.me/" + whatsapp + "?text=" + message;
        link.target = "_blank";
        link.rel = "noopener";
      });
    }
  } catch (error) {
    // Mantém o link padrão quando parâmetros de URL não estão disponíveis.
  }
})();
