# Frame packet: 02-empresa

## Project inputs

- Project: /home/user/metodo-torque/videos/torque-personal-promo
- Design tokens: /home/user/metodo-torque/videos/torque-personal-promo/frame.md
- RULES_DIR: /home/user/metodo-torque/.agents/skills/hyperframes-animation/rules

## Assigned storyboard block

## Frame 2 — Empresa de uma pessoa só

- scene: "Você é uma empresa de uma pessoa só" e os cargos empilhando ao redor até sufocar
- voiceover: ""
- duration: 6s
- transition_in: cut
- status: outline
- src: compositions/frames/02-empresa.html
- type: pain_point
- persuasion: Pain validation
- beat: reconhecimento
- blueprint: overwhelm-surround

Linha central fixa: "Você não é só um personal." → "Você é uma EMPRESA de uma pessoa só." Ao redor, chips de cargos entram um a um e se acumulam apertando o centro: "montar ficha de madrugada" · "cobrar aluno atrasado" · "remarcar no WhatsApp" · "qual meu treino hoje?" · "fechar o mês na planilha" · "lembrar quem sumiu". Claustrofobia tipográfica, sem avatar.

- blueprint: overwhelm-surround (Adapt)

Adapt: mantém a assinatura (acúmulo que cerca e aperta o centro) sem avatar — o centro é a LINHA, e os cargos são chips de texto.
Scene 1 (0.0–1.6s): linha central per-word staggered reveal: "Você não é só um personal." — Centered, camada única, calma antes da pilha.
Scene 2 (1.6–2.8s): hard-cut na linha: "Você é uma EMPRESA de uma pessoa só." EMPRESA em violeta, spring-pop na palavra.
Scene 3 (2.8–5.2s): chips de cargo entram um por beat das bordas (cluster invertido: de fora pra dentro), acumulando em 3 camadas de profundidade ao redor da linha, cada um com press-release-spring: "montar ficha de madrugada" · "cobrar aluno atrasado" · "remarcar no WhatsApp" · "qual meu treino hoje?" · "fechar o mês na planilha" · "lembrar quem sumiu" — density crescente, o centro fica APERTADO (assinatura). Leve depth-of-field/selective-blur nos chips mais antigos.
Scene 4 (5.2–6.0s): tudo segura 0.8s cheio — o desconforto é o beat.

## Selected blueprint: overwhelm-surround

# overwhelm-surround — Overwhelm / Close-In

**intent**: Convey overwhelm by accumulation. Recognizable subjects assemble, density markers scatter in to amplify "look how much," then the central subject morphs into the viewer's own avatar and elements close in from ALL sides — the frame feels surrounded, not zoomed-into. The emotional arc is recognition → claustrophobia.

**roles served**

