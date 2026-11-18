// Run with: node --test tests/*.test.js
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const M = require("../Model.js")

const ME = "thor1mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm"
const OP = "thor1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const NODE = "thor1nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn"
const NOW = Date.parse("2026-11-17T20:00:00Z")

function node(address, extra) {
  return Object.assign({
    address: address, status: "Active", operator: OP, bond: 4e13, fee: 2000,
    providers: [{ address: OP, bond: 3e13 }, { address: ME, bond: 1e13 }],
    slash: 100, jailUntil: 0, jailReason: "", version: "3.21.5", award: 1e11,
    leaving: false, forced: false, activeSince: 1000, statusSince: 1000,
    preflight: "Ready", preflightReason: "OK", maintenance: false, missing: 0
  }, extra || {})
}

// A snapshot as bin/omathor writes it: a churn 21600 blocks ago, so half the
// 43200-block interval has passed.
function snap(extra) {
  const height = 100000
  return Object.assign({
    version: 1,
    fetchedAt: NOW / 1000 - 10,
    source: "https://example.test",
    error: "",
    block: { height: height, time: new Date(NOW - 15000).toISOString() },
    mimir: { HALTCHURNING: 0, CHURNINTERVAL: 43200 },
    vaults: [{ status: "ActiveVault", height: 78400, since: 78400, members: 20 }],
    network: { vaultsMigrating: false, runePriceInTor: 5e7 },
    queue: { swap: 1, outbound: 2, internal: 0 },
    thorVersion: { current: "3.21.5", next: "3.21.5" },
    inbound: [{ chain: "BTC", halted: false, tradingPaused: false, lpPaused: false, gasRate: "8", gasUnits: "satsperbyte" }],
    lastblock: [{ chain: "BTC", observed: 900000 }],
    nodes: [
      node(NODE),
      node("thor1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", { activeSince: 500, slash: 900, bond: 3e13, providers: [{ address: OP, bond: 3e13 }] }),
      node("thor1yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy", { activeSince: 2000, slash: 50, bond: 5e13, providers: [{ address: OP, bond: 5e13 }] })
    ],
    nodesAt: NOW / 1000 - 60,
    churns: [{ height: 78400, date: NOW - 21600 * 6 * 1000 }, { height: 35200, date: NOW - 64800 * 6 * 1000 }],
    midgardNetwork: { bondingAPY: 0.1 }
  }, extra || {})
}

test("settings drop bad addresses and endpoints, and default notifications off", function() {
  const s = M.settings({
    addresses: [ME.toUpperCase(), ME, "thor1short", "bc1qxyz", " " + OP + " "],
    barLabel: "lots", currency: "EUR", thornode: "http://example.com", midgard: "https://midgard.example/"
  })
  assert.deepEqual(s.addresses, [ME, OP])
  assert.equal(s.barLabel, "none")
  assert.equal(s.currency, "RUNE")
  assert.equal(s.notify, false)
  assert.equal(s.refresh, true)
  assert.equal(s.thornode, "")
  assert.equal(s.midgard, "https://midgard.example")
  assert.equal(M.settings({ thornode: "http://192.168.1.5:1317" }).thornode, "http://192.168.1.5:1317")
  assert.equal(M.settings({ thornode: "https://a.example/$(x)" }).thornode, "")
})

test("addresses are added once, checked, and capped", function() {
  let r = M.addAddress({}, "  " + ME.toUpperCase())
  assert.equal(r.ok, true)
  assert.deepEqual(r.options.addresses, [ME])
  r = M.addAddress(r.options, ME)
  assert.equal(r.ok, false)
  assert.match(r.error, /already/)
  assert.equal(M.addAddress({}, "thor1nope").ok, false)
  assert.deepEqual(M.removeAddress({ addresses: [ME, OP] }, ME).addresses, [OP])
})

test("settings are read from the widget's own bar entry", function() {
  const cfg = { bar: { layout: { left: [{ id: "other", currency: "USD" }], right: [{ id: M.PLUGIN_ID, currency: "USD", barLabel: "churn" }] } } }
  const s = M.pluginSettings(cfg)
  assert.equal(s.currency, "USD")
  assert.equal(s.barLabel, "churn")
  assert.equal(M.settingsPayload(s).id, M.PLUGIN_ID)
})

test("a mimir halt counts only once the chain reaches its height", function() {
  assert.equal(M.halted({ X: 1 }, "X", 500), true)
  assert.equal(M.halted({ X: 400 }, "X", 500), true)
  assert.equal(M.halted({ X: 600 }, "X", 500), false)
  assert.equal(M.halted({ X: 0 }, "X", 500), false)
  assert.equal(M.halted({}, "X", 500), false)
})

test("a healthy network counts down to the next churn", function() {
  const s = M.summarize(snap(), { addresses: [ME] }, NOW)
  assert.equal(s.level, "ok")
  assert.equal(s.churn.state, "countdown")
  assert.equal(s.churn.lastHeight, 78400)
  assert.equal(s.churn.nextHeight, 121600)
  assert.equal(s.churn.lastExact, true)
  assert.equal(Math.round(s.churn.elapsed * 100), 50)
  assert.equal(Math.round(s.churn.secondsPerBlock), 6)
  assert.equal(M.churnLabel(s.churn, false), "1d 12h")
  assert.equal(s.price, 0.5)
})

