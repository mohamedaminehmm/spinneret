# spinneret
A procedural spider that lives on any web page, reads it with an on-device model and walks to what matters.

![demo](docs/demo.gif)

## What it does
- 3–5 bullets (procedural 8-leg walking with inverse kinematics, highlights the word each foot stands on,
  on-device ranking of key phrases, idle patrol, "Can I help?" prompt)

## How it works
Short diagram or list: content script → page reader → (background → offscreen model) → spider overlay.
Link the tests.

## Install
(see below)

## Usage
Controls: type "stop" / "run", Alt+K, toolbar button, what idle for 30 s does.

## Tests
`node tests/core.test.js`

## Privacy
Everything runs locally; no data leaves your machine.

## Limitations / roadmap
Honest list. Next: agent mode (tool-using loop, evaluation).

## Credits
Inspired by "Crawlers" by Slava Rybin. This is an independent project, not affiliated.

## License
MIT
