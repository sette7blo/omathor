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

let server, base, tmp, env

function run(args, extraEnv) {
  const out = spawnSync(CLI, args, { env: Object.assign({}, env, extraEnv || {}), encoding: "utf8", timeout: 60000 })
  return { code: out.status, out: out.stdout.trim(), err: out.stderr.trim() }
}
function ok(args, extraEnv) {
  const r = run(args, extraEnv)
  assert.equal(r.code, 0, args.join(" ") + ": " + r.err)
  return r.out
}
async function requests() { return (await fetch(base + "/__log")).json() }
async function setMode(m) { await fetch(base + "/__mode", { method: "POST", body: m }) }

const stateDir = function() { return path.join(env.XDG_STATE_HOME, "omarchy", "omathor") }
const snapshot = function() { return JSON.parse(fs.readFileSync(path.join(stateDir(), "snapshot.json"), "utf8")) }

test.before(async function() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "omathor-test-"))
  server = spawn(process.execPath, [path.join(__dirname, "fake-server.js")], { stdio: ["ignore", "pipe", "inherit"] })
  const port = await new Promise(function(done) { server.stdout.once("data", function(d) { done(String(d).trim()) }) })
  base = "http://127.0.0.1:" + port
  env = Object.assign({}, process.env, {
    XDG_STATE_HOME: path.join(tmp, "state"), XDG_CONFIG_HOME: path.join(tmp, "config"),
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
  assert.equal(snap.nodes.length, 4)
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
  assert.equal(snapshot().nodes.length, 4, "the old node list is carried over")
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
  // Searched addresses are recorded, so the plugin searches each once.
  const data = JSON.parse(fs.readFileSync(path.join(stateDir(), "names.json"), "utf8"))
  assert.deepEqual(Object.keys(data.searched).sort(), [ME, "thor1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"])
  assert.notEqual(run(["names", "find", "thor1short"]).code, 0)
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
