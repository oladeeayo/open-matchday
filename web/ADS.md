# Ads on over25stats

Reserved slots (already in the HTML as `.ad-slot` with `data-ad`):

| Slot | Pages | Size (desktop) | Size (mobile) | `data-ad` |
|------|--------|----------------|---------------|-----------|
| Leaderboard | index, leagues, all | 728×90 | responsive 320–360×50–100 | `leaderboard` |
| In-feed | index | 728×90 | 300×250 or responsive | `infeed` |

Slots render as a quiet dashed box with an “ad” label until filled — no layout jump when ads go live (`.ad-slot` has reserved min-height).

## Enable AdSense (recommended path)

1. Apply at [AdSense](https://adsense.google.com) with the site domain (e.g. `over25stats.com` or your Pages domain).
2. Once approved, get your **publisher ID** (`ca-pub-XXXXXXXXXXXXXXXX`).
3. Create one ad unit per slot in AdSense → **Ads** → **By ad unit** → Display ads. Name them e.g. `leaderboard_home`, `infeed_home`. Copy each unit’s snippet.
4. In `index.html` (and the other pages), replace the placeholder content inside each `.ad-slot`:

```html
<aside class="ad-slot ad-leaderboard" data-ad="leaderboard" aria-label="Advertisement">
  <ins class="adsbygoogle"
       style="display:block"
       data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
       data-ad-slot="1234567890"
       data-ad-format="auto"
       data-full-width-responsive="true"></ins>
</aside>
```

5. Load the AdSense script once in `<head>` of every page:

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
```

6. Push the ads in a small script at the end of `<body>` (or inline per slot):

```html
<script>
  (adsbygoogle = window.adsbygoogle || []).push({});
</script>
```

The CSS already hides the dashed chrome when an ad unit is present (`.ad-slot:has(iframe)`).

## Alternative networks

Same markup works with:

- **Ezoic / AdThrive / Media.net** — swap the `ins` for their tag; keep the wrapper.
- **Direct sponsors** — drop a static `<a><img></a>` in the slot; remove the dashed border via `.ad-slot` fill rules.

## Policy notes

- Do not place ads inside the match tables or next to misleading “bet now” UI — keep them in the reserved rails.
- Disclose that predictions are informational (already in the footer).
- AdSense requires a privacy policy page and sufficient content; the multi-page site + method section is enough to start.
