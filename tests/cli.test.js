// Run with: node --test tests/*.test.js
// Drives bin/omathor against tests/fake-server.js in throwaway XDG folders.
const test = require("node:test")
const assert = require("node:assert/strict")
const { spawn, spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const Model = require("../Model.js")

const CLI = path.join(__dirname, "..", "bin", "omathor")
const ME = "thor1mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm"
const have = function(cmd) { return spawnSync("sh", ["-c", "command -v " + cmd]).status === 0 }

let server, base, tmp, env

function run(args, extraEnv, input) {
  const out = spawnSync(CLI, args, { env: Object.assign({}, env, extraEnv || {}), input: input || "", encoding: "utf8", timeout: 60000 })
  return { code: out.status, out: out.stdout.trim(), err: out.stderr.trim() }
}
function ok(args, extraEnv, input) {
  const r = run(args, extraEnv, input)
  assert.equal(r.code, 0, args.join(" ") + ": " + r.err)
  return r.out
}
async function requests() { return (await fetch(base + "/__log")).json() }
async function setMode(m) { await fetch(base + "/__mode", { method: "POST", body: m }) }

const stateDir = function() { return path.join(env.XDG_STATE_HOME, "omarchy", "omathor") }
const snapshot = function() { return JSON.parse(fs.readFileSync(path.join(stateDir(), "snapshot.json"), "utf8")) }

test.before(async function() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omathor-test-"))
  fs.mkdirSync(path.join(tmp, "run"), { mode: 0o700 })
  server = spawn(process.execPath, [path.join(__dirname, "fake-server.js")], { stdio: ["ignore", "pipe", "inherit"] })
  const port = await new Promise(function(done) { server.stdout.once("data", function(d) { done(String(d).trim()) }) })
  base = "http://127.0.0.1:" + port
  env = Object.assign({}, process.env, {
    XDG_STATE_HOME: path.join(tmp, "state"), XDG_CONFIG_HOME: path.join(tmp, "config"),
    // The lock and the record of the last uninstall live here: never the real one.
    XDG_RUNTIME_DIR: path.join(tmp, "run"),
    OMATHOR_THORNODE: base, OMATHOR_MIDGARD: base
  })
})

test.after(function() {
  server.kill()
  fs.rmSync(tmp, { recursive: true, force: true })
})

test("status before any fetch says how to get data", function() {
  const r = run(["status"])
  assert.notEqual(r.code, 0)
  assert.match(r.err, /no summary yet/)
})

test("fetch writes a private, trimmed snapshot", function() {
  ok(["fetch"])
  const mode = fs.statSync(stateDir()).mode & 0o777
  assert.equal(mode, 0o700)
  assert.equal(fs.statSync(path.join(stateDir(), "snapshot.json")).mode & 0o777, 0o600)
  const snap = snapshot()
  assert.equal(snap.block.height, 50010)
  // Only nodes with a plain thor1 address are kept.
  assert.deepEqual(snap.nodes.map(function(n) { return n.address }), [
    "thor1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "thor1cccccccccccccccccccccccccccccccccccccc",
    "thor1dddddddddddddddddddddddddddddddddddddd", "thor1eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "thor1gggggggggggggggggggggggggggggggggggggg"
  ])
  // Provider addresses need only the bech32 shape: the contract stays.
  assert.deepEqual(snap.nodes[4].providers, [{ address: "thor1enhmz57mpn4umspa8hqgqwwqpe02q4hpqmqr0k2zftxr8fu3nxmqjy3tqx", bond: 1 }])
  assert.equal(snap.nodes[0].providers[1].address, ME)
  // Long provider lists are kept whole, so the last provider is still found.
  assert.equal(snap.nodes[1].providers.length, 600)
  assert.equal(snap.nodes[1].providers[599].address, ME)
  // Fields the plugin does not use are dropped.
  assert.equal(JSON.stringify(snap).indexOf("203.0.113.9"), -1)
  assert.equal(JSON.stringify(snap).indexOf("thorpub1x"), -1)
  assert.equal(snap.mimir.IGNORED, undefined)
  assert.equal(snap.mimir.HALTCHURNING, 0)
  assert.equal(snap.churns[0].date, 1700000000000)
  assert.equal(snap.midgardNetwork.bondingAPY, 0.12)
  assert.equal(snap.midgardNetwork.poolShareFactor, 0.1)
  assert.equal(snap.network.vaultsLiquidity, 8000)
  assert.deepEqual(snap.pools, [{ asset: "BTC.BTC", status: "available", runeDepth: 2214614330848310, depth2: 44292286616966, volume24h: 9924843121925106, apr: 0.13 }])
  assert.deepEqual(snap.upgrades, [{ name: "3.22.0", height: 60000, approved: false, percent: 0.4, toQuorum: 20 }])
  assert.equal(snap.error, "")
})

