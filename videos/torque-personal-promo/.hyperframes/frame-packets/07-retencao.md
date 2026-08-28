# Frame packet: 07-retencao

## Project inputs

- Project: /home/user/metodo-torque/videos/torque-personal-promo
- Design tokens: /home/user/metodo-torque/videos/torque-personal-promo/frame.md
- RULES_DIR: /home/user/metodo-torque/.agents/skills/hyperframes-animation/rules

## Assigned storyboard block

## Frame 7 — Quem está sumindo

- scene: lista de Alunos com filtros Sumindo/Devendo; "O painel avisa antes do aluno cancelar"
- voiceover: ""
- duration: 5s
- transition_in: cut
- status: outline
- src: compositions/frames/07-retencao.html
- type: feature_showcase
- persuasion: Medo real (perder aluno)
- beat: prova
- blueprint: video-text-pivot
- asset_candidates: assets/painel-alunos.webp — Alunos com filtros Ativos/Sumindo/Devendo e selo DEVE 800

Tela painel-alunos. Texto: "Aluno não cancela. Ele some." → "O painel avisa ANTES." ANTES em violeta.

- focal: assets/painel-alunos.webp
- roles: painel-alunos = cutout (celular central atrás do texto, dim ~35%)

Adapt (video-text-pivot → camada única central): a tela vira fundo em profundidade e o texto assume; mantém o pivot superfície→texto.
Scene 1 (0.0–1.6s): painel-alunos.webp centrado grande com depth-of-field blur leve e dim ~35% (background role); por cima, linha display "Aluno não cancela." per-word.
Scene 2 (1.6–3.2s): hard-cut: "Ele some." curto e seco — o beat é a pausa.
Scene 3 (3.2–5.0s): "O painel avisa ANTES." slam com ANTES violeta (spring-pop); o blur da tela abre 1 beat (foco volta) mostrando o filtro "Sumindo" com highlight sweep; settle.

## Selected blueprint: video-text-pivot

# video-text-pivot — Video → Text Pivot

**intent**: A product video holds center and claims attention, then slides aside to hand its weight to a hero stat in the space it vacates, then both clear and kinetic text types into the center — accent words carrying the meaning the video used to carry — sealed by a gradient pill. The arc is "show → yield → pivot → stamp," and each handoff pairs an exit with a same-anchor entrance so two beats read, not four.

**roles served**

- Product_Intro (from `metric-video-text-pivot`): when the open is "see the feature" then "see the impact" and the `[product video]` must stay visible through the stat reveal — it slides, it doesn't cut.
- Key_Feature: a feature clip that yields to a frame-filling metric and a typographic impact line.

**duration**: 6–8s

**shot structure** (a `[bg]` canvas; one `[product video]` as a real muted `.mp4` clip, a hero stat, then kinetic text — each pair shares a screen anchor so the handoff reads as a weight-transfer)

- **Scene 1 (0.0–~1.6s) — the video shows.** The `[product video]` lands centered on a smooth scale-up and breathes (a small y-bob), claiming full attention. Camera static.
- **Scene 2 (~1.6–3.2s) — yield + stat (signature move).** The video SLIDES aside (x + scale down) **into the very space** the `[hero stat]` now fills as the stat pops in with 3D-depth type — one weight-transfer reading as a single event, not two. The stat breathes within this window.
- **Scene 3 (~3.2–5.0s) — pivot to text.** Both video and stat clear out and kinetic `[impact text]` TYPES into the vacated center, character by character; its `[accent words]` carry the meaning the video used to carry.
- **Scene 4 (~5.0–end) — stamp.** A gradient `[pill]` snaps shut around the closing line (`scaleX` 0→1), its glow halo resolving a beat behind so the silhouette reads before the bloom — sealing the statement as one graphic. Holds.

**motion vocabulary**: video scale-in + small breath; weight-transfer slide (video x + scale-down handing off to the stat at the same anchor); 3D-depth stat type; character-stream typing; gradient pill scaleX-snap; glow-halo bloom trailing the silhouette.

**rule mapping**

- video entrance (smooth) and the weight-transfer slide → `gsap-effects` (scale/opacity then x + scale on a long-tail `power3`); the video itself is a muted `<video class="clip">` direct child of the root
- hero stat's frame-filling 3D type → `3d-text-depth-layers` (static-depth variation — layers built at setup, no cascade fighting the entry)
- the same-anchor video-exit ↔ stat-entry handoff (if treated as a morph) → `scale-swap-transition` (shared center)
- character-by-character impact typing through segmented spans → `dynamic-content-sequencing` (clean character stream) or `discrete-text-sequence`
- pill `scaleX` snap + trailing glow halo → `gsap-effects` (scaleX) + `ambient-glow-bloom` (the halo, resolving a beat behind)
- video / stat breath within their windows → `sine-wave-loop` (low-amplitude register — subtle jitter, gated to each element's window, never a forever loop)

**camera modifier**: camera-static — all motion is element-space (the video translates), so the "pivot" is the elements moving, not a camera.
