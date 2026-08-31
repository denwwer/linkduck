# LinkDuck

Chrome extension that cleans YouTube links: skips the redirect, removes the tracking parameters, points you at the real destination.

## Features

- **Unwraps YouTube redirects.** `youtube.com/redirect?event=video_description&redir_token=QUFF…&q=https%3A%2F%2Fshop.example%2Fdeal%3Futm_source%3Dyoutube` becomes `shop.example/deal`.
- **Strips tracking parameters** from the destination using the AdGuard TrackParam filter.
- **Allow list.** Some destinations need their parameters; add those domains in settings and they are left untouched. Synced across browser settings.
- **No network calls, no analytics.** The rules ship with the extension. Nothing about your browsing leaves the machine.
- **Light and dark** themes.
- **Multilanguage** EN · DE · ES · FR · IT.

## Browser Compatibility

- Safari 15+ (custom build)
- Chrome 88+
- Edge 88+
- Brave
- Any Chromium-based browser with Manifest V3 support

## Support

For issues or feature requests, please modify the code as needed. This is a standalone extension with no external dependencies.