test("churn states: halted by mimir, migrating, overdue", function() {
  let s = M.summarize(snap({ mimir: { HALTCHURNING: 1 } }), {}, NOW)
  assert.equal(s.churn.state, "paused")
  assert.equal(s.level, "warn")
  assert.match(s.issues[0].text, /Churning is halted/)
  s = M.summarize(snap({ vaults: [{ status: "ActiveVault", since: 78400, members: 20 }, { status: "RetiringVault", since: 30000, members: 20 }] }), {}, NOW)
  assert.equal(s.churn.state, "churning")
  s = M.summarize(snap({ block: { height: 130000, time: new Date(NOW - 5000).toISOString() } }), {}, NOW)
  assert.equal(s.churn.state, "due")
})

test("a chain that stopped making blocks is an alert", function() {
  const s = M.summarize(snap({ block: { height: 100000, time: new Date(NOW - 600000).toISOString() } }), {}, NOW)
  assert.equal(s.blocked, true)
  assert.equal(s.level, "alert")
  assert.equal(M.churnLabel(s.churn, s.blocked), "blocked")
})

test("old data is shown as unknown, not as healthy", function() {
  const s = M.summarize(snap({ fetchedAt: NOW / 1000 - 3600 }), {}, NOW)
  assert.equal(s.stale, true)
  assert.equal(s.level, "unknown")
  assert.equal(M.summarize(null, {}, NOW).hasData, false)
  assert.equal(M.summarize({ error: "no THORNode endpoint answered" }, {}, NOW).text.status[0], "No data: no THORNode endpoint answered")
})

test("halted and paused chains are listed", function() {
  const s = M.summarize(snap({
    inbound: [
      { chain: "BTC", halted: true },
      { chain: "ETH", tradingPaused: true },
      { chain: "LTC", lpPaused: true },
      { chain: "<img>", halted: true }
    ],
    mimir: { HALTSIGNINGBTC: 1 }
  }), {}, NOW)
  const states = s.chains.map(function(c) { return c.chain + ":" + c.state })
  assert.deepEqual(states, ["BTC:halted", "ETH:trading", "LTC:lp"])
  assert.equal(s.level, "warn")
})

test("a provider's reward is its share after the operator fee", function() {
  const s = M.summarize(snap(), { addresses: [ME, OP] }, NOW)
  const mine = s.bonds[0]
  assert.equal(mine.found, true)
  assert.equal(mine.nodes.length, 1)
  const row = mine.nodes[0]
  assert.equal(row.share, 0.25)
  // award 1e11, 20% fee, 25% share: 1e11 * 0.8 * 0.25
  assert.equal(row.reward, 2e10)
  // The operator owns 75% of the node plus the fee on the whole award, on
  // top of its whole stake in the other two nodes.
  const op = s.bonds[1]
  assert.equal(op.nodes.length, 3)
  assert.equal(op.nodes[0].reward, 1e11 * 0.8 * 0.75 + 1e11 * 0.2)
  assert.equal(s.totals.bond, 1e13 + 3e13 + 3e13 + 5e13)
})

test("APY annualises the reward since the churn, with a floor right after it", function() {
  const year = 365 * 24 * 3600
  assert.ok(Math.abs(M.apy(1, 100, year) - (Math.pow(1 + 0.01 / 365, 365) - 1)) < 1e-12)
  assert.equal(M.apy(1, 0, year), 0)
  // One block after a churn the period is 5% of the interval, not 6 seconds.
  const s = M.summarize(snap({ block: { height: 78401, time: new Date(NOW - 5000).toISOString() } }), { addresses: [ME] }, NOW)
  const floored = M.apy(2e10, 1e13, 43200 * 6 * 0.05)
  assert.ok(Math.abs(s.bonds[0].nodes[0].apy - floored) < 1e-9)
  assert.ok(s.bonds[0].nodes[0].apy < M.apy(2e10, 1e13, 6))
})

test("churn-out risk and other node problems raise the level", function() {
  // ME's node is the oldest, the worst slasher and the lowest bond here.
  const s = M.summarize(snap({
    nodes: [
      node(NODE, { activeSince: 1, slash: 5000, bond: 1e12, providers: [{ address: ME, bond: 1e12 }], version: "3.21.4" }),
      node("thor1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", { activeSince: 500, version: "3.21.5" })
    ]
  }), { addresses: [ME] }, NOW)
  const row = s.bonds[0].nodes[0]
  assert.deepEqual(row.ranks, { age: 1, slash: 1, bond: 1 })
  assert.equal(row.level, "warn")
  assert.ok(row.issues.some(function(t) { return /Runs 3\.21\.4/.test(t) }))
  assert.ok(row.issues.some(function(t) { return /oldest node, worst slash points, lowest bond/.test(t) }))

  const leaving = M.summarize(snap({ nodes: [node(NODE, { leaving: true })] }), { addresses: [ME] }, NOW)
  assert.equal(leaving.level, "alert")
  const jailed = M.summarize(snap({ nodes: [node(NODE, { jailUntil: 100100, jailReason: "failed to perform keysign" })] }), { addresses: [ME] }, NOW)
  assert.equal(jailed.bonds[0].nodes[0].jailed, true)
  assert.equal(jailed.level, "warn")
  const standby = M.summarize(snap({ nodes: [node(NODE, { status: "Standby", preflightReason: "not enough bond" })] }), { addresses: [ME] }, NOW)
  assert.equal(standby.bonds[0].nodes[0].apy, 0)
  assert.match(standby.bonds[0].nodes[0].issues[0], /Standby: not enough bond/)
})