test("the node list is fetched again only when old enough or with --full", async function() {
  const before = (await requests()).filter(function(p) { return p === "/thorchain/nodes" }).length
  ok(["fetch"])
  let after = (await requests()).filter(function(p) { return p === "/thorchain/nodes" }).length
  assert.equal(after, before)
  assert.equal(snapshot().nodes.length, 5, "the old node list is carried over")
  ok(["fetch", "--full"])
  after = (await requests()).filter(function(p) { return p === "/thorchain/nodes" }).length
  assert.equal(after, before + 1)
})

test("the block comes from the RPC header when one is set, not the whole block", async function() {
  const before = (await requests()).length
  ok(["fetch"], { OMATHOR_RPC: base })
  const sent = (await requests()).slice(before)
  assert.ok(sent.indexOf("/header") !== -1)
  assert.equal(sent.indexOf("/cosmos/base/tendermint/v1beta1/blocks/latest"), -1)
  assert.equal(snapshot().block.height, 50011)
  assert.notEqual(run(["fetch", "--nodes-age", "ten"]).code, 0)
})

test("no bond address is ever sent", async function() {
  const all = await requests()
  for (const p of all) assert.equal(p.indexOf("thor1"), -1, p)
})

test("a failed fetch keeps the old data and records the error", async function() {
  const height = snapshot().block.height
  await setMode("down")
  const r = run(["fetch"])
  await setMode("ok")
  assert.notEqual(r.code, 0)
  const snap = snapshot()
  assert.equal(snap.block.height, height)
  assert.match(snap.error, /answered/)
})

test("endpoints that are not https or local are refused", function() {
  const r = run(["fetch"], { OMATHOR_THORNODE: "http://example.com" })
  assert.notEqual(r.code, 0)
  assert.match(r.err, /not a valid https address/)
  const s = run(["fetch"], { OMATHOR_THORNODE: "https://a.example/$(touch x)" })
  assert.notEqual(s.code, 0)
})

test("the endpoint set in the panel is read from shell.json", function() {
  fs.mkdirSync(path.join(env.XDG_CONFIG_HOME, "omarchy"), { recursive: true })
  fs.writeFileSync(path.join(env.XDG_CONFIG_HOME, "omarchy", "shell.json"), JSON.stringify({
    bar: { layout: { right: [{ id: Model.PLUGIN_ID, thornode: base }] } }
  }))
  const r = run(["fetch"], { OMATHOR_THORNODE: "" })
  assert.equal(r.code, 0, r.err)
  assert.match(r.out, new RegExp(base.replace(/[.]/g, "\\.")))
})

test("status, bond and chains print what the service computed", function() {
  const snap = snapshot()
  const sum = Model.summarize(snap, { addresses: [ME] }, Date.now())
  fs.writeFileSync(path.join(stateDir(), "summary.json"), JSON.stringify(sum))
  assert.match(ok(["status"]), /THORChain: Degraded/)
  assert.match(ok(["status"]), /ETH halted/)
  const bond = ok(["bond"])
  assert.match(bond, /33\.3% of the node/)
  assert.match(bond, /1,000 RUNE/)
  assert.match(ok(["chains"]), /ETH: Halted/)
  const json = JSON.parse(ok(["--json", "bond"]))
  assert.equal(json[0].address, ME)
  // The crowded node is found; the node with a zero-bond entry is not listed.
  assert.deepEqual(json[0].nodes.map(function(n) { return n.node.slice(0, 6) }), ["thor1a", "thor1c"])
  assert.equal(JSON.parse(ok(["--json", "status"])).text, undefined)
})

