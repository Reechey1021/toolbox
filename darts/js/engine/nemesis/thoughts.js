// engine/nemesis/thoughts.js
// What Nemesis says after a visit, if anything. Driven by what actually
// happened, so "Held my nerve" only appears when it really was under pressure.
// The game screen throttles these so it never talks too much.

const LINES = {
  clutch: ["Held my nerve.", "Pressure? What pressure.", "Ice in the veins."],
  max: ["Obviously.", "One hundred and eighty. Keep up.", "Did you see that?"],
  out: ["That'll do.", "Tidy.", "Leg's mine."],
  bust: ["Let's pretend that didn't happen.", "Numbers are hard.", "Oops."],
  doubles: ["Doubles, why do you hate me?", "Just one. That's all I need.", "The wire's against me."],
  great: ["Now we're talking.", "Feeling it now.", "That's the rhythm."],
  bad: ["Scrappy. Reset.", "That's dreadful.", "Can't do that again."],
  bottle: ["I can feel it slipping.", "Don't choke. Don't choke.", "Why is my arm shaking?"],
  fightback: ["Not done yet.", "Here we go.", "Game on, then."],
  showoff: ["Show off.", "Alright, calm down.", "Lucky."],
};

// tier 1 lines always show; tier 2 lines show some of the time.
// ctx: { visit, target, opponentOnFinish, opponentLast, behind, composure, random }
export function nemesisThought(ctx) {
  const { visit, target = 60, opponentOnFinish = false, opponentLast = null, behind = false, composure = 5 } = ctx;
  const random = ctx.random ?? Math.random;
  const say = (key) => LINES[key][Math.floor(random() * LINES[key].length)];
  const pts = visit.bust ? 0 : (visit.raw ?? visit.counted);
  const perVisit = target; // a 60 average means about 60 a visit

  if (visit.checkout && opponentOnFinish) return { text: say("clutch"), tier: 1 };
  if (pts === 180) return { text: say("max"), tier: 1 };
  if (visit.bust) return { text: say("bust"), tier: 1 };
  if (visit.checkout) return random() < 0.4 ? { text: say("out"), tier: 2 } : null;
  if ((visit.doubleDarts ?? 0) >= 2) return random() < 0.55 ? { text: say("doubles"), tier: 2 } : null;
  if (opponentLast === 180) return random() < 0.5 ? { text: say("showoff"), tier: 2 } : null;
  if (pts >= Math.max(100, perVisit * 1.6)) {
    if (behind && composure >= 8) return { text: say("fightback"), tier: 2 };
    return random() < 0.35 ? { text: say("great"), tier: 2 } : null;
  }
  if (pts <= perVisit * 0.4) {
    if (behind && composure <= 3) return { text: say("bottle"), tier: 2 };
    return random() < 0.35 ? { text: say("bad"), tier: 2 } : null;
  }
  return null;
}
