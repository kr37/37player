Setup

37 Player stores its entire library inside the browser's own storage. Browsers are allowed to clear that storage under disk pressure — unless it's been granted **persistent** status, in which case it's protected from that automatic cleanup.

37 Player already asks the browser for persistent storage automatically, every time it loads. Whether that request is actually granted is up to the browser's own judgment of how genuinely the app is being used — the more it looks like a real, regularly-used app rather than a page visited once, the more likely persistence gets granted.

The single best thing you can do to help: install 37 Player as its own app rather than just opening it as a page — in Chrome, either a full "Install app" if it's served over https, or "Create shortcut" → "Open as window" from the three-dot menu if you're running it as a local file. Browsers treat an installed app as a strong signal of genuine, ongoing use, which meaningfully improves the odds persistence gets granted. Some browsers will also show you an explicit permission prompt asking to allow persistent storage — if you ever see one, choose Allow.