test("an address with no bond says so", function() {
  const s = M.summarize(snap(), { addresses: ["thor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"] }, NOW)
  assert.equal(s.bonds[0].found, false)
  const rows = M.bondRows(s, { addresses: ["thor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"] })
  assert.equal(rows[1].title, "No bond found")
})

test("the bar shows nothing by default, or the churn, or the reward", function() {
  const s = M.summarize(snap(), { addresses: [ME] }, NOW)
  assert.equal(M.barLabel(s, { addresses: [ME] }), "")
  assert.equal(M.barLabel(s, { barLabel: "churn" }), "1d 12h")
  assert.equal(M.barLabel(s, { addresses: [ME], barLabel: "reward" }), "ᚱ200")
  assert.equal(M.barLabel(s, { addresses: [ME], barLabel: "reward", currency: "USD" }), "$100")
  assert.equal(M.barLabel(s, { barLabel: "reward" }), "")
  assert.equal(M.tooltip(s), "THORChain healthy")
})

test("money and durations read well", function() {
  assert.equal(M.money(123456789000000, "RUNE", 0.5), "1,234,568 RUNE")
  assert.equal(M.money(150000000, "RUNE", 0.5), "1.50 RUNE")
  assert.equal(M.money(150000000, "USD", 0.5), "$0.75")
  assert.equal(M.money(150000000, "USD", 0), "1.50 RUNE")
  assert.equal(M.duration(90061), "1d 1h")
  assert.equal(M.duration(3700), "1h 1m")
  assert.equal(M.duration(59), "0m")
  assert.equal(M.percent(0.00001), "<0.1%")
  assert.equal(M.ordinal(1) + M.ordinal(2) + M.ordinal(3) + M.ordinal(11) + M.ordinal(22), "1st2nd3rd11th22nd")
  assert.equal(M.compareVersions("3.21.10", "3.21.5"), 1)
})

test("notifications fire on changes only, never across stale data", function() {
  const a = M.summarize(snap(), { addresses: [ME] }, NOW)
  assert.deepEqual(M.events(a, a), [])
  const churning = M.summarize(snap({ vaults: [{ status: "ActiveVault", since: 78400 }, { status: "RetiringVault", since: 1 }] }), { addresses: [ME] }, NOW)
  assert.equal(M.events(a, churning)[0].title, "Churn started")
  assert.equal(M.events(churning, a)[0].title, "Churn finished")
  const halted = M.summarize(snap({ inbound: [{ chain: "BTC", halted: true }] }), { addresses: [ME] }, NOW)
  assert.equal(M.events(a, halted)[0].title, "BTC: halted")
  const out = M.summarize(snap({ nodes: [node(NODE, { status: "Standby" })] }), { addresses: [ME] }, NOW)
  const ev = M.events(a, out)
  assert.equal(ev[0].title, "Node thor1nnnn…nnnn is standby")
  assert.equal(ev[0].urgent, true)
  const stale = M.summarize(snap({ fetchedAt: NOW / 1000 - 3600 }), { addresses: [ME] }, NOW)
  assert.deepEqual(M.events(stale, out), [])
})

test("server text is cleaned before it reaches a row", function() {
  const s = M.summarize(snap({
    nodes: [node(NODE, { status: "Standby", preflightReason: "bad\u0007<b>news</b>\nline" })]
  }), { addresses: [ME] }, NOW)
  const rows = M.bondRows(s, { addresses: [ME] })
  const sub = rows[1].subtitle
  assert.equal(sub.indexOf("\u0007"), -1)
  assert.ok(sub.split("\n").every(function(l) { return l.length <= 200 }))
})

test("every Text in the QML is plain text", function() {
  const dir = path.join(__dirname, "..")
  const files = fs.readdirSync(dir).filter(function(f) { return f.endsWith(".qml") })
    .concat(fs.readdirSync(path.join(dir, "qml")).map(function(f) { return "qml/" + f }))
  assert.ok(files.length >= 4)
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), "utf8")
    const texts = src.match(/\bText\s*\{/g) || []
    const plain = src.match(/textFormat:\s*Text\.PlainText/g) || []
    assert.equal(plain.length, texts.length, f + ": " + texts.length + " Text, " + plain.length + " plain")
  }
})

test("notification text cannot carry markup", function() {
  const out = M.notifyText("<b>x</b> & <img src=y>")
  assert.doesNotMatch(out, /[<>&]/)
  assert.match(out, /img src=y/)
})

