# Impostor

Pick how many are playing (and how many impostors: one to begin with), press Continue, and pass the phone round. Each player gets a 3-2-1 countdown, then the word, or "Impostor". The two look exactly the same (same colour, same size, same background), because the screen lights up your face.

**Impostor gets hint** (a checkbox by the player count, off to begin with): the impostor sees a vague clue under "Impostor" (Pizza → "Slices", Fencing → "Sword"), so they're not caught straight away; they only ever see it once, at the reveal. Everyone else gets a line in the same place and style ("Don't say the word"), so the screens still look alike.

1,223 words across themes, each with its hint, are in `js/words.js` as `Word:Hint` (add more by theme; duplicates are dropped; a test makes sure no hint shares a word with its answer). Recent words aren't repeated. Tests: `node impostor/tests/run.mjs`.