test("names find asks Midgard by address and keeps only valid names", function() {
  const out = JSON.parse(ok(["--json", "names", "find", ME]))
  assert.deepEqual(out, { [ME]: ["mine"] })
  const none = JSON.parse(ok(["--json", "names", "find", "thor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"]))
  assert.deepEqual(none, { thor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq: [] })
  // A search is not recorded by find: the panel records it with names
  // searched, for the addresses still selected when the answer arrives.
  assert.equal(fs.existsSync(path.join(stateDir(), "names.json")), false)
  ok(["names", "searched", "-"], null, ME + " thor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq\n")
  const data = JSON.parse(fs.readFileSync(path.join(stateDir(), "names.json"), "utf8"))
  assert.deepEqual(Object.keys(data.searched).sort(), [ME, "thor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"])
  assert.notEqual(run(["names", "find", "thor1short"]).code, 0)
  assert.notEqual(run(["names", "searched", "-"], null, "thor1short\n").code, 0)
})

test("names refresh saves each name, private and trimmed", async function() {
  const before = (await requests()).length
  ok(["names", "refresh", "MINE", "gone"])
  const sent = (await requests()).slice(before)
  assert.deepEqual(sent, ["/thorchain/thorname/mine", "/thorchain/thorname/gone"], "only the names are asked for")
  const file = path.join(stateDir(), "names.json")
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  const data = JSON.parse(fs.readFileSync(file, "utf8"))
  assert.equal(data.items.mine.found, true)
  assert.equal(data.items.mine.expire, 150010)
  assert.equal(data.items.mine.collector, 3000000000)
  assert.equal(data.items.mine.aliases.length, 2)
  assert.equal(JSON.stringify(data).indexOf("203.0.113.9"), -1)
  assert.equal(data.items.gone.found, false)
  assert.notEqual(run(["names", "refresh", "bad name"]).code, 0)
})

test("a failed name refresh keeps what was read", async function() {
  await setMode("down")
  const r = run(["names", "refresh", "mine"])
  await setMode("ok")
  assert.notEqual(r.code, 0)
  const data = JSON.parse(fs.readFileSync(path.join(stateDir(), "names.json"), "utf8"))
  assert.equal(data.items.mine.expire, 150010)
  assert.equal(data.items.mine.error, "no endpoint answered")
})

test("names refresh with no names reads the list from shell.json, and forget drops one", function() {
  fs.writeFileSync(path.join(env.XDG_CONFIG_HOME, "omarchy", "shell.json"), JSON.stringify({
    bar: { layout: { right: [{ id: Model.PLUGIN_ID, names: [{ name: "mine", owner: "" }] }] } }
  }))
  assert.match(ok(["names", "refresh"]), /refreshed 1 name$/)
  ok(["names", "forget", "gone", ME])
  const data = JSON.parse(fs.readFileSync(path.join(stateDir(), "names.json"), "utf8"))
  assert.deepEqual(Object.keys(data.items), ["mine"])
  assert.deepEqual(Object.keys(data.searched), ["thor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"], "the refresh kept the record; forget dropped ME")
  assert.equal(data.items.mine.error, "")
})