test("the network view leads with the churn and flags what needs attention", function() {
  const v = M.networkView(M.summarize(snap(), { addresses: [ME] }, NOW), {}, NOW)
  assert.equal(v.hero.label, "Next churn")
  assert.equal(v.hero.value, "1d 12h")
  assert.equal(Math.round(v.progress * 100), 50)
  assert.deepEqual(v.attention, [])
  assert.deepEqual(v.stats.map(function(t) { return t.label }),
    ["Nodes", "Vaults", "Queue", "Trading", "Bonding", "RUNE", "Total bond", "Bond APY"])
  const halted = M.networkView(M.summarize(snap({ mimir: { HALTCHURNING: 1, PAUSEBOND: 1 } }), {}, NOW), {}, NOW)
  assert.equal(halted.hero.value, "Halted")
  assert.equal(halted.hero.level, "warn")
  assert.equal(halted.progress, -1)
  assert.equal(halted.stats.filter(function(t) { return t.label === "Bonding" })[0].level, "warn")
  // "Churning is halted" is the big readout already, so only bonding is listed.
  assert.deepEqual(halted.attention.map(function(a) { return a.text }), ["Bonding is paused"])
})

test("the bond view has a card per node and tiles per address", function() {
  const opts = { addresses: [ME, OP] }
  const v = M.bondView(M.summarize(snap(), opts, NOW), opts)
  assert.equal(v.empty, false)
  assert.equal(v.addresses.length, 2)
  assert.deepEqual(v.addresses[0].stats.map(function(t) { return t.value }), ["100K RUNE", "200 RUNE", v.addresses[0].stats[2].value])
  const card = v.addresses[0].nodes[0]
  assert.equal(card.short, "thor1nnnn…nnnn")
  assert.equal(card.url, "https://thorchain.net/node/" + NODE)
  assert.deepEqual(card.cells.map(function(c) { return c.label + "=" + c.value }), ["Share=25.0%", "Fee=20%", "Version=3.21.5", "Slash=100"])
  assert.equal(card.risk.value, "Medium")
  assert.match(card.risk.sub, /^2nd oldest/)
  // One node per address: the tiles above already give what it earned.
  assert.equal(card.earned, "")
  assert.equal(v.totals.length, 2)
  assert.deepEqual(M.bondTargets(v).length, 4)
  assert.equal(M.bondView(M.summarize(snap(), {}, NOW), {}).empty, true)
  assert.equal(M.compact(101410584), "101.4M")
  assert.equal(M.compact(0.0034), "0.0034")
  assert.equal(M.compact(443268), "443K")
  assert.equal(M.compact(77448), "77.4K")
  assert.equal(M.compact(1400), "1,400")
})

test("the chains view marks only stopped chains", function() {
  const v = M.chainsView(M.summarize(snap({ inbound: [{ chain: "BTC" }, { chain: "ETH", halted: true }, { chain: "LTC", lpPaused: true }] }), {}, NOW))
  assert.deepEqual(v.map(function(c) { return c.chain + ":" + c.state + ":" + c.level }), ["BTC::", "ETH:Halted:warn", "LTC:LP paused:"])
})

test("explorer links are built only from valid addresses", function() {
  assert.equal(M.explorerUrl("node", NODE), "https://thorchain.net/node/" + NODE)
  assert.equal(M.explorerUrl("address", "thor1;rm -rf"), "")
})

// ----- THORNames -----

function nameRec(extra) {
  return Object.assign({
    found: true, fetchedAt: NOW / 1000 - 3600, error: "", owner: ME, expire: 100000 + 100 * 14400,
    preferred: "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48", threshold: 9e9, collector: 3e9,
    aliases: [{ chain: "THOR", address: ME }, { chain: "BTC", address: "bc1q" }, { chain: "ETH", address: "0x1" }, { chain: "DOGE", address: "D1" }]
  }, extra || {})
}

test("name settings: valid names only, owner must be a bond address", function() {
  const s = M.settings({
    addresses: [ME],
    names: [{ name: "Mine", owner: ME }, { name: "mine" }, { name: "bad name" }, { name: "other", owner: OP }, "plain"],
    namesRefresh: "hourly"
  })
  assert.deepEqual(s.names, [{ name: "mine", owner: ME }, { name: "other", owner: "" }, { name: "plain", owner: "" }])
  assert.equal(s.namesRefresh, "manual")
  assert.equal(M.settings({ namesRefresh: "weekly" }).namesRefresh, "weekly")
  assert.equal(M.addName(s, "mine").ok, false)
  assert.equal(M.addName(s, "a b").ok, false)
  assert.deepEqual(M.addName(s, "New").options.names.slice(-1), [{ name: "new", owner: "" }])
})

test("found names replace the earlier ones for that address and leave by-hand names alone", function() {
  let o = M.settings({ addresses: [ME, OP], names: [{ name: "old", owner: ME }, { name: "hand" }] })
  const r = M.setFoundNames(o, ME, ["new", "HAND", "x y"])
  assert.deepEqual(r.added, ["new"])
  assert.deepEqual(r.options.names, [{ name: "hand", owner: "" }, { name: "new", owner: ME }])
  assert.deepEqual(M.setFoundNames(o, NODE, ["z"]).added, [], "only for an address in the list")
  o = M.removeAddress(r.options, ME)
  assert.deepEqual(o.names, [{ name: "hand", owner: "" }])
})