- Problem (from `problem-mockup-overwhelm`): when the problem beat must first show "too many tools / too much surface area" and then put **the viewer inside it** — a literal swap of subject (product → person) followed by a closing-in that feels invasive. Reach for it when the pain is "you're buried," not "this metric is bad" (that's `dataviz-countup`).
- Problem (from `desktop-clutter-accumulation`): when the overwhelm is a **workspace**, not a tool
  count — live windows, stickies, and alert toasts pile up until the frame is chaotically full, and
  the beat resolves not by closing in but by shoving the clutter aside and asking the question.
  Reach for this variant when the pain lands on words ("how can you X… when you spend months on
  Y?"), not on a surrounded avatar.

**duration**: 6–9s (clutter-shove-to-question variant ~10s)

**shot structure** (a `[bg]` canvas; recognizable surfaces first, the viewer's avatar revealed underneath, then a radial crowd)

- **Scene 1 (0.0–~1.6s) — recognizable assembly.** Three `[product mockups / surfaces]` assemble into something the viewer knows — staggered scale-in, the **center** one full-size, the two flanks smaller (~0.86). Each rides a low-amplitude float so they feel like live context, not a static collage. Camera static.
- **Scene 2 (~1.6–3.0s) — density amplifies.** `[platform icons / logos]` scatter in around the mockups (staggered), used purely as **density markers** — "look how much surface area," not animated dials.
- **Scene 3 (~3.0–4.6s) — the morph (signature move).** The CENTER mockup MORPHS: its content fades out, the container reshapes, and the viewer's `[avatar]` is revealed **underneath** — a literal swap of subject, product → person.
- **Scene 4 (~4.6–end) — close-in.** `[task bubbles / demands]` close in from ALL sides toward the avatar (radial staggered entry). The avatar **stays put** while the bubbles invade — the claustrophobia comes from being surrounded, never from a camera push. Holds on the crowded state.
- **Variant — clutter-shove-to-question** (replaces Scenes 3–4 and
  inverts the camera contract — see modifier): accumulation runs under a **slow steady zoom-out** —
  `[sticky notes]` bounce in springy, `[dashboard / editor windows]` pop and slide up, a stack of
  `[alert toasts]` slides in at one edge, inner content keeps typing / log-scrolling as live density,
  windows overlap until the frame is chaotically full. The camera then REVERSES into a quick
  push-in that **shoves the clutter to the frame edges**, opening central negative space where a
  `[two-part serif question]` builds word-by-word (line 1 swaps in place to line 2); a `[cursor]`
  glides in from off-frame and comes to rest under the text; a very slow forward creep and hold.
  No morph, no avatar — the question is the payoff.

**motion vocabulary**: staggered scale-in assembly; resting-scale-preserving low float; density-marker icon scatter; content-fade → container-reshape → reveal-anchor-beneath morph; radial close-in entry from all compass points; held crowded end-state. Clutter-shove variant: slow steady zoom-out under accumulation; reverse quick push-in; clutter
shoved to frame edges opening center negative space; continuous live typing / log scroll inside
windows as ambient density; toast-stack slide-in; word-by-word serif build with in-place line swap;
cursor glide-to-rest; very slow forward creep + hold.

**rule mapping**

- staggered mockup + icon entries (smooth settle onto their resting scale) → `spring-pop-entrance` (smooth-settle register) backed by `gsap-effects`
- platform icons as density markers (positions pre-baked, scale/opacity only — NOT internal-parts animation) → `svg-icon-enrichment` (its DOM contract only)
- center mockup → avatar morph (HF forbids `width`/`height` tweens → drive the reshape on `scaleX`/`scaleY`, anchor = the avatar layer rendered beneath) → `card-morph-anchor`
- radial bubble close-in (positions baked once via `cos`/`sin`, staggered entry) → `gsap-effects` (radial layout) + `spring-pop-entrance` (per-bubble arrival)
- low-amplitude float on background mockups/icons → `sine-wave-loop` (low-amplitude register — subtle jitter that composes onto each element's resting scale, never a `fromTo` yoyo that re-tweens to its start)
- (variant) zoom-out under accumulation → quick push-in → slow forward creep → `multi-phase-camera`
  (pull-back / push / drift as sequential phases on one world wrapper; counter-translate math in
  `viewport-change`)
- (variant) clutter shoved to the edges as the push-in lands → `center-outward-expansion` (outward
  vectors to edge resting positions), fired at the same timeline position as the camera push so the
  shove reads as CAUSED by it (`reactive-displacement` register)
- (variant) word-by-word serif question build → `gsap-effects` (staggered word reveal); the
  in-place line-1 → line-2 swap → `discrete-text-sequence`
- (variant) live typing inside windows → `gsap-effects` (typewriter); the continuous inner
  log-scroll — composition: looping content translateY via `gsap-effects` (masked)
- (variant) cursor glide-in coming to rest → `cursor-click-ripple` (approach portion only — no click)

**camera modifier**: camera-static — the close-in must read as the world crowding the subject, so the frame holds; a push-in would convert "surrounded" into "zoomed-into" and kill the claustrophobia. The clutter-shove-to-question variant is the sanctioned exception: there the camera IS the
storyteller (zoom-out ↔ push-in via `multi-phase-camera`), and the claustrophobia comes from
accumulation, not surround — never mix the two resolutions in one shot.

## Selected motion rule: press-release-spring

---
name: press-release-spring
description: Tactile button press with linear compression, spring-based elastic recovery, and layered visual feedback (shadow shrink + release burst + background glow).
metadata:
  tags: spring, press, interaction, button, physics, glow, burst, ui
---

# Press-Release Spring Chain

Separates input (linear compression) from output (spring recovery) to create tactile feel: the overshoot is a natural byproduct of the spring config, not manually coded, with secondary motion (shadow shrink, release burst, background glow) layered on the same trigger frame. This is a **reaction on an element already resting on screen** — an arrival that springs in from nothing is [spring-pop-entrance.md](spring-pop-entrance.md); add a visible cursor actor and it becomes [physics-press-reaction.md](physics-press-reaction.md).

Two phases split at the **release**:

1. **Press**: linear ease → compression (`scale: 1 → PRESS_SCALE`, shadow shrinks). Linear, not spring — the dip must read as instant/tactile, not squishy.
2. **Release**: `back.out(BOUNCE_FACTOR)` spring back to 1.0. Optional burst glow ring expands behind the button; optional environmental glow fades in.

State continuity is critical: the release tween's start value MUST equal the press tween's end value, or the spring snaps to a different position. GSAP threads this automatically when both tweens target the same property at **adjacent positions** — `RELEASE_START = PRESS_START + PRESS_DUR`; a gap or overlap breaks it.

## Recipe

```html
<div class="press-stage">
  <div class="bg-glow" id="bg-glow"></div>
  <!-- Burst sits BEHIND the button (z-index 1 vs 2), same footprint, blurred
       radial gradient, opacity 0. bg-glow is a full-stage radial at negative
       inset so it extends past the stage edges. -->
  <div class="burst" id="burst"></div>
  <button class="btn" id="btn">{buttonLabel}</button>
</div>
```

```js
// Phase 1 — press (linear compression)
tl.to(
  "#btn",
  { scale: PRESS_SCALE, boxShadow: "{btnPressedShadow}", duration: PRESS_DUR, ease: "power1.in" },
  PRESS_START,
);

// Phase 2 — release (spring back; start scale == PRESS_SCALE by adjacency)
tl.to(
  "#btn",
  {
    scale: 1,
    boxShadow: "{btnRestShadow}",
    duration: RELEASE_DUR,
    ease: `back.out(${BOUNCE_FACTOR})`,
  },
  RELEASE_START,
);

// Phase 3 — burst glow pops behind the button, then fades
tl.fromTo(
  "#burst",
  { scale: 1, opacity: 0 },
  {
    scale: BURST_PEAK_SCALE,
    opacity: BURST_PEAK_OPACITY,
    duration: BURST_GROW_DUR,
    ease: "power2.out",
  },
  RELEASE_START,
);
tl.to("#burst", { opacity: 0, duration: BURST_FADE_DUR, ease: "power2.in" }, BURST_FADE_START);

// Phase 4 — environmental glow fades in after release
tl.to(
  "#bg-glow",
  { opacity: BG_GLOW_PEAK_OPACITY, duration: BG_GLOW_FADE_DUR, ease: "power2.out" },
  RELEASE_START,
);
```

## Variations

- **Subtle press** (status save / muted CTA): `PRESS_SCALE` ~0.96, `BOUNCE_FACTOR` ~1.4, burst scale/opacity reduced.
- **Dramatic press** (hero CTA / "ship it"): `PRESS_SCALE` ~0.88, `BOUNCE_FACTOR` ~2.5, burst maxed.
- **Color shift during press** — darken mid-press, return on release; interpolated `backgroundColor` at the same timeline positions as the scale tweens. Same state-continuity rule.
- **State change at release** (approve / confirm) — instead of returning to the rest color, swap to `{successColor}` at `RELEASE_START` and pop a checkmark via a separate `back.out(CHECK_BOUNCE)` tween (1.4–2.0, firmer than the button's bounce — a punctuating "stamp"; pop 0.3–0.6 s) at the same position. The button is now terminal — no further presses expected.

## Values

| token                | range                                      | notes                                                                                      |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| button footprint     | ≥ 3–5% of canvas area                      | a 320×68 button at 1080p is ~1% and the press reads as visually insignificant              |
| PRESS_SCALE          | 0.88 dramatic · 0.92 default · 0.96 subtle | never <0.85 (broken) or >0.98 (no perceptible dip)                                         |
| PRESS_DUR            | 0.10–0.30 s                                | shorter = snappier; must be shorter than `RELEASE_DUR` (input faster than spring recovery) |
| RELEASE_DUR          | 0.40–0.90 s                                | shorter = tight pop; longer = loose, wobbly settle                                         |
| BOUNCE_FACTOR        | 1.4 soft · 2.0 firm · 2.8 cartoony         | or `elastic.out(amplitude, period)` for a rubbery oscillation instead of one overshoot     |
| RELEASE_START        | `= PRESS_START + PRESS_DUR`                | adjacency = automatic state continuity                                                     |
| BURST_PEAK_SCALE     | 3 subtle · 6 default · 8 max               | beyond ~8 the radial gradient pixelates visibly                                            |
| BURST_PEAK_OPACITY   | 0.4–1.0                                    | grow ≈ fade, 0.4–0.7 s each; blur 40–100 px (hard ring → ambient haze)                     |
| BG_GLOW_PEAK_OPACITY | 0.1 subtle · 0.25 default · 0.45 max       | higher washes the whole composition; fade-in 0.6–1.0 s; inset −300…−500 px at 1080p        |

Color tokens: pressed surface darker than rest; rest shadow large + diffuse, pressed small + tight (the button "sinks toward the surface"); burst gradient darker + more saturated than `{btnBg}` — same-color glow looks washed out; bg glow a low-opacity tint of the button's hue family.

## Critical Constraints

- **State continuity** — release start value exactly equals press end value; enforced by same-property adjacency at `RELEASE_START = PRESS_START + PRESS_DUR`.
- **Linear press, spring release** — both spring → squishy; both linear → mechanical, no overshoot punch.
- **Anchor compression on center** (`transform-origin: 50% 50%`) or the button collapses asymmetrically.
- **Burst behind, not in front** — burst `z-index: 1`, button `z-index: 2`; in front it occludes the button at peak opacity.
- **Don't tween `boxShadow` and `filter` on the same element** — they compete in the layout pipeline; shadow on the button, blur on the separate burst layer.
- **Climax dwell** — after the burst peak + reveal, the composition must run ≥ 1 s more (≥ 2 s for dramatic variants); a reveal at `t = DURATION − 0.2 s` reads as "flashed and gone."

## See also

`spring-pop-entrance` (the ENTRANCE counterpart — arrival, not reaction) · `physics-press-reaction` (this press with a visible cursor actor) · `cursor-click-ripple` (the cursor click that triggers the press) · `sine-wave-loop` (idle micro-float BEFORE the press) · `center-outward-expansion` (badge burst synced to the release).