test("votes: counted among active nodes, your node matched locally, ADRs cached", async function() {
  const NODE_A = "thor1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const before = (await requests()).length
  assert.match(ok(["votes", "fetch", NODE_A], { OMATHOR_GITLAB: base }), /read the votes of 3 active nodes/)
  const sent = (await requests()).slice(before)
  for (const p of sent) assert.equal(p.indexOf("thor1"), -1, "a node address was sent: " + p)
  const file = path.join(stateDir(), "votes.json")
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  const v = JSON.parse(fs.readFileSync(file, "utf8"))
  assert.equal(v.active, 3)
  assert.equal(v.need, 2)
  const byKey = {}
  for (const k of v.keys) byKey[k.key] = k
  assert.deepEqual(byKey.ADR030.values, [{ v: 1, n: 1 }], "standby and repeated votes do not count")
  assert.equal(byKey.MAXBONDPROVIDERS.inForce, 100)
  assert.equal(byKey["bad key!"], undefined)
  assert.equal(v.mine[NODE_A].length, 5)
  assert.deepEqual(v.adrs["23"], { file: "adr-023-rune-supply.md", title: "$RUNE Supply Restructure", status: "Accepted", summary: "$RUNE's tokenomics have accumulated artifacts over time." })
  assert.equal(v.adrs["30"].title, "Delegated Operator Permissions")
  // The second read uses the cached file list and documents.
  const again = (await requests()).length
  ok(["votes", "fetch"], { OMATHOR_GITLAB: base })
  const second = (await requests()).slice(again)
  assert.equal(second.filter(function(p) { return p.indexOf("/repository/") === 0 }).length, 0)
  assert.notEqual(run(["votes", "fetch", "not-a-node"]).code, 0)
  const bad = run(["votes", "fetch"], { OMATHOR_GITLAB: "http://example.com" })
  assert.notEqual(bad.code, 0)
  assert.match(bad.err, /OMATHOR_GITLAB is not a valid https address/)
})

test("a curl config cannot make a request follow a redirect", async function() {
  const home = path.join(tmp, "curl-home")
  fs.mkdirSync(home, { recursive: true })
  fs.writeFileSync(path.join(home, ".curlrc"), "location\n")
  const hop = { CURL_HOME: home, OMATHOR_THORNODE: base + "/hop", OMATHOR_MIDGARD: base + "/hop", OMATHOR_RPC: base + "/hop" }
  run(["fetch"], hop)
  run(["names", "find", ME], hop)
  run(["names", "refresh", "alpha"], hop)
  const log = await requests()
  assert.ok(log.filter(function(p) { return p.indexOf("/hop/") === 0 }).length >= 3)
  assert.deepEqual(log.filter(function(p) { return p.indexOf("/landed/") === 0 }), [])
})

test("lookups take their addresses and names from stdin, and none reach a process argument", async function() {
  // Stand-ins for curl and jq that log their arguments, then run the real ones.
  const bin = path.join(tmp, "argv-bin")
  const log = path.join(tmp, "argv.log")
  fs.mkdirSync(bin, { recursive: true })
  for (const tool of ["curl", "jq"]) {
    const real = spawnSync("sh", ["-c", "command -v " + tool], { encoding: "utf8" }).stdout.trim()
    fs.writeFileSync(path.join(bin, tool), "#!/bin/sh\nprintf '%s\\n' \"$*\" >> '" + log + "'\nexec '" + real + "' \"$@\"\n", { mode: 0o755 })
  }
  const logged = { PATH: bin + ":" + process.env.PATH }
  const before = (await requests()).length
  assert.deepEqual(JSON.parse(ok(["--json", "names", "find", "-"], logged, ME + "\n")), { [ME]: ["mine"] })
  ok(["names", "refresh", "-"], logged, "mine gone\n")
  ok(["names", "searched", "-"], logged, ME + "\n")
  ok(["names", "forget", "-"], logged, "gone " + ME + "\n")
  ok(["votes", "fetch", "-"], Object.assign({ OMATHOR_GITLAB: base }, logged), "thor1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n")
  const sent = (await requests()).slice(before)
  assert.ok(sent.indexOf("/v2/thorname/owner/" + ME) !== -1, "the lookup still asks Midgard for the address")
  assert.ok(sent.indexOf("/thorchain/thorname/mine") !== -1)
  const argv = fs.readFileSync(log, "utf8")
  assert.ok(argv.length > 0)
  for (const secret of [ME, "thor1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "/thorname/mine", "/thorname/gone"]) {
    const at = argv.indexOf(secret)
    assert.equal(at, -1, secret + " showed up in a curl or jq argument: " + argv.slice(Math.max(0, at - 200), at + 60))
  }
  // The names as arguments of their own (the jq programs mention $mine).
  assert.doesNotMatch(argv, /(^| )(mine|gone)( |$)/m)
})

test("names refresh --print saves nothing, and names save stores exactly what a direct refresh would", function() {
  const file = path.join(stateDir(), "names.json")
  ok(["names", "forget", "-"], null, "mine gone\n")
  const printed = ok(["names", "refresh", "--print", "-"], null, "mine gone\n")
  const results = JSON.parse(printed)
  assert.deepEqual(results.map(function(r) { return r.name }), ["mine", "gone"])
  const strip = function(items) {
    const out = {}
    for (const k of Object.keys(items)) { out[k] = Object.assign({}, items[k]); delete out[k].fetchedAt }
    return out
  }
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).items.mine, undefined, "--print saved nothing")
  ok(["names", "save"], null, printed + "\n")
  const viaSave = strip(JSON.parse(fs.readFileSync(file, "utf8")).items)
  ok(["names", "forget", "-"], null, "mine gone\n")
  ok(["names", "refresh", "-"], null, "mine gone\n")
  const direct = strip(JSON.parse(fs.readFileSync(file, "utf8")).items)
  assert.deepEqual(viaSave, direct)
  // Anything else is dropped or refused, never saved as is.
  ok(["names", "save"], null, JSON.stringify([{ name: "../x", found: true }, { name: "fine", found: false, extra: "dropped" }]) + "\n")
  const after = JSON.parse(fs.readFileSync(file, "utf8")).items
  assert.equal(after["../x"], undefined)
  assert.deepEqual(Object.keys(after.fine).sort(), ["error", "fetchedAt", "found", "name"])
  assert.notEqual(run(["names", "save"], null, "not json\n").code, 0)
})

