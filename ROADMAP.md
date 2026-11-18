# Roadmap

## Where we are

First version built 2026-11-17 and installed on the author's desktop. The fetch and the
summary are covered by tests against a stand-in THORNode, and the summary was checked
against the live network (churning halted since 11 Oct, BASE halted). Not yet on GitHub,
not released.

## Next, in order

1. Look at the panel on the desktop with real bond addresses; fix what reads badly.
2. Publish the repo and release v0.1.0.
3. Run the marketplace pre-checks (security baseline, manifest rules), then submit.

## Ideas, not scheduled

- Bond history by churn: what each address earned at each past churn (Midgard).
- A churn-out warning a few hours before a churn, when one of your nodes is first in
  line.
- Translations: move the panel strings into `i18n/en.json`.

## Standing constraints

- Read-only. No signing, no transactions, no wallet, no keys.
- Bonds are found in the full node list, never looked up by address. The only request
  that sends an address is the THORName search, once per address (when it is added),
  never on a timer.
- Only public, fixed https endpoints by default; custom ones are https, or http only to
  loopback or private networks. Responses are size-capped, trimmed and cleaned.
- Notifications are off until the user turns them on. Background refresh can be turned
  off.
- The QML never talks to the network; `bin/omathor fetch` does, and the service only
  reads its file.
- No AI features and no agent skills.