test("names due for refresh follow the chosen period; forget lists the dropped ones", function() {
  const data = { items: { a: { fetchedAt: NOW / 1000 - 2 * 86400 }, b: { fetchedAt: NOW / 1000 - 3600 }, gone: { fetchedAt: 1 } } }
  const names = [{ name: "a" }, { name: "b" }, { name: "c" }]
  assert.deepEqual(M.namesDue({ names: names }, data, NOW), [])
  assert.deepEqual(M.namesDue({ names: names, namesRefresh: "daily" }, data, NOW), ["a", "c"])
  assert.deepEqual(M.namesDue({ names: names, namesRefresh: "weekly" }, data, NOW), ["c"])
  assert.deepEqual(M.namesToForget({ names: names }, data), ["gone"])
})

test("a name's expiry counts down from the saved block and colours the summary", function() {
  const opts = { addresses: [ME], names: [{ name: "mine", owner: ME }] }
  let s = M.summarize(snap(), opts, NOW, { items: { mine: nameRec() } })
  const n = s.names[0]
  assert.equal(n.registered, true)
  assert.equal(n.mine, true)
  assert.equal(n.level, "")
  assert.ok(n.secondsLeft > 90 * 86400)
  assert.equal(s.level, "ok")
  // 20 days left at 6 s a block.
  s = M.summarize(snap(), opts, NOW, { items: { mine: nameRec({ expire: 100000 + 20 * 14400 }) } })
  assert.equal(s.names[0].level, "warn")
  assert.equal(s.level, "warn")
  assert.match(s.issues.map(function(i) { return i.text }).join("|"), /THORName mine expires in 20d/)
  s = M.summarize(snap(), opts, NOW, { items: { mine: nameRec({ expire: 99000 }) } })
  assert.equal(s.names[0].level, "alert")
  assert.match(s.text.names.join("\n"), /mine: Expired/)
  // A typo is not a warning.
  s = M.summarize(snap(), { names: [{ name: "typo" }] }, NOW, { items: { typo: { found: false, fetchedAt: NOW / 1000 } } })
  assert.equal(s.level, "ok")
  assert.equal(M.namesView(s, {}, NOW)[0].status, "Not registered")
  // Never read yet.
  s = M.summarize(snap(), { names: [{ name: "new" }] }, NOW, null)
  assert.equal(M.namesView(s, {}, NOW)[0].note, "Not read yet.")
})

test("the name card: fees towards the payout, three addresses, and the refresh hint", function() {
  const opts = { addresses: [ME], names: [{ name: "mine", owner: ME }] }
  let s = M.summarize(snap(), opts, NOW, { items: { mine: nameRec() } })
  let card = M.namesView(s, opts, NOW)[0]
  assert.equal(card.expiry, "100 days")
  assert.equal(card.asOf, "Read 1h 0m ago")
  assert.equal(card.fees.value, "30.00 RUNE")
  assert.match(card.fees.sub, /of 90\.00 RUNE, paid in ETH\.USDC$/)
  assert.ok(Math.abs(card.progress - 1 / 3) < 1e-9)
  assert.equal(card.aliases.length, 3)
  assert.equal(card.more, "+1 more")
  assert.match(card.owner, /you$/)
  assert.equal(card.hint, "")
  s = M.summarize(snap(), opts, NOW, { items: { mine: nameRec({ expire: 100000 + 800 * 14400 }) } })
  assert.equal(M.namesView(s, opts, NOW)[0].expiry, "2y 2m")
  s = M.summarize(snap(), opts, NOW, { items: { mine: nameRec({ expire: 100000 + 5 * 14400, preferred: "." }) } })
  card = M.namesView(s, opts, NOW)[0]
  assert.equal(card.fees.value, "RUNE")
  assert.match(card.fees.sub, /^paid at once to thor1mmmm/)
  assert.equal(card.progress, -1)
  assert.match(card.hint, /Refresh/)
  assert.equal(M.namesView(s, Object.assign({ namesRefresh: "daily" }, opts), NOW)[0].hint, "")
  // No address for the payout chain: THORNode skips the fee.
  s = M.summarize(snap(), opts, NOW, { items: { mine: nameRec({ aliases: [] }) } })
  card = M.namesView(s, opts, NOW)[0]
  assert.equal(card.fees.value, "Skipped")
  assert.match(card.fees.sub, /no ETH address set/)
  assert.equal(card.progress, -1)
  assert.equal(card.more, "No chain addresses set")
  s = M.summarize(snap(), opts, NOW, { items: { mine: nameRec({ preferred: ".", aliases: [{ chain: "BTC", address: "bc1q" }] }) } })
  assert.match(M.namesView(s, opts, NOW)[0].fees.sub, /no THOR address set/)
  assert.match(s.text.names.join("\n"), /skipped: no THOR address set/)
})

test("a name notifies when it drops under a week and when it expires", function() {
  const opts = { addresses: [ME], names: [{ name: "mine", owner: ME }] }
  const a = M.summarize(snap(), opts, NOW, { items: { mine: nameRec({ expire: 100000 + 8 * 14400 }) } })
  const b = M.summarize(snap(), opts, NOW, { items: { mine: nameRec({ expire: 100000 + 6 * 14400 }) } })
  const c = M.summarize(snap(), opts, NOW, { items: { mine: nameRec({ expire: 99999 }) } })
  assert.match(M.events(a, b)[0].title, /THORName mine expires in 6d/)
  assert.deepEqual(M.events(b, b), [])
  assert.match(M.events(b, c)[0].title, /has expired/)
})

