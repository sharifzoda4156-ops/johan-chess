# Mobile UX, Visual Identity & Frame Budget
Reference patterns (not copied assets/code): [Lichess mobile](https://github.com/lichess-org/mobile), [Chess.com mobile game review](https://support.chess.com/en/articles/10328363-how-do-i-use-game-review-on-the-app), [Material motion](https://m1.material.io/motion/duration-easing.html), [Android rendering performance](https://developer.android.com/topic/performance/vitals/render).

- **Persistent board DOM**: Board cells retain identity during selection and position changes; only changed pieces are replaced. Pointer Events Drag & Drop (`.board-drag-ghost`, `.drag-over`) coexists cleanly with click-to-move and board flipping.
- **Move motion**: Configurable Lichess-style cubic easing (`slow`/`medium`/`fast`/`none`), non-blocking, respects `prefers-reduced-motion`. Castling, en passant, and promotion use validated position diffs.
- **Review & Game shells**:
  - Desktop (`>= 900px`): 2-column Review with sticky viewport-fitted board + side-by-side report, HiDPI eval chart (`devicePixelRatio` + `ResizeObserver`), and side filter (`Мои / Белые / Чёрные / Обе`).
  - Mobile (`< 900px`): focused full-viewport fixed game shells for Play, Online, and Review board focus, plus viewport-fitted Puzzles (including 2-column landscape) and Journey Map with CTA always visible above `.bottom-nav`.
- **In-app confirmation modal** (`public/dialog.js`): replaces browser `window.confirm()` everywhere, styled to match Onyx & Emerald, accessible via `Escape` and Android Back.

## Visual identity: Onyx & Emerald
- **Palette**: Onyx background `#0B0E14`, chrome `#0F141D`, cards `#151C28`, raised `#1D2636`, emerald primary `#22C55E` (`#052E16` text for >= 4.5:1 WCAG AA contrast), gold accent `#F59E0B`, success `#34D399`, danger `#F87171`.
- **Brand mark**: Faceted emerald & gold **J-Knight** (`public/logo.svg`, `public/favicon.svg`, Android Adaptive Icon `@mipmap/ic_launcher`). Android system status/navigation bars match `#0B0E14`.
- **Board palettes & piece sets**: 4 independent board palettes (`Emerald Club`, `Walnut Wood`, `Ice Tournament`, `Obsidian Gold`) and 5 verified Lichess SVG piece sets (`Maestro` default, `Staunty`, `Merida`, `CBurnett`, `Spatial`) with subtle contact drop shadows.

## Device & CI verification
- Automated Playwright layout regression (`scripts/check-game-layout.mjs`) checks fixed boards (`play`, `online`, `review`), focused puzzle boards, and Journey CTA across `393×800`, `360×640`, `320×568`, and `800×400`.
- Web smoke suite (`scripts/web-smoke.mjs`) verifies end-to-end interactions on `dist/` across `390×844`, `1280×800`, and `844×390`.
