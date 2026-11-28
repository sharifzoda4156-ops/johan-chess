# Johan Chess v0.2
Бесплатная персональная шахматная академия: анализ партий Stockfish 18 Lite Single в Web Worker, игра против компьютера, онлайн-игра на Lichess, тактические задачи из открытой базы Lichess (CC0), библиотека дебютов и исторических партий. Русский интерфейс, дизайн-система **Onyx & Emerald**, векторный логотип **J-Knight**, адаптивная вёрстка для телефона и десктопа.

## Запуск на ПК (Node.js 20+)
```sh
npm install
npm test
npm start
```
Открой `http://localhost:4173`. Для телефона в одной Wi-Fi сети: Linux/macOS `HOST=0.0.0.0 npm start`; PowerShell `$env:HOST="0.0.0.0"; npm start`. Затем открой на телефоне `http://IP_КОМПЬЮТЕРА:4173`.

## Основные возможности
- **Дизайн и доска (Onyx & Emerald)**:
  - Фирменный векторный логотип **J-Knight** (`public/logo.svg`, `public/favicon.svg`, `manifest.webmanifest` и Android Adaptive Icon `@mipmap/ic_launcher`).
  - Независимый выбор **4 палитр доски** (`Emerald Club`, `Walnut Wood` с древесной текстурой, `Ice Tournament`, `Obsidian Gold`) и **5 наборов фигур Lichess** (`Maestro` по умолчанию, `Staunty`, `Merida`, `CBurnett`, `Spatial`) с тенями контакта. Исходные SVG и лицензии — в `public/pieces/`.
  - **Drag & Drop** (Pointer Events) и клик-клик; подсветка короля под шахом/матом (`.in-check`); сбитые фигуры и перевес материала (`+3`); Web Audio синтезатор звуков ходов/взятий/рокировки/шаха с тумблером в Профиле; горячие клавиши (`←`, `→`, `Home`, `End`, `f`).
- **Разбор партии и PGN**:
  - Единое окно импорта: PGN (одна или несколько партий, BOM/CRLF/NUL), файл `.pgn` до 5 МБ, ссылки Lichess и Chess.com, загрузка последних 30 партий Chess.com.
  - Двухколоночный Разбор на десктопе (`≥ 900px`) и фокусный экран доски на мобильных.
  - Глубина Stockfish 10 / 13 / 16, HiDPI-график оценки с заливкой перевеса и маркерами ошибок, фильтр стороны (`Мои / Белые / Чёрные / Обе`), экспорт JSON и PGN с комментариями `{[%eval X]}` / пометками `?!`, `?`, `??` / заголовком `Annotator` (`public/pgn.js`), копирование PGN в буфер обмена.
  - Собственные категории и точность JC (логистическая модель шанса на победу от centipawn; не официальные метрики Chess.com).
- **Игра против компьютера**:
  - Уровни Skill Level 0 / 3 / 6 / 10 / 15 / 20 и адаптивная сложность, контроли `10+0`, `15+10`, `30+0`, без часов, произвольный FEN, переигровка позиции своей ошибки, сохранение истории до 30 тренировок и автоматический переход в разбор.
- **Онлайн-игра на Lichess (Web и Android)**:
  - Официальный OAuth2 Authorization Code + PKCE (`S256`) как в **браузере** (`public/lichess-web.js`, `localStorage`, отзыв токена через `DELETE /api/token`, NDJSON-стриминг), так и в **Android APK** (`Lichess.java`, Android Keystore).
  - Автоподбор (рапид/классика), прямые вызовы (включая блиц), друзья, история с разбором, учёт `opponentGone`, строгая блокировка движка, ИИ и переключения вкладок во время партии (fair play).
- **Тактические задачи (Lichess Open Database, CC0)**:
  - 1000 проверенных стартовых задач встроены офлайн + подгрузка блоков полной базы через GitHub Releases с проверкой SHA-256 и LRU-кэшем в IndexedDB.
  - Режимы «Путь» (160 уровней, XP), «Задача дня» (календарь и сердечки) и «Классика» (адаптивный рейтинг и фильтр тем).
- **Библиотека шахмат и ИИ-тренер**:
  - Дебюты Lichess TSV A–E (CC0, 3865 линий), тематический эндшпиль, 7 исторических партий (public domain). В веб-версии вкладка «Учёба» открывает Библиотеку напрямую.
  - ИИ-тренер (Web и Android) работает через GitHub Actions: Qwen3.5-9B на llama.cpp + Stockfish на раннере GitHub, с локальной памятью, мини-досками `[[board:N]]` и учебным планом. Настройка: [docs/coach-agent.md](docs/coach-agent.md).

## Android APK
- Сборка: Node.js 22, JDK 17, Android SDK 35, Gradle 8.9 (`npm install && gradle -p android :app:assembleDebug`).
- В Android WebView поддержаны: загрузка `.pgn` через `WebChromeClient.onShowFileChooser` (`ACTION_OPEN_DOCUMENT`), сохранение PGN/JSON через `ACTION_CREATE_DOCUMENT`, приём/отправка через системный Sharesheet, адаптивная иконка J-Knight, системные бары Onyx `#0b0e14`, собственное модальное окно подтверждений и сквозная обработка кнопки «Назад» (`JohanHandleBack`).
- Сборка APK выполняется через ручной workflow `Actions → Android APK → Run workflow`.

## Web — GitHub Pages
```sh
npm install
node scripts/build-pages.mjs
```
Статическая сборка помещается в `dist/` (в `.gitignore`) и публикуется workflow `Web Pages` с предварительным запуском `scripts/web-smoke.mjs` в headless Chrome. В веб-версии работают анализ Stockfish, игра с компьютером, задачи, библиотека, импорт/экспорт PGN и ссылок Lichess/Chess.com, а также онлайн-игра на Lichess через OAuth2 PKCE; ИИ-тренер доступен и в вебе (нужен токен GitHub).

## Проверки и лицензии
- `npm test` — модульные тесты (анализ, PGN, материал, звуки, доска, веб-клиент Lichess, профиль, задачи, библиотека, Android-конфигурация).
- `node scripts/check-game-layout.mjs` — регрессионная проверка геометрии досок и задач в Chrome across `393×800`, `360×640`, `320×568`, `800×400`.
- `node scripts/web-smoke.mjs` — сквозной дымовой тест собранного `dist/` на `390×844`, `1280×800`, `844×390`.
- Зависимости: Stockfish.js (GPL-3.0), chess.js (BSD-2-Clause), фигуры Lichess (см. `public/pieces/LICENSES.md`), задачи и дебюты Lichess (CC0). Не используй движок для помощи в текущей онлайн-партии.
