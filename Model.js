// Pure-JS helpers shared by Service.qml, BarWidget.qml, Panel.qml and
// SettingsView.qml: the settings, and the summary built from the snapshot the
// omathor command fetches. No QML types in here, so the whole file runs under
// Node for tests.

var PLUGIN_ID = "io.github.sette7blo.omathor"

var MAX_TEXT = 200
var MAX_ADDRESSES = 10
var MAX_NAMES = 20
// RUNE amounts come in 1e8 units; TOR is THORChain's USD unit, also 1e8.
var UNIT = 1e8
var SECONDS_PER_YEAR = 365 * 24 * 3600
// Thresholds, all in seconds.
var STALL_AFTER = 180
var STALE_AFTER = 900
// The chain's target block time, used when the churn history does not give
// a measured one.
var BLOCK_SECONDS = 6
// An APY right after a churn is a few blocks of reward annualised, so the
// period is floored at this share of the churn interval.
var MIN_CHURN_PROGRESS = 0.05

var LEVELS = ["ok", "warn", "alert"]

function text(value, max) {
  if (value === null || value === undefined) return ""
  var s = String(value).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/^\s+|\s+$/g, "")
  var limit = max || MAX_TEXT
  return s.length > limit ? s.slice(0, limit) : s
}

function num(value) {
  var n = Number(value)
  return isFinite(n) ? n : 0
}

function parseJson(raw) {
  try {
    return JSON.parse(String(raw || ""))
  } catch (e) {
    return null
  }
}

function worse(a, b) {
  return LEVELS.indexOf(b) > LEVELS.indexOf(a) ? b : a
}

// ----- Addresses -----

// A THORChain account: bech32 with the thor prefix. Every node address has
// this form. Contract addresses are longer; some bond to nodes, but they are
// never entered as your own address.
function isAddress(value) {
  return /^thor1[02-9ac-hj-np-z]{38}$/.test(String(value || ""))
}

// A lookup table keyed by text from outside (node addresses, chains, names,
// versions). It has no prototype, so a key such as __proto__ or constructor is
// an ordinary entry: it can neither write to the prototype every object
// shares nor be found as an inherited property.
function dict() {
  return Object.create(null)
}

function cleanAddress(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase()
}

function shortAddress(value) {
  var a = String(value || "")
  return a.length > 16 ? a.slice(0, 9) + "…" + a.slice(-4) : a
}

// THORNode's own rule: 1 to 30 of these characters. The chain stores names
// lower case and matches them without regard to case.
function isName(value) {
  return /^[a-z0-9+_-]{1,30}$/.test(String(value || ""))
}

function cleanName(value) {
  return String(value || "").trim().toLowerCase()
}

function explorerUrl(kind, address) {
  if (!isAddress(address)) return ""
  return "https://thorchain.net/" + (kind === "node" ? "node/" : "address/") + address
}

// ----- Settings (the widget's entry in shell.json) -----

var BAR_LABELS = ["none", "churn", "reward"]
var CURRENCIES = ["RUNE", "USD"]
var NAME_REFRESH = ["manual", "daily", "weekly"]
var NAME_REFRESH_SECONDS = { daily: 86400, weekly: 7 * 86400 }

function validBase(url) {
  var u = String(url || "")
  if (/^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~\/-]*)?$/.test(u)) return true
  return /^http:\/\/(localhost|127\.[0-9.]+|10\.[0-9.]+|192\.168\.[0-9.]+|172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9.]+)(:[0-9]{1,5})?(\/[A-Za-z0-9._~\/-]*)?$/.test(u)
}

function settings(raw) {
  var data = raw && typeof raw === "object" ? raw : {}
  var addresses = []
  var list = Array.isArray(data.addresses) ? data.addresses : []
  for (var i = 0; i < list.length && addresses.length < MAX_ADDRESSES; i++) {
    var a = cleanAddress(list[i])
    if (isAddress(a) && addresses.indexOf(a) === -1) addresses.push(a)
  }
  // A name found through a bond address carries that address as `owner`;
  // a name typed in by hand has none.
  var names = []
  var seen = dict()
  var nameList = Array.isArray(data.names) ? data.names : []
  for (var n = 0; n < nameList.length && names.length < MAX_NAMES; n++) {
    var entry = nameList[n] && typeof nameList[n] === "object" ? nameList[n] : { name: nameList[n] }
    var nm = cleanName(entry.name)
    var owner = cleanAddress(entry.owner)
    if (!isName(nm) || seen[nm]) continue
    seen[nm] = true
    names.push({ name: nm, owner: isAddress(owner) && addresses.indexOf(owner) !== -1 ? owner : "" })
  }
  var thornode = String(data.thornode || "").replace(/\/+$/, "")
  var midgard = String(data.midgard || "").replace(/\/+$/, "")
  return {
    addresses: addresses,
    barLabel: BAR_LABELS.indexOf(data.barLabel) !== -1 ? data.barLabel : "none",
    currency: CURRENCIES.indexOf(data.currency) !== -1 ? data.currency : "RUNE",
    // Off unless turned on.
    notify: data.notify === true,
    // Background refresh is on by default, since the bar's colour depends
    // on it; when off, data is fetched only while the panel is open.
    refresh: data.refresh !== false,
    names: names,
    // Names are asked about by name, so by default only when you say so.
    namesRefresh: NAME_REFRESH.indexOf(data.namesRefresh) !== -1 ? data.namesRefresh : "manual",
    thornode: validBase(thornode) ? thornode : "",
    midgard: validBase(midgard) ? midgard : ""
  }
}

function pluginSettings(config) {
  if (!config || typeof config !== "object") return settings(null)
  var layout = config.bar && config.bar.layout ? config.bar.layout : {}
  var sections = ["left", "centerBegin", "center", "centerEnd", "right", "tray"]
  for (var s = 0; s < sections.length; s++) {
    var entries = Array.isArray(layout[sections[s]]) ? layout[sections[s]] : []
    for (var i = 0; i < entries.length; i++) {
      if (entries[i] && typeof entries[i] === "object" && String(entries[i].id || "") === PLUGIN_ID) return settings(entries[i])
    }
  }
  return settings(null)
}

function settingsPayload(raw) {
  var data = settings(raw)
  return {
    id: PLUGIN_ID, addresses: data.addresses, barLabel: data.barLabel, currency: data.currency,
    notify: data.notify, refresh: data.refresh, names: data.names, namesRefresh: data.namesRefresh,
    thornode: data.thornode, midgard: data.midgard
  }
}

function addAddress(options, value) {
  var a = cleanAddress(value)
  var current = settings(options)
  if (!isAddress(a)) return { ok: false, error: "That is not a THORChain address (thor1…).", options: current }
  if (current.addresses.indexOf(a) !== -1) return { ok: false, error: "That address is already in the list.", options: current }
  if (current.addresses.length >= MAX_ADDRESSES) return { ok: false, error: "Up to " + MAX_ADDRESSES + " addresses.", options: current }
  current.addresses = current.addresses.concat([a])
  return { ok: true, error: "", options: current }
}

// Names found through an address go with it.
function removeAddress(options, value) {
  var current = settings(options)
  current.addresses = current.addresses.filter(function(a) { return a !== value })
  current.names = current.names.filter(function(n) { return n.owner !== value })
  return current
}

function addName(options, value) {
  var nm = cleanName(value)
  var current = settings(options)
  if (!isName(nm)) return { ok: false, error: "A THORName is 1 to 30 letters, digits, +, _ or -.", options: current }
  for (var i = 0; i < current.names.length; i++) {
    if (current.names[i].name === nm) return { ok: false, error: "That name is already in the list.", options: current }
  }
  if (current.names.length >= MAX_NAMES) return { ok: false, error: "Up to " + MAX_NAMES + " names.", options: current }
  current.names = current.names.concat([{ name: nm, owner: "" }])
  return { ok: true, error: "", options: current }
}

function removeName(options, value) {
  var current = settings(options)
  current.names = current.names.filter(function(n) { return n.name !== value })
  return current
}

// The names a search found for `owner` replace the ones found for it
// before; names typed in by hand stay as they are. Returns the new settings
// and the names that were not in the list yet.
function setFoundNames(options, owner, found) {
  var current = settings(options)
  if (current.addresses.indexOf(owner) === -1) return { options: current, added: [] }
  var list = []
  var seen = dict()
  for (var f = 0; f < (Array.isArray(found) ? found.length : 0); f++) {
    var nm = cleanName(found[f])
    if (isName(nm) && !seen[nm]) { seen[nm] = true; list.push(nm) }
  }
  var had = dict()
  var kept = []
  for (var i = 0; i < current.names.length; i++) {
    var n = current.names[i]
    had[n.name] = true
    if (n.owner === owner && !seen[n.name]) continue
    kept.push(n)
  }
  var added = []
  for (var j = 0; j < list.length && kept.length < MAX_NAMES; j++) {
    if (had[list[j]]) continue
    kept.push({ name: list[j], owner: owner })
    added.push(list[j])
  }
  current.names = kept
  return { options: settings(current), added: added }
}

// The names due for an automatic refresh: never fetched, or older than the
// chosen period. Nothing when refreshing is manual.
function namesDue(options, namesData, nowMs) {
  var o = settings(options)
  var period = NAME_REFRESH_SECONDS[o.namesRefresh]
  if (!period) return []
  var items = namesData && namesData.items && typeof namesData.items === "object" ? namesData.items : {}
  var out = []
  for (var i = 0; i < o.names.length; i++) {
    var rec = items[o.names[i].name]
    var at = rec ? num(rec.fetchedAt) * 1000 : 0
    if (!at || num(nowMs) - at >= period * 1000) out.push(o.names[i].name)
  }
  return out
}

// Bond addresses never searched for names: each is searched once, then only
// again if it is removed and added back. `tried` holds the ones already
// asked about since the shell started, so a failed search is not retried
// in a loop.
function namesToSearch(options, namesData, tried) {
  var o = settings(options)
  var searched = namesData && namesData.searched && typeof namesData.searched === "object" ? namesData.searched : {}
  var done = tried || dict()
  return o.addresses.filter(function(a) { return !searched[a] && !done[a] })
}

// Saved name data for names no longer in the settings, to be deleted.
function namesToForget(options, namesData) {
  var o = settings(options)
  var items = namesData && namesData.items && typeof namesData.items === "object" ? namesData.items : {}
  var keep = dict()
  for (var i = 0; i < o.names.length; i++) keep[o.names[i].name] = true
  return Object.keys(items).filter(function(k) { return !keep[k] && isName(k) })
}

// ----- Formatting -----

