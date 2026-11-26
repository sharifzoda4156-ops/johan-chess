# Mobile UX and frame budget
Reference patterns (not copied assets/code): [Lichess mobile](https://github.com/lichess-org/mobile), [Chess.com mobile game review](https://support.chess.com/en/articles/10328363-how-do-i-use-game-review-on-the-app), [Material motion](https://m1.material.io/motion/duration-easing.html), [Android rendering performance](https://developer.android.com/topic/performance/vitals/render).
 
- Preserve board themes, persistent navigation and legal move logic. Board cells retain identity during selection and position changes; only changed pieces are replaced.
- Move animation is optional, 135 ms, starts immediately after the game state changes, and never gates input. Castling/en passant/promotion use validated position differences. No guessed animation on jumps. Respect reduced motion.
- Review navigation does not rebuild the report. Analysis updates retain move rows. Clock text changes only when needed.
- Target 48 CSS px for main touch controls; board squares remain proportional. Safe area insets, stable navigation, readable hierarchy, no external UI dependencies.
 
## Device acceptance (not measured by unit tests)
Run npm test and the Android build. On a physical Android device with WebView remote debugging, record Chrome DevTools Performance during repeated piece selections, bot replies, puzzle solving, flipping, long-game analysis and switching tabs. Target no persistent long tasks on interaction; 16.7 ms/frame at 60 Hz, 8.3 ms at 120 Hz where supported. Check reduced motion, 320/360/412 px portrait, landscape, screen reader focus and themes. Engine/network response time is separate from UI response. Verify move capture, castling, promotion, en passant and rapid taps. No FPS claim until profiled on hardware.
