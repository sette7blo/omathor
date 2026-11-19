# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [v0.1.7] - 2026-11-19

### Fixed
- `uninstall.sh` removes nothing unless the plugin is confirmed off: it turns it off, then
  checks with the running shell (`omarchy-shell shell listPlugins`), and stops with a
  message if it cannot confirm that (the shell not running, the plugin still on, the
  Omarchy commands missing). Links and data are removed only after running commands have
  finished, so a timeout leaves everything in place, and success is reported only if
  nothing wrote the data folder again.
- A THORName removed from the settings while its refresh result was being saved could
  stay in `names.json`. Removing a name now always queues it to be forgotten, after any
  save already running, instead of only when it was already in the panel's copy of the
  file.

## [v0.1.6] - 2026-11-19

### Fixed
- `uninstall.sh` no longer signals any process. Version 0.1.5 stopped every process with
  the plugin's script path in its arguments, which could include an unrelated program,
  such as an editor showing that file. Now every `omathor` command holds a shared lock
  while it runs, and the uninstaller takes it exclusively: it waits for running commands
  (up to 90 seconds, `OMATHOR_UNINSTALL_WAIT`), deletes the data only while it holds the
  lock, and fails without deleting anything if a command is still running. A command that
  was waiting for the lock during the uninstall exits without writing.

### Security
- A THORName removed from the settings is no longer read: a refresh waiting in the queue
  is dropped, and each one is checked against the selection before it is sent. The panel
  no longer has the refresh save its results: it runs `names refresh --print`, keeps the
  results of names still selected, and saves them with the new `names save`, through the
  same ordered queue as its other changes to `names.json`. `names refresh` run by hand
  still saves directly.
- Notifications no longer put THORNames or node addresses in `notify-send`'s arguments.
  The panel sends them over D-Bus with `lib/notify.py`, which reads them from stdin; if the
  notification service cannot be reached that way, it sends a notice that names nothing.

## [v0.1.5] - 2026-11-18

### Security
- Bond and node addresses and THORNames no longer appear in process arguments, where
  other accounts on the computer can read them. The panel passes them to `omathor` on
  stdin (`names find -`, `names refresh -`, `names forget -`, `votes fetch -`), request
  addresses go to `curl` in its configuration on stdin, and `jq` gets them from the
  environment.
- An address removed from the settings is no longer looked up: a lookup waiting in the
  queue is dropped, and each one is checked against the selection before it is sent.
  A lookup already running when the address is removed adds no names and leaves no
  record. `names find` no longer records the search itself; the panel records it with the
  new `names searched`, through one queue with the other changes to `names.json`, which
  the commands also lock while they change it.

### Fixed
- `uninstall.sh` stops the plugin's running commands (and the `curl` and `jq` they
  started) instead of waiting up to 90 seconds, and exits with an error, instead of
  reporting success, if one could not be stopped or the data folder was written again.

## [v0.1.4] - 2026-11-18

### Security
- Node addresses from THORNode are checked on import: a node whose address is not a plain
  `thor1` address is dropped, also from a snapshot saved by an earlier version. Operator
  and bond provider addresses must have the bech32 form (contract addresses, which bond
  too, are kept). Every lookup table keyed by outside text (nodes, chains, versions,
  THORNames) has no inherited keys, so a key such as `__proto__` or `constructor` can
  neither change other objects nor stop the notifications.

### Fixed
- `uninstall.sh` waits for a refresh that is still running before it deletes the saved
  data, so the refresh cannot write it back.

### Changed
- The README says that `omarchy plugin remove` does not run the uninstaller, lists what
  omathor keeps in `~/.local/state/omarchy/omathor/`, and shows how to run the
  uninstaller first, or clean up by hand after a removal without it.

## [v0.1.3] - 2026-11-18

### Security
- Requests no longer read your curl configuration (`~/.curlrc`), so a setting there
  cannot make the refresh follow a redirect or skip the certificate check. A redirect is
  now an error rather than an empty answer.

## [v0.1.2] - 2026-11-18

### Fixed
- The launcher (`omathor.desktop`) runs the plugin's own `bin/omathor` instead of `~/.local/bin/omathor`,
  which may belong to another program when the installer left it alone. Launchers written by earlier versions are rewritten on the next load.
  If the plugin folder's path holds characters a launcher cannot carry safely, no
  launcher is made.

## [v0.1.1] - 2026-11-18

### Fixed
- The installer no longer moves an existing `~/.local/bin/omathor` or `omathor.desktop` aside
  to put its own link there. A path that is already taken is left as it is, and the
  plugin works without the link. The uninstaller removes only links that point into the
  plugin. Backups made by earlier versions (`*.bak.<date>`) are not touched.

## [v0.1.0] - 2026-11-18

### Added
- Bar widget: a bolt coloured by THORChain's health and the state of your bonded nodes.
  Optionally shows the time to the next churn or what your bonds earned since the last
  churn.
- Panel with six tabs: Network (churn, halts, vaults, queue, nodes, price), Bonds
  (each node you bond to, with reward, APY, slash points and churn-out risk), Names, Votes,
  Pools and Chains.
- Churn state that follows the chain: blocked, halted by mimir, churning, due, or a
  countdown.
- Several bond addresses; amounts in RUNE or USD.
- THORNames: expiry countdown, affiliate fees waiting for the payout, owner and
  addresses. Found from your bond addresses (each searched once), or added by hand; read
  again by hand, daily or weekly.
- Notifications for churns, chain halts, changes to your nodes and THORNames close to
  expiring, off by default.
- `omathor panel <tab>` opens the panel on a tab, for a keybinding.
- `omathor` command line tool: `status`, `network`, `bond`, `names`, `votes`, `pools`,
  `chains`, `refresh`, with `--json`.
- Pools tab: whether each pool can be swapped now, its liquidity, 2% depth, 24h volume
  and APR.
- Votes tab: node votes on mimir settings closest to the two-thirds needed to pass, how
  your nodes voted, and ADR titles and summaries from THORNode's repository.
- Network security (bond against vault assets, reward split, pooled RUNE, reserve) and
  upgrade progress (active nodes on the newest version, chain upgrade proposals) on the
  Network tab, with when the required version was raised and whether nodes below it can
  now be churned out. A node of yours below it is flagged with the time left to upgrade.
- Public THORNode with a fallback, the THORChain RPC for the block header, and Midgard;
  your own endpoints can be set instead. Responses are compressed, and the node list is
  read every 30 minutes, every 10 while you look at it.

[Unreleased]: https://github.com/sette7blo/omathor/compare/v0.1.7...HEAD
[v0.1.7]: https://github.com/sette7blo/omathor/compare/v0.1.6...v0.1.7
[v0.1.6]: https://github.com/sette7blo/omathor/compare/v0.1.5...v0.1.6
[v0.1.5]: https://github.com/sette7blo/omathor/compare/v0.1.4...v0.1.5
[v0.1.4]: https://github.com/sette7blo/omathor/compare/v0.1.3...v0.1.4
[v0.1.3]: https://github.com/sette7blo/omathor/compare/v0.1.2...v0.1.3
[v0.1.2]: https://github.com/sette7blo/omathor/compare/v0.1.1...v0.1.2
[v0.1.1]: https://github.com/sette7blo/omathor/compare/v0.1.0...v0.1.1
[v0.1.0]: https://github.com/sette7blo/omathor/releases/tag/v0.1.0