function group(intPart) {
  return String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function fixed(value, decimals) {
  var n = num(value)
  var neg = n < 0
  var s = Math.abs(n).toFixed(decimals)
  var parts = s.split(".")
  return (neg ? "-" : "") + group(parts[0]) + (parts.length > 1 ? "." + parts[1] : "")
}

// A RUNE amount in 1e8 units, in the chosen currency.
function money(units, currency, price) {
  var rune = num(units) / UNIT
  if (currency === "USD" && price > 0) {
    var usd = rune * price
    return "$" + fixed(usd, Math.abs(usd) >= 1000 ? 0 : 2)
  }
  var abs = Math.abs(rune)
  return fixed(rune, abs >= 1000 || abs === 0 ? 0 : (abs >= 1 ? 2 : 4)) + " RUNE"
}

// The bar has little room: no decimals past 100.
function shortMoney(units, currency, price) {
  var rune = num(units) / UNIT
  if (currency === "USD" && price > 0) {
    var usd = rune * price
    return "$" + fixed(usd, Math.abs(usd) >= 100 ? 0 : 2)
  }
  return "ᚱ" + fixed(rune, Math.abs(rune) >= 100 ? 0 : 2)
}

function percent(ratio, decimals) {
  var d = decimals === undefined ? 1 : decimals
  if (num(ratio) > 0 && num(ratio) * 100 < Math.pow(10, -d)) return "<" + Math.pow(10, -d) + "%"
  return fixed(num(ratio) * 100, decimals === undefined ? 1 : decimals) + "%"
}

function duration(seconds) {
  var s = Math.max(0, Math.floor(num(seconds)))
  var d = Math.floor(s / 86400)
  var h = Math.floor((s % 86400) / 3600)
  var m = Math.floor((s % 3600) / 60)
  if (d > 0) return d + "d " + h + "h"
  if (h > 0) return h + "h " + m + "m"
  return m + "m"
}

function dateText(ms) {
  if (!(ms > 0)) return ""
  var d = new Date(ms)
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  var pad = function(n) { return (n < 10 ? "0" : "") + n }
  // Far dates (a name's expiry) get their year instead of the time.
  if (Math.abs(ms - Date.now()) > 300 * 86400 * 1000) return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear()
  return d.getDate() + " " + months[d.getMonth()] + " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
}

function ago(ms, nowMs) {
  if (!(ms > 0)) return ""
  return duration((nowMs - ms) / 1000) + " ago"
}

// "3.21.5" against "3.21.10", part by part; anything else compares equal.
function compareVersions(a, b) {
  var pa = String(a || "").split(".")
  var pb = String(b || "").split(".")
  for (var i = 0; i < 3; i++) {
    var x = parseInt(pa[i], 10) || 0
    var y = parseInt(pb[i], 10) || 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

// ----- Snapshot -----

// A mimir halt is a block height (or 1): in force once the chain reaches it.
function halted(mimir, key, height) {
  var v = num(mimir && mimir[key])
  return v > 0 && v <= Math.max(1, height)
}

function blockTimeMs(block) {
  var t = block && typeof block.time === "string" ? Date.parse(block.time) : NaN
  return isFinite(t) ? t : 0
}

// Seconds per block, measured between the last two churns when the history
// is there; the target time otherwise.
function secondsPerBlock(churns) {
  if (Array.isArray(churns) && churns.length >= 2) {
    var a = churns[0]
    var b = churns[churns.length - 1]
    var blocks = num(a.height) - num(b.height)
    var seconds = (num(a.date) - num(b.date)) / 1000
    if (blocks > 0 && seconds > 0) {
      var spb = seconds / blocks
      if (spb >= 3 && spb <= 12) return spb
    }
  }
  return BLOCK_SECONDS
}

function churnInfo(snap, height, blockMs, nowMs) {
  var mimir = snap.mimir || {}
  var vaults = Array.isArray(snap.vaults) ? snap.vaults : []
  var churns = Array.isArray(snap.churns) ? snap.churns : []
  var spb = secondsPerBlock(churns)
  var lastHeight = 0
  var migrating = !!(snap.network && snap.network.vaultsMigrating)
  for (var i = 0; i < vaults.length; i++) {
    var v = vaults[i]
    if (v.status === "ActiveVault") lastHeight = Math.max(lastHeight, num(v.since))
    if (v.status === "RetiringVault" || v.status === "InitVault") migrating = true
  }
  if (!lastHeight && churns.length) lastHeight = num(churns[0].height)
  var lastMs = 0
  var lastExact = false
  for (var c = 0; c < churns.length; c++) {
    if (num(churns[c].height) === lastHeight) {
      lastMs = num(churns[c].date)
      lastExact = true
      break
    }
  }
  if (!lastMs && lastHeight && blockMs) lastMs = blockMs - (height - lastHeight) * spb * 1000
  var interval = num(mimir.CHURNINTERVAL) || num(snap.constants && snap.constants.churnInterval) || 43200
  var nextHeight = lastHeight ? lastHeight + interval : 0
  var paused = halted(mimir, "HALTCHURNING", height)
  var state = "countdown"
  if (paused) state = "paused"
  else if (migrating) state = "churning"
  else if (nextHeight && height >= nextHeight) state = "due"
  var blocksLeft = nextHeight ? nextHeight - height : 0
  return {
    state: state,
    paused: paused,
    migrating: migrating,
    lastHeight: lastHeight,
    lastMs: lastMs,
    lastExact: lastExact,
    interval: interval,
    nextHeight: nextHeight,
    blocksLeft: blocksLeft,
    secondsLeft: Math.max(0, blocksLeft * spb),
    blocksSince: lastHeight ? Math.max(0, height - lastHeight) : 0,
    secondsSince: lastMs ? Math.max(0, (nowMs - lastMs) / 1000) : 0,
    elapsed: lastHeight && interval ? Math.max(0, (height - lastHeight) / interval) : 0,
    secondsPerBlock: spb
  }
}

function churnLabel(churn, blocked) {
  if (blocked) return "blocked"
  if (churn.state === "paused") return "paused"
  if (churn.state === "churning") return "churning"
  if (churn.state === "due") return "due"
  return duration(churn.secondsLeft)
}

function chainInfo(snap, height) {
  var mimir = snap.mimir || {}
  var inbound = Array.isArray(snap.inbound) ? snap.inbound : []
  var last = Array.isArray(snap.lastblock) ? snap.lastblock : []
  var observed = dict()
  for (var i = 0; i < last.length; i++) observed[last[i].chain] = last[i]
  var out = []
  for (var j = 0; j < inbound.length; j++) {
    var ib = inbound[j]
    var chain = text(ib.chain, 12)
    if (!/^[A-Z0-9]{2,12}$/.test(chain)) continue
    var signing = halted(mimir, "HALTSIGNING" + chain, height)
    var state = "ok"
    if (ib.halted) state = "halted"
    else if (signing) state = "signing"
    else if (ib.tradingPaused) state = "trading"
    else if (ib.lpPaused) state = "lp"
    var seen = observed[chain] ? num(observed[chain].observed) : 0
    out.push({
      chain: chain,
      state: state,
      observed: seen,
      gas: text(ib.gasRate, 20) + (ib.gasUnits ? " " + text(ib.gasUnits, 20) : "")
    })
  }
  out.sort(function(a, b) { return a.chain < b.chain ? -1 : (a.chain > b.chain ? 1 : 0) })
  return out
}

var CHAIN_STATES = {
  ok: "OK",
  halted: "Halted",
  signing: "Outbound halted",
  trading: "Trading paused",
  lp: "Liquidity paused"
}

function nodeCounts(nodes) {
  var counts = { Active: 0, Standby: 0, Ready: 0, Whitelisted: 0, Disabled: 0 }
  for (var i = 0; i < nodes.length; i++) {
    var s = nodes[i].status
    counts[s] = (counts[s] || 0) + 1
  }
  return counts
}

// Where an active node stands on the three things a churn ejects for: the
// oldest, the worst slash points, the lowest bond. 1 is first in line.
function churnRanks(active) {
  var byAge = active.slice().sort(function(a, b) { return num(a.activeSince) - num(b.activeSince) })
  var bySlash = active.slice().sort(function(a, b) { return num(b.slash) - num(a.slash) })
  var byBond = active.slice().sort(function(a, b) { return num(a.bond) - num(b.bond) })
  var ranks = dict()
  var put = function(list, key) {
    for (var i = 0; i < list.length; i++) {
      var a = list[i].address
      // The record itself has fixed keys and goes out to the panel: a plain object.
      ranks[a] = ranks[a] || {}
      ranks[a][key] = i + 1
    }
  }
  put(byAge, "age")
  put(bySlash, "slash")
  put(byBond, "bond")
  return ranks
}

function median(values) {
  if (!values.length) return 0
  var v = values.slice().sort(function(a, b) { return a - b })
  var m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

function apy(reward, principal, seconds) {
  if (!(principal > 0) || !(seconds > 0) || !(reward >= 0)) return 0
  var apr = (reward / principal) * (SECONDS_PER_YEAR / seconds)
  return Math.pow(1 + apr / 365, 365) - 1
}

// The bonds of one address: every node that lists it as a bond provider, or
// that it operates.
function bondsFor(address, nodes, ctx) {
  var rows = []
  var total = 0
  var reward = 0
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i]
    var mine = 0
    var providers = Array.isArray(n.providers) ? n.providers : []
    for (var p = 0; p < providers.length; p++) {
      if (providers[p].address === address) mine += num(providers[p].bond)
    }
    var operator = n.operator === address
    // A provider with nothing bonded is only allowed to bond there.
    if (!(mine > 0) && !operator) continue
    var feeShare = Math.min(1, Math.max(0, num(n.fee) / 10000))
    var share = n.bond > 0 ? mine / n.bond : 0
    var award = num(n.award)
    var earned = award * (1 - feeShare) * share + (operator ? award * feeShare : 0)
    var issues = []
    var level = "ok"
    var jailed = num(n.jailUntil) > ctx.height
    if (n.forced) { issues.push("Forced to leave"); level = "alert" }
    else if (n.leaving) { issues.push("Leaving at the next churn"); level = "alert" }
    if (n.status === "Disabled") { issues.push("Disabled"); level = "alert" }
    if (jailed) { issues.push("Jailed for " + duration((num(n.jailUntil) - ctx.height) * ctx.spb) + ": " + text(n.jailReason, 80)); level = worse(level, "warn") }
    if (n.status === "Standby" || n.status === "Ready" || n.status === "Whitelisted") {
      issues.push(n.status === "Ready" ? "Ready, waiting to churn in" : (n.status + ": " + (text(n.preflightReason, 120) || "not earning")))
      level = worse(level, "warn")
    }
    var low = ctx.lowVersion
    if (n.status === "Active" && low && compareVersions(n.version, low.minVersion) < 0) {
      if (low.eligible) {
        issues.push("Runs " + text(n.version, 20) + ", below the " + low.minVersion + " now required: it can be churned out at the next churn for its version")
        level = "alert"
      } else {
        issues.push("Runs " + text(n.version, 20) + ": it needs " + low.minVersion + " within " + duration(low.secondsUntil) + " or it can be churned out")
        level = worse(level, "warn")
      }
    } else if (ctx.maxVersion && compareVersions(n.version, ctx.maxVersion) < 0) {
      issues.push("Runs " + text(n.version, 20) + ", others run " + ctx.maxVersion)
      level = worse(level, "warn")
    }
    if (n.maintenance) { issues.push("In maintenance"); level = worse(level, "warn") }
    var rank = ctx.ranks[n.address] || null
    var risk = []
    if (n.status === "Active" && rank) {
      if (rank.age === 1) risk.push("oldest node")
      if (rank.slash === 1) risk.push("worst slash points")
      if (rank.bond === 1) risk.push("lowest bond")
      if (risk.length) { issues.push("First in line to churn out: " + risk.join(", ")); level = worse(level, "warn") }
    }
    var seconds = Math.max(ctx.churn.blocksSince * ctx.spb, ctx.churn.interval * ctx.spb * MIN_CHURN_PROGRESS)
    rows.push({
      node: n.address,
      status: text(n.status, 20),
      bond: mine,
      share: share,
      fee: feeShare,
      operator: operator,
      reward: earned,
      apy: n.status === "Active" ? apy(earned, mine, seconds) : 0,
      slash: num(n.slash),
      jailed: jailed,
      leaving: n.leaving === true || n.forced === true,
      version: text(n.version, 20),
      ranks: rank,
      activeCount: ctx.activeCount,
      issues: issues,
      level: level
    })
    total += mine
    reward += earned
  }
  var level = "ok"
  for (var r = 0; r < rows.length; r++) level = worse(level, rows[r].level)
  return { address: address, nodes: rows, bond: total, reward: reward, level: level, found: rows.length > 0 }
}

// Everything the bar, the panel and the command show, from one snapshot.
// ----- Low-version churn-out -----

// THORNode's markLowVersionValidators: once the version new nodes need to
// join has been raised for ChurnOutForLowVersionBlocks, each churn can eject
// up to MaxNodeToChurnOutForLowVersion active nodes still below it. Mimir
// overrides the constants.
function lowVersionInfo(snap, height, spb) {
  var ver = snap.thorVersion || {}
  var mimir = snap.mimir || {}
  var consts = snap.constants || {}
  var pickConfig = function(key, constant, fallback) {
    if (num(mimir[key]) > 0) return num(mimir[key])
    if (num(constant) > 0) return num(constant)
    return fallback
  }
  var since = num(ver.nextSince)
  var minVersion = text(ver.next, 20)
  if (!minVersion || !since) return null
  var grace = pickConfig("CHURNOUTFORLOWVERSIONBLOCKS", consts.lowVersionBlocks, 21600)
  var from = since + grace
  return {
    minVersion: minVersion,
    since: since,
    secondsSince: Math.max(0, (height - since) * spb),
    from: from,
    eligible: height >= from,
    secondsUntil: Math.max(0, (from - height) * spb),
    perChurn: pickConfig("MAXNODETOCHURNOUTFORLOWVERSION", consts.lowVersionMax, 1)
  }
}

// ----- Pools -----

// "ETH.USDC-0XA0B8…" -> "ETH.USDC".
function poolName(asset) {
  return text(asset, 80).replace(/-0X[0-9A-F]+$/i, "").replace(/-[A-Z0-9]{20,}$/i, "")
}

// A number for a table cell: compact, with no unit (the header has it).
function cellMoney(units, currency, price) {
  var rune = num(units) / UNIT
  if (currency === "USD" && price > 0) return "$" + compact(rune * price)
  return compact(rune)
}

// Each pool with whether it can be swapped now: a staged pool is not open
// yet, and a pool on a halted or paused chain cannot be swapped either.
function poolsFor(snap, out) {
  var list = Array.isArray(snap.pools) ? snap.pools : []
  var chainState = dict()
  for (var c = 0; c < out.chains.length; c++) chainState[out.chains[c].chain] = out.chains[c].state
  var tradingHalted = out.flags && (out.flags.tradingHalted || out.flags.chainsHalted)
  var pools = []
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    if (!p || typeof p !== "object") continue
    var asset = text(p.asset, 80)
    var chain = asset.split(/[.~-]/)[0]
    var status = text(p.status, 12).toLowerCase()
    var state = chainState[chain]
    var blocked = status === "available" && (tradingHalted || (state !== undefined && state !== "ok" && state !== "lp"))
    pools.push({
      asset: asset,
      name: poolName(asset),
      chain: chain,
      status: status,
      open: status === "available" && !blocked,
      blocked: blocked,
      reason: blocked ? (tradingHalted ? "trading halted" : CHAIN_STATES[state].toLowerCase()) : "",
      runeDepth: num(p.runeDepth),
      depth2: num(p.depth2),
      volume24h: num(p.volume24h),
      apr: num(p.apr)
    })
  }
  // Available pools first, deepest first; staged ones after.
  pools.sort(function(a, b) {
    var sa = a.status === "available" ? 0 : 1
    var sb = b.status === "available" ? 0 : 1
    return sa !== sb ? sa - sb : b.runeDepth - a.runeDepth
  })
  return pools
}

var POOLS_SHOWN = 12

function poolsView(sum, opts, showAll) {
  var o = settings(opts)
  if (!sum || !sum.hasData || !sum.pools || !sum.pools.length) return null
  var p = sum.price
  var open = 0
  var staged = 0
  var liquidity = 0
  for (var i = 0; i < sum.pools.length; i++) {
    var pool = sum.pools[i]
    if (pool.status === "available") { open++; liquidity += pool.runeDepth * 2 } else staged++
  }
  var rows = []
  var shown = showAll ? sum.pools.length : Math.min(POOLS_SHOWN, sum.pools.length)
  for (var r = 0; r < shown; r++) {
    var q = sum.pools[r]
    var parts = q.name.split(".")
    var available = q.status === "available"
    rows.push({
      name: parts.length > 1 ? parts.slice(1).join(".") : q.name,
      // The chain, unless the asset is the chain's own coin.
      chain: parts.length > 1 && parts[1] !== parts[0] ? parts[0] : "",
      state: !available ? "staged" : (q.blocked ? q.reason : ""),
      level: q.blocked ? "warn" : "",
      dim: !available,
      liquidity: cellMoney(q.runeDepth * 2, o.currency, p),
      depth: available ? cellMoney(q.depth2, o.currency, p) : "",
      volume: available ? cellMoney(q.volume24h, o.currency, p) : "",
      apr: available && q.apr > 0 ? percent(q.apr, 1) : ""
    })
  }
  return {
    tiles: [
      tile("Open", String(open), "pools to swap"),
      tile("Staged", String(staged), "not open yet"),
      tile("Liquidity", compactMoney(liquidity, o.currency, p), "both sides")
    ],
    rows: rows,
    unit: o.currency === "USD" && p > 0 ? "USD" : "RUNE",
    more: sum.pools.length > POOLS_SHOWN ? (showAll ? "Show the top " + POOLS_SHOWN : "Show all " + sum.pools.length) : ""
  }
}

function poolRows(sum, opts) {
  var rows = []
  for (var i = 0; i < sum.pools.length; i++) {
    var q = sum.pools[i]
    var sub = q.status === "available"
      ? "Liquidity " + money(q.runeDepth * 2, opts.currency, sum.price) + ", 2% depth " + money(q.depth2, opts.currency, sum.price)
        + ", 24h volume " + money(q.volume24h, opts.currency, sum.price) + (q.apr > 0 ? ", APR " + percent(q.apr, 1) : "")
      : "Liquidity " + money(q.runeDepth * 2, opts.currency, sum.price)
    rows.push(rowOf(q.name, q.status !== "available" ? "staged" : (q.blocked ? "can't swap: " + q.reason : "open"), sub, q.blocked ? "warn" : ""))
  }
  return rows
}

// ----- Votes -----

var ADR_DOCS = "https://gitlab.com/thorchain/thornode/-/blob/develop/docs/architecture/"
var VOTES_EVERY = 1800

// THORNode's IsOperationalMimir: these take the most-voted value from a few
// nodes and are purged regularly, so "closest to passing" means nothing for
// them. Every other node vote needs 2/3 of active nodes.
function isOperational(key) {
  var k = String(key || "").toUpperCase()
  var exact = ["MINTSYNTHS", "TRADEACCOUNTSENABLED", "RUNEPOOLENABLED", "EVMDISABLECONTRACTWHITELIST", "MAXOUTBOUNDATTEMPTS",
    "ADVSWAPQUEUERAPIDSWAPMAX", "ENABLEADVSWAPQUEUE", "STREAMINGLIMITSWAPMAXAGE", "OVERSOLVENCYCHECKINTERVAL",
    "OVERSOLVENCYTOTREASURYBPS", "SCHEDULEDMIGRATION", "DISABLETSSSIGNERFILTERING", "MAXRETIREDVAULTRECOVERYATTEMPTS",
    "P2PGATEDISABLED", "ENABLEMEMOLESSOUTBOUND", "POLRESERVESYSTEMINCOMEBPS", "STABLERESERVEORACLEPRICING", "PREFLIGHTCHAINSETDISABLED"]
  if (exact.indexOf(k) !== -1) return true
  if (k === "NODEPAUSECHAINBLOCKS" || k === "PAUSEONSLASHTHRESHOLD") return false
  if (/^(COMPROMISEDVAULT-|ALLOWNOVAULT-|XMRCONSOLIDATION)/.test(k)) return true
  return k.indexOf("HALT") !== -1 || k.indexOf("PAUSE") !== -1
}

function adrNumber(key) {
  var m = /^ADR0*([0-9]{1,4})$/.exec(String(key || "").toUpperCase())
  return m ? m[1] : ""
}

function adrInfo(votesData, key) {
  var n = adrNumber(key)
  if (!n) return null
  var adrs = votesData && votesData.adrs && typeof votesData.adrs === "object" ? votesData.adrs : {}
  var a = Object.prototype.hasOwnProperty.call(adrs, n) ? adrs[n] : null
  var file = a ? String(a.file || "") : ""
  return {
    number: n,
    title: a ? text(a.title, 120) : "",
    status: a ? text(a.status, 40) : "",
    summary: a ? text(a.summary, 240) : "",
    url: /^[A-Za-z0-9._-]{1,120}\.md$/.test(file) ? ADR_DOCS + file : ""
  }
}

// The nodes the votes are matched against: every node you bond to.
function voteNodes(sum) {
  var out = []
  var bonds = sum && Array.isArray(sum.bonds) ? sum.bonds : []
  for (var b = 0; b < bonds.length; b++) {
    for (var n = 0; n < bonds[b].nodes.length; n++) {
      var a = bonds[b].nodes[n].node
      if (isAddress(a) && out.indexOf(a) === -1) out.push(a)
    }
  }
  return out
}

function votesDue(votesData, nowMs) {
  return !votesData || !(num(votesData.fetchedAt) > 0) || num(nowMs) - num(votesData.fetchedAt) * 1000 >= VOTES_EVERY * 1000
}

function votesFor(votesData, sum) {
  var v = votesData && typeof votesData === "object" ? votesData : null
  if (!v || !Array.isArray(v.keys)) return null
  var need = num(v.need)
  var mine = v.mine && typeof v.mine === "object" ? v.mine : {}
  var myNodes = voteNodes(sum).filter(function(a) { return Object.prototype.hasOwnProperty.call(mine, a) })
  var myVote = function(node, key) {
    var list = Array.isArray(mine[node]) ? mine[node] : []
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].key === key) return num(list[i].v)
    return null
  }
  var open = []
  var inForce = []
  for (var i = 0; i < v.keys.length; i++) {
    var k = v.keys[i]
    if (!k || typeof k !== "object") continue
    var key = text(k.key, 80)
    var values = Array.isArray(k.values) ? k.values : []
    if (!values.length) continue
    var top = { v: num(values[0].v), n: num(values[0].n) }
    var forced = k.inForce === null || k.inForce === undefined ? null : num(k.inForce)
    if (forced !== null) inForce.push({ key: key, v: forced, adr: adrInfo(v, key) })
    if (isOperational(key) || (forced !== null && forced === top.v)) continue
    var mineList = []
    for (var m = 0; m < myNodes.length; m++) {
      var mv = myVote(myNodes[m], key)
      mineList.push({ node: myNodes[m], voted: mv !== null, v: mv, agrees: mv !== null && mv === top.v })
    }
    open.push({
      key: key,
      adr: adrInfo(v, key),
      top: top,
      voters: num(k.voters),
      others: Math.max(0, num(k.voters) - top.n),
      inForce: forced,
      progress: need > 0 ? Math.min(1, top.n / need) : 0,
      mine: mineList
    })
  }
  open.sort(function(a, b) { return b.top.n - a.top.n })
  return {
    fetchedAt: num(v.fetchedAt) * 1000,
    active: num(v.active),
    need: need,
    open: open.slice(0, 12),
    inForce: inForce,
    myNodes: myNodes.map(function(a) { return { node: a, count: Array.isArray(mine[a]) ? mine[a].length : 0 } })
  }
}