test("each bond address is searched for names once", function() {
  const o = { addresses: [ME, OP] }
  assert.deepEqual(M.namesToSearch(o, null, {}), [ME, OP])
  assert.deepEqual(M.namesToSearch(o, { searched: { [ME]: 1 } }, {}), [OP])
  assert.deepEqual(M.namesToSearch(o, { searched: { [ME]: 1 } }, { [OP]: true }), [])
})

test("six tabs, in key order", function() {
  assert.deepEqual(M.tabs(null).map(function(t) { return t.label }), ["Network", "Bonds", "Names", "Votes", "Pools", "Chains"])
  assert.equal(M.nextTab("bond", 1), "names")
  assert.equal(M.nextTab("network", -1), "chains")
})

test("security: the bond against the vaults, and where the rewards go", function() {
  const s = M.summarize(snap({
    network: { vaultsMigrating: false, runePriceInTor: 5e7, effectiveSecurityBond: 6e15, vaultsLiquidity: 8e15, totalReserve: 2e15 },
    midgardNetwork: { bondingAPY: 0.7, poolShareFactor: 0.115, totalPooledRune: 6e15 }
  }), {}, NOW)
  const sec = M.networkView(s, {}, NOW).security
  assert.deepEqual(sec.tiles.map(function(t) { return t.label + "=" + t.value }),
    ["Coverage=0.75×", "Effective bond=60.0M RUNE", "Vault assets=80.0M RUNE", "Rewards=89% nodes", "Pooled=60.0M RUNE", "Reserve=20.0M RUNE"])
  assert.equal(sec.tiles[0].level, "warn")
  assert.match(sec.note, /more of the rewards to nodes/)
  assert.match(s.text.network.join("\n"), /Coverage: 0\.75×/)
  assert.equal(sec.tiles[3].sub, "11% to pools")
  assert.equal(M.networkView(M.summarize(snap(), {}, NOW), {}, NOW).security, null, "no vault figure, no section")
})

test("upgrade: progress to the newest version, and proposals", function() {
  const nodes = []
  for (let i = 0; i < 10; i++) nodes.push(node("thor1" + "acdefghjkl"[i].padStart(38, "n"), { version: i < 7 ? "3.21.5" : "3.21.3" }))
  const s = M.summarize(snap({
    nodes: nodes,
    thorVersion: { current: "3.21.3", next: "3.21.5", nextSince: 100000 - 30000 },
    mimir: { HALTCHURNING: 0, CHURNINTERVAL: 43200, MAXNODETOCHURNOUTFORLOWVERSION: 3 },
    upgrades: [
      { name: "3.22.0", height: 100000 + 14400, approved: true, percent: 0.7, toQuorum: 0 },
      { name: "3.23.0", height: 200000, approved: false, percent: 0.2, toQuorum: 40 },
      { name: "old", height: 5, approved: true, percent: 1, toQuorum: 0 }
    ]
  }), {}, NOW)
  const up = M.networkView(s, {}, NOW).upgrade
  assert.equal(up.title, "Upgrading to 3.21.5")
  assert.equal(up.value, "7 of 10")
  assert.equal(up.progress, 0.7)
  assert.match(up.sub, /stays on 3\.21\.3 until all of them/)
  assert.equal(up.versions, "3.21.5: 7  ·  3.21.3: 3\n3.21.5 required to join since 2d 2h ago")
  assert.equal(up.lowVersion.text, "3 active nodes are below it and can be churned out for it, up to 3 per churn")
  assert.equal(up.lowVersion.level, "warn")
  assert.equal(up.proposals.length, 2, "a past upgrade is left out")
  assert.match(up.proposals[0].text, /approved; the chain halts for it/)
  assert.match(up.proposals[1].text, /20% approved, 40 more nodes needed/)
  // An approved upgrade within three days is an issue.
  assert.match(s.issues.map(function(i) { return i.text }).join("|"), /Chain upgrade 3\.22\.0 at block 114,400, in 1d 0h/)
  const same = M.networkView(M.summarize(snap(), {}, NOW), {}, NOW).upgrade
  assert.equal(same.progress, -1)
  assert.equal(same.sub, "every active node runs it")
})

test("a node of yours below the required version: time left, then churn-out risk", function() {
  const mine = node(NODE, { version: "3.21.3" })
  const others = [node("thor1ffffffffffffffffffffffffffffffffffffff", { version: "3.21.5" })]
  // Raised 10,000 blocks ago: 11,600 blocks (about 19h) of grace left.
  let s = M.summarize(snap({ nodes: [mine].concat(others), thorVersion: { current: "3.21.3", next: "3.21.5", nextSince: 90000 } }), { addresses: [ME] }, NOW)
  let row = s.bonds[0].nodes[0]
  assert.match(row.issues.join("|"), /needs 3\.21\.5 within 19h 20m or it can be churned out/)
  assert.equal(row.level, "warn")
  assert.match(M.networkView(s, {}, NOW).upgrade.lowVersion.text, /from 19h 20m from now, up to 1 per churn/)
  // Past the grace period.
  s = M.summarize(snap({ nodes: [mine].concat(others), thorVersion: { current: "3.21.3", next: "3.21.5", nextSince: 70000 } }), { addresses: [ME] }, NOW)
  row = s.bonds[0].nodes[0]
  assert.match(row.issues.join("|"), /can be churned out at the next churn for its version/)
  assert.equal(row.level, "alert")
  assert.equal(s.level, "alert")
  // On the required version, but not the newest: only the softer note.
  s = M.summarize(snap({ nodes: [node(NODE, { version: "3.21.5" }), node("thor1ffffffffffffffffffffffffffffffffffffff", { version: "3.21.6" })], thorVersion: { current: "3.21.5", next: "3.21.5", nextSince: 70000 } }), { addresses: [ME] }, NOW)
  assert.match(s.bonds[0].nodes[0].issues.join("|"), /Runs 3\.21\.5, others run 3\.21\.6/)
})