test("the notification helper sends title, text and urgency over D-Bus, with nothing in its arguments", { skip: !have("dbus-run-session") && "dbus-run-session missing" }, function() {
  const server = path.join(__dirname, "fake_notifications.py")
  const out = spawnSync("dbus-run-session", ["--", "python3", "-I", server, path.join(__dirname, "..", "lib", "notify.py")], {
    input: JSON.stringify([{ title: "THORName mine expires in 6 days", body: "Renew it.", urgent: false }, { title: "Node thor1x is leaving", body: "", urgent: true }]) + "\n",
    encoding: "utf8", timeout: 30000
  })
  assert.equal(out.status, 0, out.stderr)
  const report = JSON.parse(out.stdout)
  assert.equal(report.helperExit, 0)
  assert.deepEqual(report.calls, [
    { app: "Omathor", summary: "THORName mine expires in 6 days", body: "Renew it.", urgency: 1 },
    { app: "Omathor", summary: "Node thor1x is leaving", body: "", urgency: 2 }
  ])
  assert.equal(report.helperArgv.join(" ").indexOf("mine"), -1)
})

test("the notification helper fails when no notification service answers, so the panel can fall back", function() {
  const out = spawnSync("python3", ["-I", path.join(__dirname, "..", "lib", "notify.py")], {
    input: JSON.stringify([{ title: "t", body: "b", urgent: false }]) + "\n",
    env: Object.assign({}, process.env, { DBUS_SESSION_BUS_ADDRESS: "unix:path=" + path.join(tmp, "no-bus") }),
    encoding: "utf8", timeout: 30000
  })
  assert.notEqual(out.status, 0)
})

const UNINSTALL = path.join(__dirname, "..", "uninstall.sh")
function uninstall(extra) {
  const home = path.join(tmp, "home")
  fs.mkdirSync(home, { recursive: true })
  return spawnSync(UNINSTALL, [], { env: Object.assign({ HOME: home }, env, { HOME: home }, extra || {}), encoding: "utf8", timeout: 120000 })
}
const lockFile = function() { return path.join(env.XDG_RUNTIME_DIR, "omathor", "lock") }