// Plain names for the settings most often voted on; the rest keep their key.
var VOTE_NAMES = {
  TORANCHOR: "TOR price anchor",
  ENABLESWITCH: "Token switch",
  CONFMULTIPLIERBASISPOINTS: "Confirmation multiplier",
  SYSTEMINCOMEBURNRATEBPS: "System income burn rate",
  BONDSLASHBAN: "Bond slash ban",
  SIGNATUREREFRESHBLOCKS: "Signature refresh blocks",
  MAXBONDPROVIDERS: "Max bond providers",
  VALIDATORMAXREWARDRATIO: "Validator max reward ratio",
  NUMBEROFNEWNODESPERCHURN: "New nodes per churn",
  DESIREDVALIDATORSET: "Desired validator set",
  MINSWAPSPERBLOCK: "Min swaps per block",
  MAXSWAPSPERBLOCK: "Max swaps per block",
  MINTXOUTVOLUMETHRESHOLD: "Min outbound volume threshold",
  TXOUTDELAYRATE: "Outbound delay rate",
  MAXTXOUTOFFSET: "Max outbound offset",
  MAXSYNTHPERPOOLDEPTH: "Max synth per pool depth",
  MAXSYNTHPERASSETDEPTH: "Max synth per asset depth",
  MAXNODETOCHURNOUTFORLOWVERSION: "Low-version churn-outs",
  TVLCAPBASISPOINTS: "TVL cap",
  NEXTCHAIN: "Next chain",
  MEMOLESSTXNCOST: "Memoless tx cost",
  WASMDEPLOYENABLED: "Wasm deploy"
}