test("a node card shows its version", function() {
  const s = M.summarize(snap(), { addresses: [ME] }, NOW)
  assert.equal(M.bondView(s, { addresses: [ME] }).addresses[0].nodes[0].cells[2].value, "3.21.5")
  assert.match(s.text.bonds.join("\n"), /fee 20%, version 3\.21\.5/)
})

test("votes: closest to passing, your node's vote, ADR titles, operational ones left out", function() {
  const votes = {
    fetchedAt: NOW / 1000 - 120, active: 111, need: 74,
    keys: [
      { key: "ADR23", voters: 77, values: [{ v: 1, n: 73 }, { v: 0, n: 4 }], inForce: null },
      { key: "HALTETHCHAIN", voters: 90, values: [{ v: 1, n: 90 }], inForce: null },
      { key: "MAXBONDPROVIDERS", voters: 80, values: [{ v: 100, n: 80 }], inForce: 100 },
      { key: "SYSTEMINCOMEBURNRATEBPS", voters: 86, values: [{ v: 100, n: 63 }, { v: 50, n: 20 }], inForce: 50 }
    ],
    mine: { [NODE]: [{ key: "SYSTEMINCOMEBURNRATEBPS", v: 50 }] },
    adrs: { "23": { file: "adr-023-rune-supply-restructure.md", title: "$RUNE Supply Restructure", status: "Accepted", summary: "Supply is confusing." } }
  }
  const s = M.summarize(snap(), { addresses: [ME] }, NOW, null, votes)
  const view = M.votesView(s, NOW)
  assert.deepEqual(view.open.map(function(o) { return o.title }), ["ADR 23: $RUNE Supply Restructure", "System income burn rate"])
  assert.equal(view.open[1].key, "SYSTEMINCOMEBURNRATEBPS", "the raw key stays visible under a plain name")
  assert.equal(view.open[0].key, "")
  assert.equal(view.open[0].detail, "Accepted  ·  4 voted otherwise", "a plain yes vote does not repeat its value")
  assert.equal(view.open[0].count, "73 / 74")
  assert.equal(view.open[0].close, true)
  assert.equal(view.open[0].url, "https://gitlab.com/thorchain/thornode/-/blob/develop/docs/architecture/adr-023-rune-supply-restructure.md")
  assert.equal(view.open[0].mine[0].text, "Your node: has not voted")
  assert.equal(view.open[1].detail, "for 100, now 50  ·  23 voted otherwise")
  assert.equal(view.open[1].mine[0].text, "Your node: voted 50")
  assert.deepEqual(view.inForce.map(function(f) { return f.title + "=" + f.value }), ["Max bond providers=100", "System income burn rate=50"])
  assert.equal(M.votesView(M.summarize(snap(), {}, NOW, null, { need: 2, active: 3, keys: [{ key: "TORANCHOR-BSC-USDT-0X55D398326F99059FF775485246999027B3197955", voters: 1, values: [{ v: 1, n: 1 }], inForce: null }] }), NOW).open[0].title,
    "TOR price anchor: BSC.USDT")
  assert.equal(view.asOf, "Read 2m ago")
  assert.match(s.text.votes.join("\n"), /ADR 23: \$RUNE Supply Restructure: 73 of 74 for 1, 4 for other values/)
  assert.equal(M.isOperational("PAUSELP"), true)
  assert.equal(M.isOperational("PAUSEONSLASHTHRESHOLD"), false)
  assert.equal(M.adrNumber("ADR030"), "30")
  // A file name that is not a plain markdown name gives no link.
  votes.adrs["23"].file = "../evil.md?x"
  assert.equal(M.votesView(M.summarize(snap(), {}, NOW, null, votes), NOW).open[0].url, "")
  assert.equal(M.votesDue(votes, NOW), false)
  assert.equal(M.votesDue(votes, NOW + 1800 * 1000), true)
  assert.equal(M.votesView(M.summarize(snap(), {}, NOW), NOW), null)
})

