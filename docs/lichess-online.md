# Online Lichess (Web & Android)
Official API and fair play: https://lichess.org/api ; https://lichess.org/page/fair-play ; https://lichess.org/page/api-tips .

## Dual Transport Architecture
- **Android APK (`Lichess.java` + `JohanLichess` WebMessage bridge)**:
  - OAuth2 Authorization Code + PKCE (`S256`) using loopback `127.0.0.1` callback server. Drains bounded HTTP request headers before sending HTTP 200/400 so system browsers do not hit `ERR_CONNECTION_RESET`. Supports immediate `cancelLogin`.
  - Tokens encrypted in Android Keystore (AES-GCM); tokens never enter WebView JavaScript.
  - Pushes `jc-lichess-update` events to WebView on stream/lock/challenge/opponentGone changes instead of relying on unconditional polling.
- **Browser / GitHub Pages (`public/lichess-web.js`)**:
  - Official OAuth2 Authorization Code + PKCE (`S256`, `client_id: johan-chess-web`, dynamic `redirect_uri = location.origin + location.pathname`).
  - Verifies `state` in `sessionStorage`, strips `?code=&state=` via `history.replaceState`, stores `{token, username}` in `localStorage` (`jc-lichess-web-v1`), and revokes tokens via `DELETE /api/token` on logout.
  - Real-time NDJSON streaming via `fetch` + `ReadableStream` + `AbortController` for `/api/stream/event`, `/api/board/seek`, `/api/challenge/{user}`, and `/api/board/game/stream/{id}` with push-driven `onUpdate` callbacks and `beforeunload` active-game protection.

## Gameplay, Social & Fair Play
- Standard real-time chess only: automatic seek `10+0`, `15+10`, `30+20`; direct challenges also allow `3+2` and `5+0`.
- Server decides pairing, moves, clocks, outcomes, and ratings. UI displays captured material, check highlight, and projected clocks.
- **Anti-cheat / Fair play**: during matchmaking and live games, navigation tabs are locked, local Stockfish and ChatGPT Coach are blocked, no legal-move hints/dots are rendered, and Android sets `FLAG_SECURE`.
- **Opponent presence**: server `opponentGone` events supply the official claim countdown (`claimWinInSeconds`); only after the announced delay may the player claim victory or draw through the Board API.
- Completed standard games can be opened directly in Stockfish Game Review.