// "TORANCHOR-BSC-USDT-0X55D3…" -> "TOR price anchor: BSC.USDT".
function voteTitle(o) {
  if (o.adr) return "ADR " + o.adr.number + (o.adr.title ? ": " + o.adr.title : "")
  var parts = String(o.key).split("-")
  var head = VOTE_NAMES[parts[0]] || parts[0]
  var rest = parts.slice(1).filter(function(x) { return !/^0X[0-9A-F]+$/i.test(x) && x.length < 20 })
  return head + (rest.length ? ": " + rest.join(".") : "")
}

function voteLines(sum, now) {
  var v = sum.votes
  if (!v) return ["No votes read yet. Open the Votes tab, or run: omathor votes fetch"]
  var out = ["Votes of " + v.active + " active nodes; " + v.need + " agreeing ones set a value. Read " + ago(v.fetchedAt, now) + "."]
  out.push("")
  out.push("Closest to passing")
  for (var i = 0; i < v.open.length; i++) {
    var o = v.open[i]
    out.push("  " + voteTitle(o) + ": " + o.top.n + " of " + v.need + " for " + group(o.top.v) + (o.others ? ", " + o.others + " for other values" : ""))
    if (o.adr && (o.adr.status || o.adr.summary)) out.push("    " + [o.adr.status, o.adr.summary].filter(function(x) { return x }).join(". "))
    for (var m = 0; m < o.mine.length; m++) {
      var mv = o.mine[m]
      out.push("    Your node " + shortAddress(mv.node) + ": " + (mv.voted ? "voted " + group(mv.v) : "has not voted"))
    }
  }
  if (v.inForce.length) {
    out.push("")
    out.push("In force by node vote")
    for (var f = 0; f < v.inForce.length; f++) out.push("  " + voteTitle(v.inForce[f]) + " = " + group(v.inForce[f].v))
  }
  return out
}

// What the Votes tab draws.
function votesView(sum, now) {
  var v = sum ? sum.votes : null
  if (!v) return null
  var open = []
  for (var i = 0; i < v.open.length; i++) {
    var o = v.open[i]
    var mine = []
    for (var m = 0; m < o.mine.length; m++) {
      var mv = o.mine[m]
      mine.push({
        text: (o.mine.length > 1 ? "Your node " + shortAddress(mv.node) : "Your node") + ": "
          + (mv.voted ? (mv.agrees ? "voted for it" : "voted " + group(mv.v)) : "has not voted"),
        voted: mv.voted
      })
    }
    // One dim line: the ADR's status, the value unless it is a plain yes
    // (1) to something not yet set, and how many voted otherwise.
    var bits = []
    if (o.adr && o.adr.status) bits.push(o.adr.status)
    if (o.top.v !== 1 || o.inForce !== null) bits.push("for " + group(o.top.v) + (o.inForce !== null ? ", now " + group(o.inForce) : ""))
    if (o.others) bits.push(o.others + " voted otherwise")
    var named = !o.adr && voteTitle(o) !== o.key
    open.push({
      title: voteTitle(o),
      key: named ? o.key : "",
      count: o.top.n + " / " + v.need,
      progress: o.progress,
      close: v.need - o.top.n <= 3,
      detail: bits.join("  ·  "),
      summary: o.adr ? o.adr.summary : "",
      url: o.adr ? o.adr.url : "",
      mine: mine
    })
  }
  var forced = v.inForce.map(function(f) { return { title: voteTitle(f), value: group(f.v), url: f.adr ? f.adr.url : "" } })
  return {
    tiles: [
      tile("Active nodes", String(v.active), "their votes count"),
      tile("To pass", String(v.need), "2/3 agreeing"),
      tile("In force", String(v.inForce.length), "set by node vote")
    ],
    open: open,
    inForce: forced,
    asOf: v.fetchedAt ? (now - v.fetchedAt < 60000 ? "Read just now" : "Read " + ago(v.fetchedAt, now)) : ""
  }
}

// ----- THORNames -----

// Names are registered for years: "6y 6m", "45 days", then hours.
function longDuration(seconds) {
  var days = Math.floor(Math.max(0, num(seconds)) / 86400)
  if (days >= 365) {
    var years = Math.floor(days / 365)
    var months = Math.floor((days - years * 365) / 30.4)
    return years + "y" + (months ? " " + months + "m" : "")
  }
  if (days >= 30) return days + " days"
  return duration(seconds)
}

function readAgo(ms, now) {
  return now - ms < 60000 ? "Read just now" : "Read " + ago(ms, now)
}

var NAME_WARN_DAYS = 30
var NAME_ALERT_DAYS = 7

// "ETH.USDC-0XA0B8…" -> "ETH.USDC"; "." and "" mean none is set.
function assetName(value) {
  var a = text(value, 80)
  if (a === "." || a === "") return ""
  return a.replace(/-0X[0-9A-F]+$/i, "")
}

// One name as saved by `omathor names refresh`, with its expiry worked out
// from the current height, so the countdown moves without asking again.
function nameInfo(entry, rec, opts, height, spb, nowMs) {
  var r = rec && typeof rec === "object" ? rec : null
  var owner = r ? cleanAddress(r.owner) : ""
  var out = {
    name: entry.name,
    via: entry.owner,
    fetched: !!(r && num(r.fetchedAt) > 0),
    fetchedAt: r ? num(r.fetchedAt) * 1000 : 0,
    registered: !!(r && r.found === true),
    error: r ? text(r.error, 160) : "",
    owner: isAddress(owner) ? owner : "",
    mine: isAddress(owner) && opts.addresses.indexOf(owner) !== -1,
    expire: r ? num(r.expire) : 0,
    blocksLeft: 0,
    secondsLeft: 0,
    expiresMs: 0,
    known: false,
    level: "",
    preferred: r ? assetName(r.preferred) : "",
    threshold: r ? num(r.threshold) : 0,
    collector: r ? num(r.collector) : 0,
    aliases: []
  }
  var aliases = r && Array.isArray(r.aliases) ? r.aliases : []
  for (var i = 0; i < aliases.length && i < 30; i++) {
    if (!aliases[i] || typeof aliases[i] !== "object") continue
    out.aliases.push({ chain: text(aliases[i].chain, 12), address: text(aliases[i].address, 120) })
  }
  // A name that is not registered may just be a typo, so it does not
  // colour the bar.
  if (!out.registered) return out
  if (height > 0 && out.expire > 0) {
    out.known = true
    out.blocksLeft = out.expire - height
    out.secondsLeft = Math.max(0, out.blocksLeft * (spb || BLOCK_SECONDS))
    out.expiresMs = num(nowMs) + out.secondsLeft * 1000
    if (out.blocksLeft <= 0 || out.secondsLeft < NAME_ALERT_DAYS * 86400) out.level = "alert"
    else if (out.secondsLeft < NAME_WARN_DAYS * 86400) out.level = "warn"
  }
  return out
}

function namesFor(opts, namesData, height, spb, nowMs) {
  var items = namesData && namesData.items && typeof namesData.items === "object" ? namesData.items : {}
  var out = []
  for (var i = 0; i < opts.names.length; i++) {
    var nm = opts.names[i].name
    out.push(nameInfo(opts.names[i], Object.prototype.hasOwnProperty.call(items, nm) ? items[nm] : null, opts, height, spb, nowMs))
  }
  return out
}

function nameIssue(n) {
  if (!n.level) return ""
  if (n.blocksLeft <= 0) return "THORName " + n.name + " has expired"
  return "THORName " + n.name + " expires in " + longDuration(n.secondsLeft)
}