test("pools: open ones deepest first, a halted chain cannot swap, staged ones last", function() {
  const pools = [
    { asset: "BSC.TWT-0X4B0F1812E5DF2A09796481FF14017E6005508003", status: "staged", runeDepth: 8e11, depth2: 1.6e10, volume24h: 0, apr: 0 },
    { asset: "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48", status: "available", runeDepth: 4e14, depth2: 8e12, volume24h: 6e14, apr: 0.086 },
    { asset: "BTC.BTC", status: "available", runeDepth: 2.2e15, depth2: 4.4e13, volume24h: 9.9e15, apr: 0.132 }
  ]
  let s = M.summarize(snap({ pools: pools }), {}, NOW)
  let v = M.poolsView(s, {}, false)
  assert.deepEqual(v.rows.map(function(r) { return r.name + "/" + r.chain }), ["BTC/", "USDC/ETH", "TWT/BSC"])
  assert.deepEqual([v.rows[0].liquidity, v.rows[0].depth, v.rows[0].volume, v.rows[0].apr], ["44.0M", "440K", "99.0M", "13.2%"])
  assert.equal(v.unit, "RUNE")
  assert.equal(v.rows[2].state, "staged")
  assert.equal(v.rows[2].depth, "")
  assert.equal(v.rows[2].dim, true)
  assert.deepEqual(v.tiles.map(function(t) { return t.value }), ["2", "1", "52.0M RUNE"])
  assert.equal(v.more, "")
  // ETH halted: its pools cannot be swapped.
  s = M.summarize(snap({ pools: pools, mimir: { HALTCHURNING: 0, CHURNINTERVAL: 43200, HALTETHCHAIN: 1 },
    inbound: [{ chain: "ETH", halted: true, tradingPaused: false, lpPaused: false, gasRate: "1", gasUnits: "gwei" }] }), {}, NOW)
  v = M.poolsView(s, {}, false)
  assert.equal(v.rows[1].state, "halted")
  assert.equal(v.rows[1].level, "warn")
  assert.equal(v.rows[0].state, "")
  // Past twelve pools, a button shows the rest.
  const many = []
  for (let i = 0; i < 20; i++) many.push({ asset: "BTC.X" + i, status: "available", runeDepth: 1e12 + i, depth2: 1, volume24h: 1, apr: 0 })
  s = M.summarize(snap({ pools: many }), {}, NOW)
  assert.equal(M.poolsView(s, {}, false).rows.length, 12)
  assert.equal(M.poolsView(s, {}, false).more, "Show all 20")
  assert.equal(M.poolsView(s, {}, true).rows.length, 20)
  assert.match(s.text.pools.join("\n"), /BTC\.X19: open/)
  assert.equal(M.poolsView(M.summarize(snap(), {}, NOW), {}, false), null)
})

test("zero amounts read as 0", function() {
  assert.equal(M.money(0, "RUNE", 0), "0 RUNE")
  assert.equal(M.compactMoney(0, "RUNE", 0), "0 RUNE")
})

test("gas amounts get thousands separators", function() {
  const v = M.chainsView(M.summarize(snap({ inbound: [{ chain: "DOGE", gasRate: "750000", gasUnits: "satsperbyte" }] }), {}, NOW))
  assert.equal(v[0].gas, "750,000 satsperbyte")
})

test("the manifest does not promise more privacy than the code keeps", function() {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"))
  assert.doesNotMatch(manifest.description, /never leave/)
  assert.match(manifest.description, /sent only once/)
  assert.ok(manifest.description.length <= 500)
})

test("node ids from THORNode cannot reach the shared object prototype", function() {
  const hostile = ["__proto__", "constructor", "toString", "hasOwnProperty"].map(function(a) {
    return node(a, { providers: [{ address: ME, bond: 1e13 }] })
  })
  const prev = M.summarize(snap({ nodes: [node(NODE)] }), { addresses: [ME] }, NOW)
  const next = M.summarize(snap({ nodes: [node(NODE)].concat(hostile) }), { addresses: [ME] }, NOW + 1000)
  assert.equal(({}).age, undefined)
  assert.equal(({}).slash, undefined)
  assert.equal(({}).bond, undefined)
  assert.equal(next.nodes.counts.active, prev.nodes.counts.active)
  assert.deepEqual(next.bonds[0].nodes.map(function(n) { return n.node }), [NODE])
  assert.deepEqual(M.events(prev, next), [])
  // A bonded node that changes still notifies when the snapshot also carries hostile ids.
  const jailed = M.summarize(snap({ nodes: [node(NODE, { status: "Standby" })].concat(hostile) }), { addresses: [ME] }, NOW + 2000)
  assert.equal(M.events(prev, jailed)[0].title, "Node " + M.shortAddress(NODE) + " is standby")
})

test("lookups keyed by chain, version or name do not see inherited properties", function() {
  const s = M.summarize(snap({ nodes: [node(NODE, { version: "__proto__" }), node(OP, { version: "constructor" })] }), { addresses: [ME] }, NOW)
  assert.deepEqual(s.versions.map(function(v) { return v.version }).sort(), ["__proto__", "constructor"])
  assert.equal(({}).length, undefined)
})

test("contract and other-chain addresses among bond providers are kept", function() {
  const CONTRACT = "thor1enhmz57mpn4umspa8hqgqwwqpe02q4hpqmqr0k2zftxr8fu3nxmqjy3tqx"
  const s = M.summarize(snap({ nodes: [node(NODE, { operator: "tbnb1zgnzmv56r2kfdh7r2zgesxcv86xrj5x52qwuvw", providers: [{ address: CONTRACT, bond: 3e13 }, { address: ME, bond: 1e13 }] })] }), { addresses: [ME] }, NOW)
  assert.equal(s.bonds[0].nodes.length, 1)
  assert.equal(s.bonds[0].bond, 1e13)
})
