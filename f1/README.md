# F1

The season at a glance: the next race up top (a live countdown to its next session, and every session in your time zone), the calendar below (winners for races that are done), and each race's results by session.

- **Data**: [Jolpica F1](https://api.jolpi.ca) (the free, community-run successor to the Ergast API) for the schedule, qualifying, sprint and race results; [OpenF1](https://openf1.org) for practice and sprint qualifying results (free for finished sessions). No keys.
- **Light**: only the fields shown are kept, in this browser. The schedule refreshes every 6 hours and winners hourly; finished results are kept (they don't change); anything older than 40 days is cleared. If the network's down, the last copy is shown.
- **Live**: sessions show "Live" while they're on (by their usual length); results appear once they're published, usually within an hour.

Tests: `node f1/tests/run.mjs`.
