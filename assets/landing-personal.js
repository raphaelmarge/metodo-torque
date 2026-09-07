(function () {
  "use strict";

  var root = document.documentElement;
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var storedPause = false;
  try { storedPause = sessionStorage.getItem("torqueLanding:motion") === "off"; } catch (_) {}
  var reduceMotion = motionQuery.matches || storedPause;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  root.classList.add("motion-ready");
  root.classList.toggle("motion-off", reduceMotion);

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
      title: "Ficha do mês",
      description: "A semana, os exercícios e as cargas organizados para o aluno consultar.",
      image: "assets/vendas/app-fichas.webp",
      alt: "Lista de fichas e semana atual no aplicativo do aluno"
    },
    {
      title: "Treino guiado",
      description: "Vídeo, séries, descanso e registro de cargas, um exercício por vez.",
      image: "assets/vendas/app-treino.webp",
      alt: "Treino guiado com exercício, carga e histórico da última sessão"
    },
    {
      title: "Corrida com GPS",
      description: "Mapa, ritmo e orientação por voz. O GPS depende da permissão de localização e da compatibilidade do aparelho.",
      image: "assets/vendas/app-corrida.webp",
      alt: "Corrida com distância, tempo, ritmo e calorias"
    },
    {
      title: "Conquistas",
      description: "XP, medalhas e sequência de treinos mostram a constância do aluno.",
      image: "assets/vendas/app-conquistas.webp",
      alt: "Tela de conquistas com experiência, medalhas e sequência de treinos"
    },
    {
      title: "Circuitos",
      description: "Relógio, voltas e movimentos para acompanhar o circuito e registrar o resultado.",
      image: "assets/vendas/app-wod.webp",
      alt: "Circuito com relógio, voltas e movimentos no aplicativo do aluno"
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

    if (!reduceMotion && wordHeading && wordNodes.length) {
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
    updateMobileCta();
    syncSceneFromScroll();
  }

  function requestScrollUpdate() {
    if (scrollPending) return;
    scrollPending = true;
    window.requestAnimationFrame(updateScrollEffects);
  }

  window.addEventListener("scroll", requestScrollUpdate, { passive: true });
  window.addEventListener("resize", requestScrollUpdate, { passive: true });

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
  var featureSwitch = null;
  var featureHovered = false;

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
    featureCopy.setAttribute("aria-labelledby", "featureTab" + index);
    featureButtons.forEach(function (button, buttonIndex) {
      button.setAttribute("aria-selected", buttonIndex === index ? "true" : "false");
      button.tabIndex = buttonIndex === index ? 0 : -1;
    });

    if (featureCopy) featureCopy.classList.add("is-switching");
    if (dashboard) dashboard.classList.add("is-switching");

    window.clearTimeout(featureSwitch);
    var feature = features[index];
    featureImage.src = feature.image;
    featureImage.alt = feature.alt;
    featureTag.textContent = feature.tag;
    featureTitle.textContent = feature.title;
    featureDescription.textContent = feature.description;
    featureReturn.textContent = feature.returnText;
    featureSwitch = window.setTimeout(function () {
      if (featureCopy) featureCopy.classList.remove("is-switching");
      if (dashboard) dashboard.classList.remove("is-switching");
      if (featureTimer) restartFeatureProgress();
    }, reduceMotion ? 0 : 190);

    if (userInitiated) restartFeatureTimer();
  }

  function restartFeatureTimer() {
    window.clearInterval(featureTimer);
    featureTimer = null;
    var bar = document.querySelector(".feature-progress span");
    if (bar) bar.style.animation = "none";
    if (reduceMotion || document.hidden || featureHovered ||
        featureStage.contains(document.activeElement) || root.classList.contains("dialog-open")) return;
    featureTimer = window.setInterval(function () {
      selectFeature((featureIndex + 1) % features.length, false);
    }, 7000);
    restartFeatureProgress();
  }

  featureButtons.forEach(function (button, index) {
    button.id = "featureTab" + index;
    button.tabIndex = index === 0 ? 0 : -1;
    button.setAttribute("aria-controls", "featurePanel");
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
  featureCopy.id = "featurePanel";
  featureCopy.setAttribute("role", "tabpanel");
  featureCopy.setAttribute("aria-labelledby", "featureTab0");

  if (featureStage) {
    featureStage.addEventListener("mouseenter", function () { featureHovered = true; restartFeatureTimer(); });
    featureStage.addEventListener("mouseleave", function () { featureHovered = false; restartFeatureTimer(); });
    featureStage.addEventListener("focusin", restartFeatureTimer);
    featureStage.addEventListener("focusout", function (event) {
      if (!featureStage.contains(event.relatedTarget)) restartFeatureTimer();
    });
  }

  var studentButtons = Array.prototype.slice.call(document.querySelectorAll("[data-student]"));
  var studentImage = document.getElementById("student-image");
  var studentIndex = 0;
  var studentAnimation = null;
  var studentPanel = document.querySelector(".student-phone");
  var tourNumber = document.getElementById("tourNumber");
  studentPanel.id = "studentPanel";
  studentPanel.setAttribute("role", "tabpanel");
  studentPanel.setAttribute("aria-labelledby", "tourTab0");
  studentPanel.tabIndex = 0;

  function selectStudentScreen(index) {
    var screen = studentScreens[index];
    if (!screen || !studentImage) return;
    studentIndex = index;
    studentButtons.forEach(function (button, buttonIndex) {
      button.setAttribute("aria-selected", buttonIndex === index ? "true" : "false");
      button.tabIndex = buttonIndex === index ? 0 : -1;
    });
    studentPanel.setAttribute("aria-labelledby", "tourTab" + index);
    document.getElementById("tourTitle").textContent = screen.title;
    document.getElementById("tourDescription").textContent = screen.description;
    tourNumber.textContent = String(index + 1).padStart(2, "0") + " / " + String(studentScreens.length).padStart(2, "0");
    if (studentAnimation) studentAnimation.cancel();
    studentImage.src = screen.image;
    studentImage.alt = screen.alt;
    if (!reduceMotion && studentImage.animate) {
      studentAnimation = studentImage.animate([
        { opacity: 0, transform: "translateY(12px) scale(.98)" },
        { opacity: 1, transform: "translateY(0) scale(1)" }
      ], { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" });
    }
  }

  studentButtons.forEach(function (button, index) {
    button.id = "tourTab" + index;
    button.tabIndex = index === 0 ? 0 : -1;
    button.setAttribute("aria-controls", "studentPanel");
    button.addEventListener("click", function () { selectStudentScreen(index); });
    button.addEventListener("keydown", function (event) {
      var next = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % studentButtons.length;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + studentButtons.length) % studentButtons.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = studentButtons.length - 1;
      if (next === null) return;
      event.preventDefault();
      studentButtons[next].focus();
      selectStudentScreen(next);
    });
  });

  document.getElementById("tourNext").addEventListener("click", function () {
    selectStudentScreen((studentIndex + 1) % studentScreens.length);
  });
  document.getElementById("tourPrev").addEventListener("click", function () {
    selectStudentScreen((studentIndex - 1 + studentScreens.length) % studentScreens.length);
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

  if (finePointer) {
    document.body.classList.add("has-pointer");
    window.addEventListener("pointermove", function (event) {
      if (reduceMotion) return;
      root.style.setProperty("--pointer-x", event.clientX + "px");
      root.style.setProperty("--pointer-y", event.clientY + "px");
    }, { passive: true });

    Array.prototype.slice.call(document.querySelectorAll("[data-tilt]")).forEach(function (card) {
      card.addEventListener("pointermove", function (event) {
        if (reduceMotion) return;
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
        if (reduceMotion) return;
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

  var mobileQuery = window.matchMedia("(max-width: 860px)");
  var menuButton = document.getElementById("menuToggle");
  var mainNav = document.getElementById("mainNav");
  function closeMenu(returnFocus) {
    mainNav.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Abrir menu");
    if (returnFocus) menuButton.focus({ preventScroll: true });
    updateMobileCta();
  }
  menuButton.addEventListener("click", function () {
    var open = menuButton.getAttribute("aria-expanded") !== "true";
    mainNav.classList.toggle("is-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    updateMobileCta();
  });
  mainNav.addEventListener("click", function (event) {
    if (event.target.closest("a")) closeMenu(false);
  });
  document.addEventListener("click", function (event) {
    if (!topbar.contains(event.target)) closeMenu(false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") closeMenu(true);
  });
  mobileQuery.addEventListener("change", function () { closeMenu(false); requestScrollUpdate(); });

  var sceneButtons = Array.prototype.slice.call(document.querySelectorAll("[data-scene]"));
  var stories = Array.prototype.slice.call(document.querySelectorAll(".journey-story"));
  var journeyImage = document.getElementById("journey-image");
  var journey = document.getElementById("journey");
  var sceneIndex = 0;
  var scenes = [
    { image: "assets/vendas/painel-treinos.webp", alt: "Painel do personal para planejar e revisar treinos" },
    { image: "assets/vendas/app-inicio-novo.webp", alt: "Treino do dia publicado no aplicativo do aluno" },
    { image: "assets/vendas/painel-inicio.webp", alt: "Painel do personal para acompanhar alunos e próximas sessões" }
  ];
  function selectScene(index) {
    sceneIndex = index;
    sceneButtons.forEach(function (button, i) {
      button.classList.toggle("active", i === index);
      button.setAttribute("aria-pressed", String(i === index));
      stories[i].classList.toggle("active", i === index);
    });
    journeyImage.src = scenes[index].image;
    journeyImage.alt = scenes[index].alt;
  }
  function syncSceneFromScroll() {
    if (!journey || mobileQuery.matches || root.classList.contains("dialog-open")) return;
    var rect = journey.getBoundingClientRect();
    if (rect.top > innerHeight || rect.bottom < 0) return;
    var nearest = 0;
    var distance = Infinity;
    stories.forEach(function (story, index) {
      var box = story.getBoundingClientRect();
      var current = Math.abs(box.top + box.height / 2 - innerHeight * .54);
      if (current < distance) { distance = current; nearest = index; }
    });
    if (nearest !== sceneIndex) selectScene(nearest);
  }
  sceneButtons.forEach(function (button, index) {
    button.setAttribute("aria-controls", "journey-image story" + index);
    button.addEventListener("click", function () {
      selectScene(index);
      if (!mobileQuery.matches) stories[index].scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    });
  });

  var screenDialog = document.getElementById("screenDialog");
  var screenImage = document.getElementById("screenDialogImage");
  var videoDialog = document.getElementById("videoDialog");
  var video = document.getElementById("productVideo");
  var videoHome = document.getElementById("videoHome");
  var dialogTrigger = null;
  function openDialog(dialog, trigger) {
    if (dialog.open || typeof dialog.showModal !== "function") return;
    dialogTrigger = trigger;
    dialog.showModal();
    root.classList.add("dialog-open");
    restartFeatureTimer();
    updateMobileCta();
  }
  Array.prototype.slice.call(document.querySelectorAll("[data-inspect]")).forEach(function (button) {
    button.hidden = typeof screenDialog.showModal !== "function";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", "screenDialog");
    button.addEventListener("click", function () {
      var source = document.getElementById(button.dataset.inspect);
      screenImage.src = source.src;
      screenImage.alt = source.alt;
      document.getElementById("screenImageError").hidden = true;
      openDialog(screenDialog, button);
      screenDialog.querySelector(".dialog-scroll").scrollTop = 0;
    });
  });
  screenImage.addEventListener("error", function () { document.getElementById("screenImageError").hidden = false; });
  var videoButton = document.getElementById("openVideo");
  videoButton.hidden = typeof videoDialog.showModal !== "function";
  videoButton.setAttribute("aria-haspopup", "dialog");
  videoButton.setAttribute("aria-controls", "videoDialog");
  document.getElementById("openVideo").addEventListener("click", function (event) {
    video.pause();
    document.getElementById("videoStage").appendChild(video);
    openDialog(videoDialog, event.currentTarget);
  });
  [screenDialog, videoDialog].forEach(function (dialog) {
    dialog.querySelector("[data-close-dialog]").addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("click", function (event) {
      if (event.target !== dialog) return;
      var box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    dialog.addEventListener("close", function () {
      if (dialog === videoDialog) { video.pause(); videoHome.prepend(video); }
      if (dialog === screenDialog) screenImage.removeAttribute("src");
      root.classList.remove("dialog-open");
      if (dialogTrigger) dialogTrigger.focus({ preventScroll: true });
      dialogTrigger = null;
      restartFeatureTimer();
      updateMobileCta();
    });
  });
  document.addEventListener("visibilitychange", function () { if (document.hidden) video.pause(); });
  window.addEventListener("pagehide", function () { video.pause(); window.clearInterval(featureTimer); });

  var studioName = document.getElementById("studioName");
  var studioPreview = document.getElementById("studioPreview");
  var brandPreview = document.querySelector(".brand-preview");
  var swatches = Array.prototype.slice.call(document.querySelectorAll(".swatch"));
  studioName.addEventListener("input", function () {
    studioPreview.textContent = studioName.value.trim().slice(0, 32) || "Seu nome";
  });
  swatches.forEach(function (swatch) {
    swatch.addEventListener("click", function () {
      brandPreview.style.setProperty("--brand-color", swatch.dataset.color);
      swatches.forEach(function (other) { other.setAttribute("aria-pressed", String(other === swatch)); });
    });
  });
  var studentRange = document.getElementById("studentRange");
  studentRange.addEventListener("input", function () {
    document.getElementById("studentCount").textContent = studentRange.value;
    document.getElementById("sliderCaption").textContent = "Com " + studentRange.value + " alunos, continua R$ 49/mês.";
  });

  var mobileCta = document.getElementById("mobileCta");
  var priceSection = document.getElementById("preco");
  var hero = document.querySelector(".hero");
  function updateMobileCta() {
    if (!mobileCta) return;
    var active = document.activeElement;
    var editing = active && active.matches("input, textarea, select, [contenteditable='true']");
    var priceRect = priceSection.getBoundingClientRect();
    var finalRect = finale.getBoundingClientRect();
    var show = mobileQuery.matches && hero.getBoundingClientRect().bottom < 0 &&
      !(priceRect.top < innerHeight && priceRect.bottom > 0) && finalRect.top >= innerHeight &&
      !editing && !root.classList.contains("dialog-open") && menuButton.getAttribute("aria-expanded") !== "true";
    mobileCta.setAttribute("aria-hidden", String(!show));
    mobileCta.inert = !show;
    mobileCta.querySelector("a").tabIndex = show ? 0 : -1;
    root.classList.toggle("mobile-cta-visible", show);
  }
  document.addEventListener("focusin", updateMobileCta);
  document.addEventListener("focusout", requestScrollUpdate);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", requestScrollUpdate);

  var motionButton = document.getElementById("motionToggle");
  function applyMotion() {
    reduceMotion = storedPause || motionQuery.matches;
    root.classList.toggle("motion-off", reduceMotion);
    motionButton.setAttribute("aria-pressed", String(reduceMotion));
    motionButton.textContent = motionQuery.matches ? "Animações pausadas pelo aparelho" : (reduceMotion ? "Retomar animações" : "Pausar animações");
    motionButton.disabled = motionQuery.matches;
    if (reduceMotion) {
      if (studentAnimation) studentAnimation.cancel();
      document.querySelectorAll("[data-tilt], .magnetic").forEach(function (item) { item.style.transform = ""; });
    }
    restartFeatureTimer();
    requestScrollUpdate();
  }
  motionButton.addEventListener("click", function () {
    storedPause = !storedPause;
    try { sessionStorage.setItem("torqueLanding:motion", storedPause ? "off" : "on"); } catch (_) {}
    applyMotion();
  });
  motionQuery.addEventListener("change", applyMotion);
  applyMotion();
  updateScrollEffects();

  try {
    var query = new URLSearchParams(window.location.search);
    var whatsapp = (query.get("zap") || "").replace(/\D/g, "");
    if (!/^\d{10,15}$/.test(whatsapp)) whatsapp = "5521994429198";
    if (whatsapp) {
      var message = encodeURIComponent("Oi! Quero conhecer o TORQUE PERSONAL. Como funciona?");
      Array.prototype.slice.call(document.querySelectorAll("[data-zap]")).forEach(function (link) {
        link.href = "https://wa.me/" + whatsapp + "?text=" + message;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      });
    }
  } catch (error) {
    // Mantém o link padrão quando parâmetros de URL não estão disponíveis.
  }
})();
