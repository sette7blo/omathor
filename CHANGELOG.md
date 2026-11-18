# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/sette7blo/omathor/compare/v0.1.1...HEAD
[v0.1.1]: https://github.com/sette7blo/omathor/compare/v0.1.0...v0.1.1
[v0.1.0]: https://github.com/sette7blo/omathor/releases/tag/v0.1.0