function summarize(snap, options, nowMs, namesData, votesData) {
  var opts = settings(options)
  var now = num(nowMs) || Date.now()
  var out = {
    version: 1,
    computedAt: now,
    hasData: false,
    fetchedAt: 0,
    stale: true,
    error: "",
    source: "",
    level: "unknown",
    issues: [],
    currency: opts.currency,
    price: 0,
    height: 0,
    blocked: false,
    churn: null,
    chains: [],
    versions: [],
    pools: [],
    lowVersion: null,
    upgrades: [],
    security: null,
    nodes: null,
    bonds: [],
    names: namesFor(opts, namesData, 0, 0, now),
    totals: { bond: 0, reward: 0 }
  }
  if (!snap || typeof snap !== "object") {
    out.text = textLines(out, opts, now)
    return out
  }
  out.error = text(snap.error, 200)
  out.fetchedAt = num(snap.fetchedAt) * 1000
  out.source = text(snap.source, 120)
  var block = snap.block || {}
  var height = num(block.height) || 0
  if (!height || !snap.mimir || !Array.isArray(snap.vaults)) {
    out.text = textLines(out, opts, now)
    return out
  }
  out.hasData = true
  out.height = height
  out.stale = now - out.fetchedAt > STALE_AFTER * 1000
  var blockMs = blockTimeMs(block)
  var mimir = snap.mimir
  out.blockAge = blockMs ? Math.max(0, (out.fetchedAt - blockMs) / 1000) : 0
  out.blocked = halted(mimir, "HALTTHORCHAIN", height) || (blockMs > 0 && out.blockAge > STALL_AFTER)
  out.price = snap.network ? num(snap.network.runePriceInTor) / UNIT : 0
  out.churn = churnInfo(snap, height, blockMs, now)
  out.chains = chainInfo(snap, height)
  out.queue = snap.queue || { swap: 0, outbound: 0, internal: 0 }
  out.thorVersion = snap.thorVersion || { current: "", next: "" }
  out.vaults = { active: 0, retiring: 0, members: 0 }
  for (var v = 0; v < snap.vaults.length; v++) {
    if (snap.vaults[v].status === "ActiveVault") {
      out.vaults.active++
      out.vaults.members += num(snap.vaults[v].members)
    } else if (snap.vaults[v].status === "RetiringVault") {
      out.vaults.retiring++
    }
  }
  out.flags = {
    bondPaused: halted(mimir, "PAUSEBOND", height),
    unbondPaused: halted(mimir, "PAUSEUNBOND", height),
    tradingHalted: halted(mimir, "HALTTRADING", height),
    chainsHalted: halted(mimir, "HALTCHAINGLOBAL", height),
    signingHalted: halted(mimir, "HALTSIGNING", height)
  }
  out.bondApy = snap.midgardNetwork ? num(snap.midgardNetwork.bondingAPY) : 0
  // The incentive pendulum: the bond that secures the vaults against what
  // is in them. Below 1, more of the rewards go to nodes.
  var net = snap.network || {}
  var mnet = snap.midgardNetwork || {}
  out.security = {
    effectiveBond: num(net.effectiveSecurityBond),
    vaultsLiquidity: num(net.vaultsLiquidity),
    ratio: num(net.vaultsLiquidity) > 0 ? num(net.effectiveSecurityBond) / num(net.vaultsLiquidity) : 0,
    poolShare: mnet.poolShareFactor === undefined ? -1 : num(mnet.poolShareFactor),
    pooled: num(mnet.totalPooledRune),
    reserve: num(net.totalReserve)
  }
  out.upgrades = []
  var proposals = Array.isArray(snap.upgrades) ? snap.upgrades : []
  for (var u = 0; u < proposals.length && u < 5; u++) {
    var up = proposals[u] || {}
    var upHeight = num(up.height)
    out.upgrades.push({
      name: text(up.name, 40),
      height: upHeight,
      approved: up.approved === true,
      percent: num(up.percent),
      toQuorum: num(up.toQuorum),
      past: upHeight > 0 && upHeight <= height,
      secondsLeft: Math.max(0, (upHeight - height) * out.churn.secondsPerBlock)
    })
  }

  var issues = []
  var add = function(level, line) { issues.push({ level: level, text: line }) }
  if (out.blocked) add("alert", out.blockAge > STALL_AFTER ? "THORChain has made no block for " + duration(out.blockAge) : "THORChain is halted")
  if (out.churn.paused) add("warn", "Churning is halted")
  if (out.flags.tradingHalted) add("warn", "Trading is halted on every chain")
  if (out.flags.chainsHalted) add("warn", "Every chain is halted")
  if (out.flags.signingHalted) add("warn", "Outbound signing is halted")
  if (out.flags.bondPaused) add("warn", "Bonding is paused")
  if (out.flags.unbondPaused) add("warn", "Unbonding is paused")
  var stopped = []
  for (var c = 0; c < out.chains.length; c++) {
    if (out.chains[c].state !== "ok" && out.chains[c].state !== "lp") stopped.push(out.chains[c].chain + " " + CHAIN_STATES[out.chains[c].state].toLowerCase())
  }
  if (stopped.length) add("warn", stopped.join(", "))
  for (var up2 = 0; up2 < out.upgrades.length; up2++) {
    var p2 = out.upgrades[up2]
    if (p2.approved && !p2.past && p2.secondsLeft < 3 * 86400) {
      add("warn", "Chain upgrade " + p2.name + " at block " + group(p2.height) + ", in " + duration(p2.secondsLeft) + "; the chain halts for it")
    }
  }

  // A snapshot written by an earlier version may hold any address.
  var nodes = (Array.isArray(snap.nodes) ? snap.nodes : []).filter(function(n) { return n && isAddress(n.address) })
  if (nodes.length) {
    var active = nodes.filter(function(n) { return n.status === "Active" })
    var maxVersion = ""
    var slashes = []
    var totalBond = 0
    for (var a = 0; a < active.length; a++) {
      if (compareVersions(active[a].version, maxVersion) > 0) maxVersion = text(active[a].version, 20)
      slashes.push(num(active[a].slash))
      totalBond += num(active[a].bond)
    }
    // Versions among active nodes. THORNode's current version is the lowest
    // of them, so the network moves on only once every active node runs the
    // newer one.
    var byVersion = dict()
    for (var vv = 0; vv < active.length; vv++) {
      var ver = text(active[vv].version, 20) || "?"
      byVersion[ver] = (byVersion[ver] || 0) + 1
    }
    out.versions = Object.keys(byVersion).map(function(k) { return { version: k, count: byVersion[k] } })
      .sort(function(x, y) { return compareVersions(y.version, x.version) })
    out.nodes = {
      counts: nodeCounts(nodes),
      totalActiveBond: totalBond,
      medianSlash: median(slashes),
      maxVersion: maxVersion,
      fetchedAt: num(snap.nodesAt) * 1000
    }
    out.lowVersion = lowVersionInfo(snap, height, out.churn.secondsPerBlock)
    if (out.lowVersion) {
      out.lowVersion.behind = active.filter(function(an) { return compareVersions(an.version, out.lowVersion.minVersion) < 0 }).length
    }
    var ctx = {
      lowVersion: out.lowVersion,
      height: height, spb: out.churn.secondsPerBlock, churn: out.churn, maxVersion: maxVersion,
      ranks: churnRanks(active), activeCount: active.length
    }
    for (var b = 0; b < opts.addresses.length; b++) {
      var bond = bondsFor(opts.addresses[b], nodes, ctx)
      out.bonds.push(bond)
      out.totals.bond += bond.bond
      out.totals.reward += bond.reward
      for (var r = 0; r < bond.nodes.length; r++) {
        var row = bond.nodes[r]
        for (var k = 0; k < row.issues.length; k++) add(row.level, shortAddress(row.node) + ": " + row.issues[k])
      }
    }
  } else {
    for (var e = 0; e < opts.addresses.length; e++) {
      out.bonds.push({ address: opts.addresses[e], nodes: [], bond: 0, reward: 0, level: "ok", found: false })
    }
  }

  out.names = namesFor(opts, namesData, height, out.churn.secondsPerBlock, now)
  for (var nm = 0; nm < out.names.length; nm++) {
    var issue = nameIssue(out.names[nm])
    if (issue) add(out.names[nm].level, issue)
  }

  out.votes = votesFor(votesData, out)
  out.pools = poolsFor(snap, out)

  out.issues = issues
  var level = "ok"
  for (var i = 0; i < issues.length; i++) level = worse(level, issues[i].level)
  out.level = out.stale ? "unknown" : level
  out.text = textLines(out, opts, now)
  return out
}

// ----- Rows for the panel and lines for the command -----

// A row is a title with a value on its right and a dim line under it.
// `level` colours the title; `url` makes it open in the explorer.
function rowOf(title, right, subtitle, level, url) {
  var lines = String(subtitle || "").split("\n").map(function(l) { return text(l, 200) }).filter(function(l) { return l !== "" })
  return { kind: "row", title: text(title), right: text(right, 60), subtitle: lines.slice(0, 8).join("\n"), level: level || "", url: url || "" }
}

function headerOf(title, right) {
  return { kind: "header", title: text(title), right: text(right, 60), subtitle: "", level: "", url: "" }
}

var CHURN_TITLES = {
  countdown: "Next churn",
  due: "Churn is due",
  churning: "Churning",
  paused: "Churning is halted"
}

