# Streamio

A cross-platform streaming application built with Tauri (desktop) and Node.js (backend). Streamio aggregates torrent sources and streams content via debrid services.

## Screenshots

![Home Page](screenshots/homepage.png)
_Home page with hero banner and continue watching section_

![Library](screenshots/Library.png)
_Personal library with watch history tracking_

![Debrid Services](screenshots/Debridservices.png)
_Debrid service configuration - supports Real-Debrid, AllDebrid, TorBox, and Premiumize_

![Scrapers](screenshots/scrapers.png)
_Torrent scraper configuration and display settings_

## Architecture

```
streamio/
├── api/        # Node.js backend (auth, library sync, metadata proxy)
└── desktop/    # Tauri + React desktop app (scraping, playback)
```

**Current Model (BYOD - Bring Your Own Debrid)**: Users provide their own debrid service API key (Real-Debrid, AllDebrid, TorBox, or Premiumize). We don't host content or run torrent clients.

## TorBox Partnership

We're seeking a **whitelabel integration** with TorBox to provide a seamless, out-of-the-box streaming experience. With whitelabel access, users would no longer need to obtain and configure their own API keys—Streamio would work instantly with TorBox's infrastructure, eliminating the friction of the BYOD model while maintaining the same privacy-focused, legal architecture.

**Benefits of whitelabel integration:**

- Zero configuration for end users
- Seamless first-run experience
- Consistent performance and reliability

## Tech Stack

- **Desktop**: Tauri 2.x, React 18, TypeScript, Zustand
- **Backend**: Node.js, Express, TypeScript, better-sqlite3
- **Player**: MPV with libmpv integration
- **Metadata**: Cinemeta
- **Debrid**: Real-Debrid, AllDebrid, TorBox, Premiumize

## License

MIT