test("uninstall signals no process, not even one with the plugin's path in its arguments", async function() {
  ok(["prepare"])
  // An editor looking at the script, say: the path is in its arguments.
  const viewer = spawn("sh", ["-c", "sleep 30", "sh", fs.realpathSync(CLI)], { stdio: "ignore" })
  await new Promise(function(done) { setTimeout(done, 300) })
  const un = uninstall()
  // Let exit events of anything killed meanwhile arrive before looking.
  await new Promise(function(done) { setTimeout(done, 500) })
  assert.equal(un.status, 0, un.stdout + un.stderr)
  assert.equal(viewer.exitCode, null, "the unrelated process is still running")
  assert.equal(viewer.signalCode, null, "the unrelated process was not signalled")
  process.kill(viewer.pid)
  assert.equal(fs.existsSync(stateDir()), false)
  // A command started after the uninstall works as usual.
  ok(["prepare"])
  assert.ok(fs.existsSync(stateDir()))
})

test("uninstall waits for a running refresh, and fails without deleting if it does not finish in time", async function() {
  ok(["fetch"])
  await setMode("slow")
  const fetching = spawn(CLI, ["fetch"], { env: env, stdio: "ignore" })
  const finished = new Promise(function(done) { fetching.on("exit", function(code) { done(code) }) })
  await new Promise(function(done) { setTimeout(done, 1500) })
  const un = uninstall()
  const code = await finished
  await setMode("ok")
  assert.equal(un.status, 0, un.stdout + un.stderr)
  assert.match(un.stdout, /waiting for a running omathor command to finish/)
  assert.equal(code, 0, "the refresh was waited for, not stopped")
  assert.equal(fs.existsSync(stateDir()), false)

  // A command that does not finish in time: nothing is deleted, and it says so.
  ok(["prepare"])
  const holder = spawn("flock", ["-s", lockFile(), "sleep", "5"], { stdio: "ignore", detached: true })
  await new Promise(function(done) { setTimeout(done, 300) })
  const late = uninstall({ OMATHOR_UNINSTALL_WAIT: "1" })
  // flock and the sleep holding its lock, together.
  process.kill(-holder.pid)
  await new Promise(function(done) { setTimeout(done, 200) })
  assert.equal(late.status, 1)
  assert.match(late.stdout, /still running; .* was left. Run this again/)
  assert.ok(fs.existsSync(stateDir()))
})

test("an uninstall from another boot, or one older than the command, does not stop it", function() {
  const stamp = path.join(env.XDG_RUNTIME_DIR, "omathor", "removed")
  const boot = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()
  // Another boot, with a far larger time since boot.
  fs.writeFileSync(stamp, "00000000-0000-0000-0000-000000000000 999999999999\n")
  ok(["prepare"])
  // This boot, but before the command started.
  fs.writeFileSync(stamp, boot + " 1\n")
  ok(["prepare"])
  fs.writeFileSync(stamp, "garbage\n")
  ok(["prepare"])
})

// Last: it removes the saved data the tests above rely on.
test("a command that waited for the lock during an uninstall writes nothing", async function() {
  fs.rmSync(stateDir(), { recursive: true, force: true })
  // Stand in for an uninstall in progress: the lock held exclusively.
  const holder = spawn("flock", ["-x", lockFile(), "sleep", "2"], { stdio: "ignore", detached: true })
  await new Promise(function(done) { setTimeout(done, 300) })
  const waiting = spawn(CLI, ["prepare"], { env: env, stdio: ["ignore", "ignore", "pipe"] })
  let err = ""
  waiting.stderr.on("data", function(d) { err += d })
  const exited = new Promise(function(done) { waiting.on("exit", function(code) { done(code) }) })
  await new Promise(function(done) { setTimeout(done, 300) })
  // The uninstall finishes: it records the time, then lets go of the lock.
  const boot = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()
  const up = fs.readFileSync("/proc/uptime", "utf8").split(" ")[0].replace(".", "")
  fs.writeFileSync(path.join(env.XDG_RUNTIME_DIR, "omathor", "removed"), boot + " " + up + "\n")
  process.kill(-holder.pid)
  assert.notEqual(await exited, 0)
  assert.match(err, /uninstalled while this command waited; nothing was written/)
  assert.equal(fs.existsSync(stateDir()), false)
})
