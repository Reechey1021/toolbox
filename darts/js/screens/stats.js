// screens/stats.js
// Lifetime stats for the device owner, from every finished match.

import { h, fmt, replaceChildren } from "../ui/dom.js";
import { topBar, segmented } from "../ui/components.js";
import { matches } from "../services/storage.js";
import { getOwner } from "../services/profile.js";
import { lifetimeStats } from "../engine/stats.js";

export async function statsScreen() {
  const owner = getOwner();
  const all = (await matches.list()).filter((r) => r.cfg.players.some((p) => p.id === owner.id));
  const games = [...new Set(all.map((r) => r.cfg.startScore))].sort((a, b) => a - b);

  let filter = "all";
  const body = h("div", { class: "stats__body" });

  function render() {
    const records = filter === "all" ? all : all.filter((r) => r.cfg.startScore === filter);
    const s = lifetimeStats(records, owner.id);
    if (!s.matches) {
      replaceChildren(
        body,
        h(
          "div",
          { class: "empty" },
          h("h2", null, "No finished matches yet"),
          h("p", null, "Finish a match and your averages, checkouts and records will show up here."),
          h("a", { class: "btn btn--primary", href: "#/setup" }, "Start a match")
        )
      );
      return;
    }

    const headline = h(
      "section",
      { class: "headline" },
      h("div", { class: "headline__main" }, h("span", { class: "headline__value num" }, fmt.avg(s.avg)), h("span", { class: "headline__label" }, "3-dart average")),
      h(
        "dl",
        { class: "headline__side" },
        cell("First 9", fmt.avg(s.first9)),
        cell("Best match", fmt.avg(s.bestMatchAvg)),
        cell("Checkout", fmt.pct(s.checkoutPct))
      )
    );

    const grid = h(
      "dl",
      { class: "statgrid" },
      cell("Matches", s.matches),
      cell("Won vs friends", s.contested ? `${s.wins} of ${s.contested}` : "–"),
      cell("Beat Nemesis", s.nemesisPlayed ? `${s.nemesisWins} of ${s.nemesisPlayed}` : "–"),
      cell("Legs won", s.legsWon),
      cell("Best leg", s.bestLeg === null ? "–" : `${s.bestLeg} darts`),
      cell("Highest checkout", fmt.int(s.highestCheckout || null)),
      cell("Ton-plus outs", s.tonPlusCheckouts),
      cell("Highest score", fmt.int(s.highest || null)),
      cell("Darts thrown", s.darts.toLocaleString())
    );

    const bands = h(
      "div",
      { class: "bands" },
      band("180", s.s180, s.visits),
      band("140+", s.s140, s.visits),
      band("100+", s.s100, s.visits),
      band("60+", s.s60, s.visits)
    );

    replaceChildren(
      body,
      headline,
      h(
        "section",
        { class: "section" },
        h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Average by match"), h("span", { class: "section__note" }, `Last ${Math.min(30, s.series.length)}`)),
        trendChart(s.series.slice(-30))
      ),
      h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Scoring"), h("span", { class: "section__note" }, `${s.visits.toLocaleString()} visits`)), bands),
      h("section", { class: "section" }, h("div", { class: "section__head" }, h("h2", { class: "section__title" }, "Records")), grid)
    );
  }

  const filterBar =
    games.length > 1
      ? segmented({
          label: "Game",
          value: "all",
          options: [{ value: "all", label: "All" }, ...games.map((g) => ({ value: g, label: String(g) }))],
          onChange: (v) => {
            filter = v;
            render();
          },
          className: "stats__filter",
        })
      : null;

  render();

  const el = h("main", { class: "page stats" }, topBar({ title: "Stats", sub: owner.name, back: "#/" }), filterBar, body);
  return { el, title: "Stats" };
}

function cell(label, value) {
  return h("div", { class: "statcell" }, h("dt", null, label), h("dd", { class: "num" }, value));
}

function band(label, count, visits) {
  const pct = visits ? (count / visits) * 100 : 0;
  return h(
    "div",
    { class: "band" },
    h("span", { class: "band__label num" }, label),
    h("span", { class: "band__bar" }, h("span", { class: "band__fill", style: { width: `${Math.min(100, pct * 2.5)}%` } })),
    h("span", { class: "band__count num" }, count),
    h("span", { class: "band__pct num faint" }, `${pct.toFixed(1)}%`)
  );
}

// A small line chart in SVG. Drawn at a fixed internal size and scaled to fit.
function trendChart(series) {
  if (series.length < 2) {
    return h("p", { class: "faint chart__empty" }, "Play one more match to see your trend.");
  }
  const W = Math.round(Math.min(640, Math.max(300, window.innerWidth - 64)));
  const H = Math.round(W < 480 ? 200 : 220);
  const pad = { l: 36, r: 12, t: 14, b: 22 };
  const vals = series.map((p) => p.avg);
  let lo = Math.floor((Math.min(...vals) - 3) / 10) * 10;
  let hi = Math.ceil((Math.max(...vals) + 3) / 10) * 10;
  if (hi - lo < 20) hi = lo + 20;
  lo = Math.max(0, lo);
  const x = (i) => pad.l + (i / (series.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

  const ticks = [];
  const step = (hi - lo) / 4;
  for (let k = 0; k <= 4; k++) ticks.push(lo + step * k);

  const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`).join(" ");
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;

  const svg = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Average by match, from ${fmt.avg(vals[0])} to ${fmt.avg(vals[vals.length - 1])}">
      ${ticks
        .map(
          (t) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}" class="chart__grid"/>
                  <text x="${pad.l - 8}" y="${y(t) + 4}" class="chart__tick" text-anchor="end">${Math.round(t)}</text>`
        )
        .join("")}
      <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(mean)}" y2="${y(mean)}" class="chart__mean"/>
      <path d="${line}" class="chart__line"/>
      ${series.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.avg)}" r="${i === series.length - 1 ? 5 : 3}" class="chart__dot${i === series.length - 1 ? " is-last" : ""}"/>`).join("")}
    </svg>`;

  return h(
    "figure",
    { class: "chart" },
    h("div", { class: "chart__svg", html: svg }),
    h("figcaption", { class: "chart__caption" }, h("span", { class: "chart__key chart__key--line" }, "Match average"), h("span", { class: "chart__key chart__key--mean" }, `Mean of these ${fmt.avg(mean, 1)}`))
  );
}
