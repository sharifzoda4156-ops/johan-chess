# Game Import, Export & Sharing (Web & Android)

## Unified Import
- One import surface in Review accepts single or multi-game PGN (with BOM/NUL/CRLF normalization), `.pgn` files up to 5 MiB, public Lichess game URLs, and Chess.com live/daily game URLs (resolved via the configured player's last three monthly archives).
- On Android, `MainActivity` implements `WebChromeClient.onShowFileChooser` (`Intent.ACTION_OPEN_DOCUMENT`) so `<input type="file">` opens the system document picker cleanly (blocked during active online games).
- Android Sharesheet (`ACTION_SEND`, `ACTION_VIEW`) delivers text PGN, links, and `content://` PGN URIs into a bounded in-memory inbox (3 items, 1 MiB each) without interrupting active games, analysis, or coach turns.

## Export & Outbound Share
- **Web**: «Скачать PGN с анализом» and «Скачать отчёт JSON» download files directly via Blob URLs; «Копировать PGN» writes to the clipboard with textarea fallback.
- **Android**: Export buttons invoke `JohanShare` `saveFile` (`Intent.ACTION_CREATE_DOCUMENT`, «Сохранить как…») to write UTF-8 PGN/JSON to the user-chosen location without broad storage permissions. Outbound Sharesheet also supports sharing PGN text (up to 64,000 UTF-16 chars) or a temporary `.pgn` file via narrowly scoped `FileProvider`.
- All WebMessage bridges (`JohanNative`, `JohanShare`, `JohanLichess`) return explicit `{id, error}` responses on oversized payloads instead of dropping messages silently.