function networkRows(sum, opts, now) {
  if (!sum.hasData) return []
  var c = sum.churn
  var rows = []
  rows.push(headerOf("Churn"))
  var churnRight = sum.blocked ? "blocked" : (c.state === "countdown" ? "in " + duration(c.secondsLeft) : "")
  var churnSub = c.state === "countdown"
    ? "Block " + group(c.nextHeight) + ", " + percent(c.elapsed, 0) + " of the cycle done"
    : (c.state === "paused" ? "Paused by the admin mimir HALTCHURNING; no countdown until it is lifted"
      : (c.state === "churning" ? "Vaults are migrating to the new node set"
        : "Past block " + group(c.nextHeight) + "; the network retries until it succeeds"))
  rows.push(rowOf(sum.blocked ? "Chain is not producing blocks" : CHURN_TITLES[c.state], churnRight, churnSub,
    sum.blocked ? "alert" : (c.state === "paused" ? "warn" : "")))
  rows.push(rowOf("Last churn", c.lastMs ? (c.lastExact ? "" : "about ") + ago(c.lastMs, now) : "",
    "Block " + group(c.lastHeight) + (c.lastMs ? ", " + dateText(c.lastMs) : "") + ", interval " + group(c.interval) + " blocks"))

  rows.push(headerOf("Network"))
  rows.push(rowOf("Block height", group(sum.height), sum.blockAge > 60 ? "Last block " + duration(sum.blockAge) + " before the fetch" : "", sum.blocked ? "alert" : ""))
  var f = sum.flags
  var halts = []
  if (f.tradingHalted) halts.push("trading")
  if (f.chainsHalted) halts.push("chains")
  if (f.signingHalted) halts.push("signing")
  rows.push(rowOf("Trading", halts.length ? "halted" : "open", halts.length ? "Halted: " + halts.join(", ") : "", halts.length ? "warn" : ""))
  rows.push(rowOf("Bonding", f.bondPaused ? "paused" : "open", f.unbondPaused ? "Unbonding is paused too" : (f.bondPaused ? "Unbonding still works" : ""), f.bondPaused || f.unbondPaused ? "warn" : ""))
  rows.push(rowOf("Vaults", sum.vaults.active + " active" + (sum.vaults.retiring ? ", " + sum.vaults.retiring + " retiring" : ""),
    sum.vaults.active ? "About " + Math.round(sum.vaults.members / sum.vaults.active) + " nodes in each" : ""))
  rows.push(rowOf("Outbound queue", group(num(sum.queue.outbound)) + " out, " + group(num(sum.queue.swap)) + " swaps", ""))
  if (sum.nodes) {
    var n = sum.nodes.counts
    rows.push(rowOf("Nodes", n.Active + " active, " + n.Standby + " standby",
      (n.Ready ? n.Ready + " ready, " : "") + n.Disabled + " disabled, " + n.Whitelisted + " whitelisted"))
    rows.push(rowOf("Total active bond", money(sum.nodes.totalActiveBond, opts.currency, sum.price), ""))
  }
  if (sum.price > 0) rows.push(rowOf("RUNE price", "$" + fixed(sum.price, 3), ""))
  if (sum.bondApy > 0) rows.push(rowOf("Bond APY", percent(sum.bondApy, 1), "Network average, from Midgard"))
  var sec = securityView(sum, opts)
  if (sec) {
    rows.push(headerOf("Security"))
    for (var t = 0; t < sec.tiles.length; t++) {
      rows.push(rowOf(sec.tiles[t].label, sec.tiles[t].value, sec.tiles[t].sub, sec.tiles[t].level))
    }
  }
  var up = upgradeView(sum)
  rows.push(headerOf("Upgrade"))
  rows.push(rowOf(up.title, up.value, [up.sub, up.versions].filter(function(x) { return x }).join("\n")))
  if (up.lowVersion) rows.push(rowOf(up.lowVersion.text, "", "", up.lowVersion.level))
  for (var q = 0; q < up.proposals.length; q++) rows.push(rowOf(up.proposals[q].text, "", "", up.proposals[q].level))
  return rows
}

function bondRows(sum, opts) {
  var rows = []
  if (!opts.addresses.length) return rows
  for (var b = 0; b < sum.bonds.length; b++) {
    var bond = sum.bonds[b]
    rows.push(headerOf(shortAddress(bond.address), bond.found ? money(bond.bond, opts.currency, sum.price) : ""))
    if (!sum.nodes) {
      rows.push(rowOf("Waiting for the node list", "", ""))
      continue
    }
    if (!bond.found) {
      rows.push(rowOf("No bond found", "", "This address is not a bond provider or operator of any node.", "", explorerUrl("address", bond.address)))
      continue
    }
    for (var r = 0; r < bond.nodes.length; r++) {
      var n = bond.nodes[r]
      var lines = []
      lines.push(n.status + ", " + percent(n.share, 1) + " of the node" + (n.operator ? ", you operate it" : "") + ", fee " + percent(n.fee, 0)
        + (n.version ? ", version " + n.version : ""))
      if (n.status === "Active") {
        lines.push("Earned since the churn " + money(n.reward, opts.currency, sum.price) + (n.apy > 0 ? ", APY " + percent(n.apy, 1) : ""))
        if (n.ranks) lines.push("Slash " + group(n.slash) + " (median " + group(Math.round(sum.nodes.medianSlash)) + "), "
          + ordinal(n.ranks.age) + " oldest, " + ordinal(n.ranks.slash) + " worst, " + ordinal(n.ranks.bond) + " lowest bond of " + n.activeCount)
      }
      for (var k = 0; k < n.issues.length; k++) lines.push(n.issues[k])
      rows.push(rowOf("Node " + shortAddress(n.node), money(n.bond, opts.currency, sum.price), lines.join("\n"), n.level === "ok" ? "" : n.level, explorerUrl("node", n.node)))
    }
    if (bond.nodes.length > 1) rows.push(rowOf("Earned since the churn", money(bond.reward, opts.currency, sum.price), ""))
  }
  if (sum.bonds.length > 1 && sum.nodes) {
    rows.push(headerOf("All addresses", money(sum.totals.bond, opts.currency, sum.price)))
    rows.push(rowOf("Earned since the churn", money(sum.totals.reward, opts.currency, sum.price), ""))
  }
  return rows
}

function nameExpiry(n, now) {
  if (!n.known) return ""
  if (n.blocksLeft <= 0) return "Expired"
  return "in " + longDuration(n.secondsLeft)
}

function nameRows(sum, opts, now) {
  var rows = []
  for (var i = 0; i < sum.names.length; i++) {
    var n = sum.names[i]
    var lines = []
    if (!n.fetched) {
      lines.push(n.error ? "Not read yet: " + n.error : "Not read yet")
    } else if (!n.registered) {
      lines.push("Not registered")
    } else {
      if (n.known) lines.push("Expires at block " + group(n.expire) + (n.blocksLeft > 0 ? ", about " + dateText(n.expiresMs) : ""))
      if (n.owner) lines.push("Owner " + shortAddress(n.owner) + (n.mine ? " (you)" : ""))
      var payChain = n.preferred ? n.preferred.split(".")[0] : "THOR"
      var payable = n.aliases.some(function(x) { return x.chain === payChain })
      if (!payable) lines.push("Affiliate fees are skipped: no " + payChain + " address set")
      else if (n.preferred) lines.push("Affiliate fees waiting " + money(n.collector, opts.currency, sum.price)
        + (n.threshold > 0 ? " of " + money(n.threshold, opts.currency, sum.price) : "") + ", paid out in " + n.preferred)
      else lines.push("Affiliate fees paid in RUNE to the THOR address")
      for (var a = 0; a < n.aliases.length; a++) lines.push(n.aliases[a].chain + " " + n.aliases[a].address)
    }
    if (n.fetched) lines.push(readAgo(n.fetchedAt, now) + (n.error ? "; the last refresh failed: " + n.error : ""))
    rows.push(rowOf(n.name, nameExpiry(n, now), lines.join("\n"), n.level))
  }
  return rows
}

function ordinal(n) {
  var v = num(n)
  var s = ["th", "st", "nd", "rd"]
  var m = v % 100
  return v + (s[(m - 20) % 10] || s[m] || s[0])
}

function chainRows(sum) {
  var rows = []
  for (var i = 0; i < sum.chains.length; i++) {
    var c = sum.chains[i]
    var sub = []
    if (c.observed) sub.push("Observed to block " + group(c.observed))
    if (c.gas.replace(/\s/g, "")) sub.push("Gas " + c.gas)
    rows.push(rowOf(c.chain, CHAIN_STATES[c.state], sub.join(", "), c.state === "ok" || c.state === "lp" ? "" : "warn"))
  }
  return rows
}

function statusLines(sum, opts, now) {
  if (!sum.hasData) return [sum.error ? "No data: " + sum.error : "No data yet."]
  var out = []
  var word = { ok: "Healthy", warn: "Degraded", alert: "Alert", unknown: "Stale data" }[sum.level]
  out.push("THORChain: " + word + ", block " + group(sum.height) + (sum.price > 0 ? ", RUNE $" + fixed(sum.price, 3) : ""))
  var c = sum.churn
  out.push("Churn: " + (c.state === "countdown" ? "next in " + duration(c.secondsLeft) : churnLabel(c, sum.blocked))
    + (c.lastMs ? ", last " + ago(c.lastMs, now) : ""))
  for (var i = 0; i < sum.issues.length; i++) out.push((sum.issues[i].level === "alert" ? "! " : "- ") + sum.issues[i].text)
  if (opts.addresses.length && sum.nodes) {
    out.push("Bonded " + money(sum.totals.bond, opts.currency, sum.price) + ", earned since the churn " + money(sum.totals.reward, opts.currency, sum.price))
  }
  if (sum.stale) out.push("Data from " + ago(sum.fetchedAt, now) + (sum.error ? ": " + sum.error : ""))
  return out
}

function rowsToLines(rows) {
  var out = []
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i]
    if (r.kind === "header") {
      if (out.length) out.push("")
      out.push(r.title + (r.right ? "  " + r.right : ""))
      continue
    }
    out.push("  " + r.title + (r.right ? ": " + r.right : ""))
    var sub = r.subtitle ? r.subtitle.split("\n") : []
    for (var k = 0; k < sub.length; k++) out.push("    " + sub[k])
  }
  return out
}

function textLines(sum, opts, now) {
  var bonds = bondRows(sum, opts)
  return {
    status: statusLines(sum, opts, now),
    network: sum.hasData ? rowsToLines(networkRows(sum, opts, now)) : statusLines(sum, opts, now),
    bonds: opts.addresses.length ? rowsToLines(bonds) : ["No bond addresses. Add them in the panel's settings."],
    chains: sum.hasData ? rowsToLines(chainRows(sum)) : statusLines(sum, opts, now),
    names: opts.names.length ? rowsToLines(nameRows(sum, opts, now)) : ["No THORNames. Add them in the panel's settings."],
    votes: sum.hasData ? voteLines(sum, now) : statusLines(sum, opts, now),
    pools: sum.hasData ? (sum.pools.length ? rowsToLines(poolRows(sum, opts)) : ["No pool list yet."]) : statusLines(sum, opts, now)
  }
}

// ----- Panel views -----
// The panel draws these: a big readout, small labelled tiles, a card per
// node. The command prints the rows above instead.

// 101,410,584 -> "101.4M"; for tiles where a full figure is too wide.
function compact(value) {
  var n = Math.abs(num(value))
  var sign = num(value) < 0 ? "-" : ""
  if (n >= 1e9) return sign + fixed(n / 1e9, 2) + "B"
  if (n >= 1e6) return sign + fixed(n / 1e6, 1) + "M"
  if (n >= 1e4) return sign + fixed(n / 1e3, n >= 1e5 ? 0 : 1) + "K"
  return sign + fixed(n, n >= 100 || n === 0 ? 0 : (n >= 1 ? 2 : 4))
}

function compactMoney(units, currency, price) {
  var rune = num(units) / UNIT
  if (currency === "USD" && price > 0) return "$" + compact(rune * price)
  return compact(rune) + " RUNE"
}

function tile(label, value, sub, level) {
  return { label: text(label, 30), value: text(value, 40), sub: text(sub, 60), level: level || "" }
}

