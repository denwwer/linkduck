# LinkDuck

Chrome extension that cleans YouTube links: skips the redirect, removes the tracking parameters, points you at the real destination.

## Features

- **Unwraps YouTube redirects.** `youtube.com/redirect?q=https://example.com` becomes `https://example.com`. The click is never reported.
- **Resolves sponsored links.** LinkDuck decodes link and straight to the advertiser with stripped tracking params.
- **Strips tracking parameters** from the destination using the AdGuard TrackParam filter.
- **Handles campaign parameters in the fragment**: `#products?utm_source=…` keeps the route, loses the tracking `#products`.
- **Allow list.** Some destinations need their parameters; add those domains in settings and they are left untouched. Synced across browser settings.
- **Metrics.** How many links were cleaned.
- **No network calls, no analytics.** The rules ship with the extension. Nothing about your browsing leaves the machine.
- **Light and dark** themes, multilanguage support.

## Browser Compatibility

- Safari 15+ (custom build)
- Chrome 88+
- Edge 88+
- Brave
- Any Chromium-based browser with Manifest V3 support

## Support

For issues or feature requests, please modify the code as needed. This is a standalone extension with no external dependencies.