function networkView(sum, opts, now) {
  var o = settings(opts)
  if (!sum || !sum.hasData) return null
  var c = sum.churn
  var hero
  if (sum.blocked) hero = { label: "Chain", value: "Blocked", level: "alert", note: "No block for " + duration(sum.blockAge) }
  else if (c.state === "paused") hero = { label: "Churn", value: "Halted", level: "warn", note: "Admin mimir HALTCHURNING is set, so there is no countdown" }
  else if (c.state === "churning") hero = { label: "Churn", value: "Churning", level: "", note: "Vaults are migrating to the new node set" }
  else if (c.state === "due") hero = { label: "Churn", value: "Due", level: "", note: "Past block " + group(c.nextHeight) + ", retrying until it succeeds" }
  else hero = { label: "Next churn", value: duration(c.secondsLeft), level: "", note: "At block " + group(c.nextHeight) }
  var side = [
    tile("Last churn", c.lastMs ? (c.lastExact ? "" : "~") + duration(c.secondsSince) + " ago" : "-", c.lastMs ? dateText(c.lastMs) : ""),
    tile("Block", group(sum.height), sum.blockAge > 60 ? duration(sum.blockAge) + " old" : "")
  ]
  var f = sum.flags
  var tradingHalted = f.tradingHalted || f.chainsHalted || f.signingHalted
  var stats = []
  if (sum.nodes) {
    var n = sum.nodes.counts
    stats.push(tile("Nodes", n.Active + " active", n.Standby + " standby"))
  }
  stats.push(tile("Vaults", sum.vaults.active + (sum.vaults.retiring ? " + " + sum.vaults.retiring : ""),
    sum.vaults.retiring ? "retiring" : (sum.vaults.active ? "~" + Math.round(sum.vaults.members / sum.vaults.active) + " nodes each" : "")))
  stats.push(tile("Queue", group(num(sum.queue.outbound)) + " out", group(num(sum.queue.swap)) + " swaps"))
  stats.push(tile("Trading", tradingHalted ? "Halted" : "Open", "", tradingHalted ? "warn" : ""))
  stats.push(tile("Bonding", f.bondPaused ? "Paused" : "Open", f.unbondPaused ? "unbond paused" : (f.bondPaused ? "unbond open" : ""), f.bondPaused || f.unbondPaused ? "warn" : ""))
  if (sum.price > 0) stats.push(tile("RUNE", "$" + fixed(sum.price, 3), ""))
  if (sum.nodes) stats.push(tile("Total bond", compactMoney(sum.nodes.totalActiveBond, o.currency, sum.price), "active nodes"))
  if (sum.bondApy > 0) stats.push(tile("Bond APY", percent(sum.bondApy, 1), "network"))
  // What the big readout already says is not repeated below it.
  var said = []
  if (c.state === "paused") said.push("Churning is halted")
  if (sum.blocked) said.push("THORChain is halted")
  var attention = []
  for (var i = 0; i < sum.issues.length; i++) {
    var line = text(sum.issues[i].text, 200)
    if (said.indexOf(line) !== -1 || (sum.blocked && /^THORChain has made no block/.test(line))) continue
    attention.push({ level: sum.issues[i].level, text: line })
  }
  return {
    hero: hero,
    side: side,
    progress: c.state === "countdown" && !sum.blocked ? Math.max(0, Math.min(1, c.elapsed)) : -1,
    attention: attention,
    stats: stats,
    security: securityView(sum, o),
    upgrade: upgradeView(sum)
  }
}

function securityView(sum, o) {
  var sec = sum.security
  if (!sec || !(sec.vaultsLiquidity > 0)) return null
  var p = sum.price
  var tiles = [
    tile("Coverage", fixed(sec.ratio, 2) + "×", "bond ÷ vault assets", sec.ratio < 1 ? "warn" : ""),
    tile("Effective bond", compactMoney(sec.effectiveBond, o.currency, p), "lowest 2/3 of nodes"),
    tile("Vault assets", compactMoney(sec.vaultsLiquidity, o.currency, p), "what the bond secures")
  ]
  if (sec.poolShare >= 0) {
    // Rounded so the two halves add up to 100%.
    var toNodes = Math.round((1 - sec.poolShare) * 100)
    tiles.push(tile("Rewards", toNodes + "% nodes", (100 - toNodes) + "% to pools"))
  }
  if (sec.pooled > 0) tiles.push(tile("Pooled", compactMoney(sec.pooled, o.currency, p), "RUNE in pools"))
  if (sec.reserve > 0) tiles.push(tile("Reserve", compactMoney(sec.reserve, o.currency, p), "protocol"))
  var note = sec.ratio < 1
    ? "The bond is worth less than what it secures, so the pendulum sends more of the rewards to nodes."
    : "The bond covers what it secures; the pendulum shifts rewards towards pools as it grows."
  return { tiles: tiles, note: note }
}

function upgradeView(sum) {
  var ver = sum.thorVersion || {}
  var versions = sum.versions || []
  var active = 0
  for (var i = 0; i < versions.length; i++) active += versions[i].count
  var current = text(ver.current, 20)
  var top = versions.length ? versions[0] : null
  var out = { title: "Version", value: current, sub: "", progress: -1, versions: "", lowVersion: null, proposals: [] }
  if (top && current && compareVersions(top.version, current) > 0) {
    out.title = "Upgrading to " + top.version
    out.value = top.count + " of " + active
    out.sub = "active nodes. The network stays on " + current + " until all of them run it."
    out.progress = active ? top.count / active : 0
  } else if (active) {
    out.sub = "every active node runs it"
  }
  if (versions.length > 1) {
    out.versions = versions.map(function(v) { return v.version + ": " + v.count }).join("  ·  ")
  }
  var low = sum.lowVersion
  if (low && low.minVersion !== current) {
    out.versions = (out.versions ? out.versions + "\n" : "") + low.minVersion + " required to join since " + duration(low.secondsSince) + " ago"
    out.lowVersion = {
      level: low.eligible && low.behind > 0 ? "warn" : "",
      text: low.eligible
        ? (low.behind > 0
          ? low.behind + " active node" + (low.behind === 1 ? " is" : "s are") + " below it and can be churned out for it, up to " + low.perChurn + " per churn"
          : "Every active node runs it")
        : "Nodes below it can be churned out from " + duration(low.secondsUntil) + " from now, up to " + low.perChurn + " per churn"
    }
  }
  for (var j = 0; j < (sum.upgrades || []).length; j++) {
    var u = sum.upgrades[j]
    if (u.past) continue
    out.proposals.push({
      level: u.approved ? "warn" : "",
      text: "Upgrade " + u.name + " at block " + group(u.height) + " (in " + duration(u.secondsLeft) + "): "
        + (u.approved ? "approved; the chain halts for it" : percent(u.percent, 0) + " approved, " + u.toQuorum + " more nodes needed")
    })
  }
  return out
}

var STATUS_LEVEL = { Active: "", Ready: "warn", Standby: "warn", Whitelisted: "warn", Disabled: "alert" }

function bondView(sum, opts) {
  var o = settings(opts)
  var view = { empty: !o.addresses.length, waiting: !!(sum && sum.hasData && !sum.nodes), addresses: [], totals: null }
  if (!sum || !sum.hasData || !sum.nodes) return view
  var p = sum.price
  for (var b = 0; b < sum.bonds.length; b++) {
    var bond = sum.bonds[b]
    var weighted = 0
    var nodes = []
    for (var r = 0; r < bond.nodes.length; r++) {
      var n = bond.nodes[r]
      weighted += n.apy * n.bond
      var cells = [
        tile("Share", percent(n.share, 1), n.operator ? "operator" : ""),
        tile("Fee", percent(n.fee, 0)),
        tile("Version", n.version || "-", "", n.issues.join(" ").indexOf("Runs ") !== -1 ? (n.level === "alert" ? "alert" : "warn") : "")
      ]
      if (n.status === "Active") {
        var median = Math.round(sum.nodes.medianSlash)
        cells.push(tile("Slash", group(n.slash), "median " + group(median), median > 0 && n.slash > median * 2 ? "warn" : ""))
      }
      var risk = null
      if (n.status === "Active" && n.ranks) {
        var first = Math.min(n.ranks.age, n.ranks.slash, n.ranks.bond)
        risk = {
          value: first === 1 ? "High" : (first <= 3 ? "Medium" : "Low"),
          level: first === 1 ? "warn" : "",
          sub: ordinal(n.ranks.age) + " oldest  ·  " + ordinal(n.ranks.slash) + " worst slash  ·  " + ordinal(n.ranks.bond) + " lowest bond, of " + n.activeCount
        }
      }
      var issues = []
      for (var k = 0; k < n.issues.length; k++) issues.push({ level: n.level === "ok" ? "warn" : n.level, text: n.issues[k] })
      nodes.push({
        node: n.node,
        short: shortAddress(n.node),
        url: explorerUrl("node", n.node),
        status: n.status,
        level: n.level === "ok" ? (STATUS_LEVEL[n.status] || "") : n.level,
        amount: money(n.bond, o.currency, p),
        // With one node, the address's tiles above already say this.
        earned: n.status === "Active" && bond.nodes.length > 1 ? money(n.reward, o.currency, p) + (n.apy > 0 ? "  ·  APY " + percent(n.apy, 1) : "") : "",
        cells: cells,
        risk: risk,
        issues: issues
      })
    }
    view.addresses.push({
      address: bond.address,
      short: shortAddress(bond.address),
      url: explorerUrl("address", bond.address),
      found: bond.found,
      stats: bond.found ? [
        tile("Bonded", compactMoney(bond.bond, o.currency, p)),
        tile("Earned", compactMoney(bond.reward, o.currency, p), "since the churn"),
        tile("APY", bond.bond > 0 ? percent(weighted / bond.bond, 1) : "-", "bond-weighted")
      ] : [],
      nodes: nodes
    })
  }
  if (sum.bonds.length > 1) {
    view.totals = [
      tile("Bonded", compactMoney(sum.totals.bond, o.currency, p), sum.bonds.length + " addresses"),
      tile("Earned", compactMoney(sum.totals.reward, o.currency, p), "since the churn")
    ]
  }
  return view
}

var CHAIN_SHORT = { ok: "OK", halted: "Halted", signing: "Out halted", trading: "No trading", lp: "LP paused" }

function chainsView(sum) {
  if (!sum || !sum.hasData) return []
  var out = []
  for (var i = 0; i < sum.chains.length; i++) {
    var c = sum.chains[i]
    out.push({
      chain: c.chain,
      state: c.state === "ok" ? "" : CHAIN_SHORT[c.state],
      level: c.state === "ok" ? "" : (c.state === "lp" ? "" : "warn"),
      ok: c.state === "ok",
      // "750000 satsperbyte" -> "750,000 satsperbyte".
      gas: c.gas.replace(/\s/g, "") ? text(c.gas, 30).replace(/^([0-9]+)(\s)/, function(m, n, sp) { return group(n) + sp }) : ""
    })
  }
  return out
}

// A card per THORName on the names tab.
function namesView(sum, opts, now) {
  var o = settings(opts)
  var out = []
  if (!sum || !Array.isArray(sum.names)) return out
  var p = sum.price
  for (var i = 0; i < sum.names.length; i++) {
    var n = sum.names[i]
    var card = {
      name: n.name,
      level: n.level,
      status: "",
      expiry: "",
      expiryLabel: "Expires in",
      expirySub: "",
      fees: null,
      progress: -1,
      owner: "",
      aliases: [],
      more: "",
      note: "",
      asOf: n.fetched ? readAgo(n.fetchedAt, now) : "",
      error: n.error ? "Last refresh failed: " + n.error : "",
      hint: ""
    }
    if (!n.fetched) {
      card.note = n.error ? "" : "Not read yet."
    } else if (!n.registered) {
      card.status = "Not registered"
      card.note = "THORChain has no name like this. It may have expired and been released."
    } else {
      card.status = n.known ? (n.blocksLeft <= 0 ? "Expired" : "") : ""
      card.expiry = n.known ? (n.blocksLeft <= 0 ? "Expired" : longDuration(n.secondsLeft)) : "-"
      if (n.known && n.blocksLeft <= 0) card.expiryLabel = "Expiry"
      card.expirySub = n.known && n.blocksLeft > 0 ? "~" + dateText(n.expiresMs) : (n.known ? "at block " + group(n.expire) : "")
      // THORNode's CanReceiveAffiliateFee: without a payout asset, fees go in
      // RUNE to the name's THOR address; with one, to its address on that
      // asset's chain. Without that address, the fee is skipped.
      var payChain = n.preferred ? n.preferred.split(".")[0] : "THOR"
      var payTo = ""
      for (var pa = 0; pa < n.aliases.length; pa++) {
        if (n.aliases[pa].chain === payChain) payTo = n.aliases[pa].address
      }
      if (!payTo) {
        card.fees = tile("Affiliate fees", "Skipped", "no " + payChain + " address set", "warn")
      } else if (n.preferred) {
        card.fees = tile("Fees waiting", compactMoney(n.collector, o.currency, p),
          n.threshold > 0 ? "of " + compactMoney(n.threshold, o.currency, p) + ", paid in " + n.preferred : "paid in " + n.preferred)
        card.progress = n.threshold > 0 ? Math.max(0, Math.min(1, n.collector / n.threshold)) : -1
      } else {
        card.fees = tile("Affiliate fees", "RUNE", "paid at once to " + shortAddress(payTo))
      }
      card.owner = n.owner ? "Owner " + shortAddress(n.owner) + (n.mine ? "  ·  you" : "") : ""
      for (var a = 0; a < n.aliases.length && a < 3; a++) card.aliases.push({ chain: n.aliases[a].chain, address: shortAddress(n.aliases[a].address) })
      card.more = n.aliases.length > 3 ? "+" + (n.aliases.length - 3) + " more" : (n.aliases.length ? "" : "No chain addresses set")
      if (n.level && o.namesRefresh === "manual") card.hint = "Renewed it? Refresh to check."
    }
    out.push(card)
  }
  return out
}

// The nodes the keyboard can step through on the bond tab, in order.
function bondTargets(view) {
  var out = []
  if (!view) return out
  for (var a = 0; a < view.addresses.length; a++) {
    for (var n = 0; n < view.addresses[a].nodes.length; n++) out.push(view.addresses[a].nodes[n].node)
  }
  return out
}

// ----- Panel -----

var TABS = ["network", "bond", "names", "votes", "pools", "chains"]

function tabs(sum) {
  return [
    { value: "network", label: "Network" },
    { value: "bond", label: "Bonds" },
    { value: "names", label: "Names" },
    { value: "votes", label: "Votes" },
    { value: "pools", label: "Pools" },
    { value: "chains", label: "Chains" }
  ]
}

function nextTab(tab, direction) {
  var i = TABS.indexOf(tab)
  if (i === -1) return TABS[0]
  return TABS[(i + (direction < 0 ? TABS.length - 1 : 1)) % TABS.length]
}

function panelRows(sum, opts, tab, now) {
  if (!sum || !sum.hasData) return []
  if (tab === "bond") return bondRows(sum, settings(opts))
  if (tab === "chains") return chainRows(sum)
  var rows = []
  if (sum.issues.length) {
    rows.push(headerOf("Attention"))
    for (var i = 0; i < sum.issues.length; i++) rows.push(rowOf(sum.issues[i].text, "", "", sum.issues[i].level))
  }
  return rows.concat(networkRows(sum, settings(opts), now))
}

function heroMeta(sum, now) {
  if (!sum || !sum.hasData) return sum && sum.error ? "No data" : "Loading"
  var word = { ok: "Healthy", warn: "Degraded", alert: "Alert", unknown: "Stale data" }[sum.level]
  return word + "  ·  updated " + (now - sum.fetchedAt < 60000 ? "just now" : ago(sum.fetchedAt, now))
}

// ----- Bar -----

function barLabel(sum, opts) {
  var o = settings(opts)
  if (!sum || !sum.hasData || o.barLabel === "none") return ""
  if (o.barLabel === "churn") return churnLabel(sum.churn, sum.blocked)
  if (o.barLabel === "reward") return o.addresses.length && sum.nodes ? shortMoney(sum.totals.reward, o.currency, sum.price) : ""
  return ""
}

// Plain words only: the bar draws its tooltip as rich text.
function tooltip(sum) {
  if (!sum || !sum.hasData) return "Omathor: no data yet"
  var word = { ok: "healthy", warn: "degraded", alert: "needs attention", unknown: "data is stale" }[sum.level]
  return "THORChain " + word
}

// ----- Notifications -----

// What changed between two summaries that is worth a notification. Only
// fresh summaries are compared, so a gap in fetching never fires anything.
function events(prev, next) {
  var out = []
  if (!prev || !next || !prev.hasData || !next.hasData || prev.stale || next.stale) return out
  if (!prev.blocked && next.blocked) out.push({ urgent: true, title: "THORChain stopped", body: "No new block for " + duration(next.blockAge) + "." })
  if (prev.blocked && !next.blocked) out.push({ urgent: false, title: "THORChain is producing blocks again", body: "" })
  var a = prev.churn.state
  var b = next.churn.state
  if (a !== b) {
    if (b === "churning") out.push({ urgent: false, title: "Churn started", body: "Vaults are migrating to the new node set." })
    else if (a === "churning") out.push({ urgent: false, title: "Churn finished", body: "Next churn in " + duration(next.churn.secondsLeft) + "." })
    else if (b === "paused") out.push({ urgent: false, title: "Churning halted", body: "Set by the admin mimir HALTCHURNING." })
    else if (a === "paused") out.push({ urgent: false, title: "Churning resumed", body: "" })
  }
  var before = dict()
  for (var i = 0; i < prev.chains.length; i++) before[prev.chains[i].chain] = prev.chains[i].state
  for (var j = 0; j < next.chains.length; j++) {
    var c = next.chains[j]
    var was = before[c.chain]
    if (was === undefined || was === c.state) continue
    if (c.state === "ok") out.push({ urgent: false, title: c.chain + " resumed", body: "" })
    else if (c.state !== "lp") out.push({ urgent: false, title: c.chain + ": " + CHAIN_STATES[c.state].toLowerCase(), body: "" })
  }
  var nodesBefore = dict()
  for (var p = 0; p < prev.bonds.length; p++) {
    for (var q = 0; q < prev.bonds[p].nodes.length; q++) nodesBefore[prev.bonds[p].nodes[q].node] = prev.bonds[p].nodes[q]
  }
  for (var r = 0; r < next.bonds.length; r++) {
    for (var s = 0; s < next.bonds[r].nodes.length; s++) {
      var n = next.bonds[r].nodes[s]
      var o = nodesBefore[n.node]
      if (!o) continue
      var name = "Node " + shortAddress(n.node)
      if (o.status !== n.status) out.push({ urgent: n.status !== "Active", title: name + " is " + n.status.toLowerCase(), body: "It was " + o.status.toLowerCase() + "." })
      if (!o.jailed && n.jailed) out.push({ urgent: false, title: name + " was jailed", body: "" })
      if (!o.leaving && n.leaving) out.push({ urgent: true, title: name + " is leaving", body: "It churns out at the next churn." })
    }
  }
  var namesBefore = dict()
  var prevNames = Array.isArray(prev.names) ? prev.names : []
  var nextNames = Array.isArray(next.names) ? next.names : []
  for (var t = 0; t < prevNames.length; t++) namesBefore[prevNames[t].name] = prevNames[t]
  for (var u = 0; u < nextNames.length; u++) {
    var nn = nextNames[u]
    var pn = namesBefore[nn.name]
    if (!pn || !pn.known || !nn.known) continue
    if (pn.blocksLeft > 0 && nn.blocksLeft <= 0) out.push({ urgent: true, title: "THORName " + nn.name + " has expired", body: "" })
    else if (pn.secondsLeft >= NAME_ALERT_DAYS * 86400 && nn.secondsLeft < NAME_ALERT_DAYS * 86400 && nn.blocksLeft > 0)
      out.push({ urgent: false, title: "THORName " + nn.name + " expires in " + longDuration(nn.secondsLeft), body: "Renew it before it lapses." })
  }
  return out.slice(0, 5)
}

// notify-send bodies take markup, so anything that looks like it goes.
function notifyText(value) {
  return text(value, 160).replace(/[<>&]/g, " ")
}

function errorText(raw) {
  var lines = String(raw || "").split("\n")
  for (var i = lines.length - 1; i >= 0; i--) {
    var line = text(lines[i].replace(/^omathor:\s*/, ""), 160)
    if (line) return line
  }
  return ""
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PLUGIN_ID: PLUGIN_ID, TABS: TABS, MAX_ADDRESSES: MAX_ADDRESSES, STALE_AFTER: STALE_AFTER, STALL_AFTER: STALL_AFTER,
    text: text, parseJson: parseJson, isAddress: isAddress, cleanAddress: cleanAddress, shortAddress: shortAddress, explorerUrl: explorerUrl,
    validBase: validBase, settings: settings, pluginSettings: pluginSettings, settingsPayload: settingsPayload,
    addAddress: addAddress, removeAddress: removeAddress, isName: isName, addName: addName, removeName: removeName,
    setFoundNames: setFoundNames, namesDue: namesDue, namesToSearch: namesToSearch, namesToForget: namesToForget, assetName: assetName,
    nameRows: nameRows, namesView: namesView,
    poolName: poolName, poolsView: poolsView,
    isOperational: isOperational, adrNumber: adrNumber, voteNodes: voteNodes, votesDue: votesDue, votesView: votesView,
    money: money, shortMoney: shortMoney, percent: percent, duration: duration, compareVersions: compareVersions,
    halted: halted, secondsPerBlock: secondsPerBlock, churnInfo: churnInfo, churnLabel: churnLabel, chainInfo: chainInfo,
    churnRanks: churnRanks, apy: apy, bondsFor: bondsFor, summarize: summarize,
    networkRows: networkRows, bondRows: bondRows, chainRows: chainRows, panelRows: panelRows,
    tabs: tabs, nextTab: nextTab, heroMeta: heroMeta, barLabel: barLabel, tooltip: tooltip, events: events,
    errorText: errorText, notifyText: notifyText, ordinal: ordinal,
    compact: compact, compactMoney: compactMoney, networkView: networkView, bondView: bondView, chainsView: chainsView, bondTargets: bondTargets
  }
}
