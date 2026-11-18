// A stand-in for THORNode and Midgard, shaped like the real responses but
// small. Prints its port on stdout. POST /__mode with "down", "slow-nodes" or
// "ok" changes how it answers; GET /__log lists the paths asked for.
const http = require("node:http")

const NODE_A = "thor1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const NODE_B = "thor1bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
const ME = "thor1mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm"

let mode = "ok"
const log = []

function node(address, status, bond, providers, extra) {
  return Object.assign({
    node_address: address,
    status: status,
    node_operator_address: providers[0].bond_address,
    total_bond: String(bond),
    bond_providers: { node_operator_fee: "2000", providers: providers.map(function(p) { return { bond_address: p.bond_address, bond: String(p.bond) } }) },
    signer_membership: ["thorpub1x"],
    slash_points: 10,
    jail: {},
    version: "3.21.5",
    current_award: "100000000000",
    requested_to_leave: false,
    forced_to_leave: false,
    active_block_height: 1000,
    status_since: 1000,
    ip_address: "203.0.113.9",
    observe_chains: [{ chain: "BTC", height: 900000 }],
    preflight_status: { status: "Ready", reason: "OK", code: 0 },
    maintenance: false,
    missing_blocks: 0
  }, extra || {})
}

const routes = {
  "/thorchain/lastblock": [{ chain: "BTC", last_observed_in: 900000, last_signed_out: 50000, thorchain: 50010 }],
  "/thorchain/mimir": { HALTCHURNING: 0, PAUSEBOND: 0, CHURNINTERVAL: 43200, HALTBTCCHAIN: 0, "PAUSELPDEPOSIT-BTC-BTC": 1, IGNORED: 5 },
  "/thorchain/inbound_addresses": [
    { chain: "BTC", halted: false, chain_trading_paused: false, chain_lp_actions_paused: false, global_trading_paused: false, gas_rate: "8", gas_rate_units: "satsperbyte", outbound_fee: "1000", address: "bc1q" },
    { chain: "ETH", halted: true, chain_trading_paused: true, chain_lp_actions_paused: false, global_trading_paused: false, gas_rate: "<b>x</b>", gas_rate_units: "gwei", outbound_fee: "1" }
  ],
  "/thorchain/vaults/asgard": [
    { status: "ActiveVault", block_height: 40000, status_since: 40000, membership: ["a", "b", "c"], coins: [] }
  ],
  "/thorchain/network": { bond_reward_rune: "1", vaults_migrating: false, rune_price_in_tor: "50000000", effective_security_bond: "6000", vaults_liquidity_rune: "8000", total_reserve: "1" },
  "/thorchain/queue": { swap: 3, outbound: 2, internal: 0 },
  "/thorchain/version": { current: "3.21.5", next: "3.21.5", next_since_height: 0, querier: "3.21.5" },
  "/cosmos/base/tendermint/v1beta1/blocks/latest": { block: { header: { height: "50010", time: "" } } },
  "/thorchain/nodes": [
    node(NODE_A, "Active", 300000000000, [{ bond_address: NODE_A, bond: 200000000000 }, { bond_address: ME, bond: 100000000000 }]),
    // A crowded node: ME is far down a long provider list, and a second
    // provider entry has nothing bonded.
    node("thor1cccccccccccccccccccccccccccccccccccccc", "Active", 2600000000000,
      Array.from({ length: 600 }, function(_, i) {
        return { bond_address: i === 599 ? ME : "thor1" + String(i).padStart(3, "0") + "d".repeat(35), bond: i === 599 ? 100000000000 : 36000000000 }
      })),
    node("thor1dddddddddddddddddddddddddddddddddddddd", "Active", 100000000000, [{ bond_address: "thor1dddddddddddddddddddddddddddddddddddddd", bond: 100000000000 }, { bond_address: ME, bond: 0 }]),
    node(NODE_B, "Standby", 50000000000, [{ bond_address: NODE_B, bond: 50000000000 }], { preflight_status: { status: "Standby", reason: "not enough bond", code: 1 } })
  ],
  "/thorchain/constants": { int_64_values: { ChurnInterval: 43200, DesiredValidatorSet: 100 } },
  "/thorchain/upgrade_proposals": [{ name: "3.22.0", height: 60000, info: "x".repeat(500), approved: false, approved_percent: "0.4", validators_to_quorum: 20, approvers: ["thor1x"] }],
  "/header": {},
  // Node votes: B is on standby, so its vote does not count; A voted twice
  // on ADR030, which counts once.
  "/thorchain/mimir/nodes_all": { mimirs: [
    { key: "ADR23", value: 1, signer: NODE_A },
    { key: "ADR23", value: 1, signer: "thor1cccccccccccccccccccccccccccccccccccccc" },
    { key: "ADR030", value: 1, signer: NODE_A },
    { key: "ADR030", value: 1, signer: NODE_A },
    { key: "ADR030", value: 1, signer: NODE_B },
    { key: "HALTETHCHAIN", value: 1, signer: NODE_A },
    { key: "MAXBONDPROVIDERS", value: 100, signer: NODE_A },
    { key: "MAXBONDPROVIDERS", value: 100, signer: "thor1cccccccccccccccccccccccccccccccccccccc" },
    { key: "MAXBONDPROVIDERS", value: 50, signer: "thor1dddddddddddddddddddddddddddddddddddddd" },
    { key: "bad key!", value: 1, signer: NODE_A }
  ] },
  "/thorchain/mimir/nodes": { MAXBONDPROVIDERS: 100 },
  "/repository/tree": [
    { name: "adr-023-rune-supply.md", id: "a".repeat(40) },
    { name: "adr-030-delegated.md", id: "b".repeat(40) },
    { name: "README.md", id: "c".repeat(40) }
  ],
  ["/repository/blobs/" + "a".repeat(40) + "/raw"]: "# ADR 023: $RUNE Supply Restructure\n\n## Status\n\nAccepted\n\n## Context\n\n$RUNE's tokenomics have\naccumulated `artifacts` over time. More text here.\n",
  ["/repository/blobs/" + "b".repeat(40) + "/raw"]: "# ADR 030: Delegated [Operator](https://x) Permissions\n\n## Status\n\nProposed\n",
  "/v2/churns": [{ date: "1700000000000000000", height: "40000" }, { date: "1699730000000000000", height: "-1" }],
  "/v2/network": { bondingAPY: "0.12", liquidityAPY: "0.05", poolShareFactor: "0.1", totalPooledRune: "7000" },
  "/v2/pools": [
    { asset: "BTC.BTC", status: "available", runeDepth: "2214614330848310", depthMinus2Percent: "44292286616966", depthPlus2Percent: "44336623240206", volume24h: "9924843121925106", annualPercentageRate: "0.13", liquidityUnits: "1" },
    { asset: "BAD ASSET", status: "available", runeDepth: "1" }
  ],
  ["/v2/thorname/owner/" + ME]: ["mine", "MINE", "not a name!"],
  "/thorchain/thorname/mine": {
    name: "mine", expire_block_height: 150010, owner: ME,
    preferred_asset: "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48",
    preferred_asset_swap_threshold_rune: "9000000000", affiliate_collector_rune: "3000000000",
    aliases: [{ chain: "THOR", address: ME }, { chain: "BTC", address: "bc1qexample" }],
    secret: "203.0.113.9"
  }
}

const server = http.createServer(function(req, res) {
  const url = new URL(req.url, "http://localhost")
  if (url.pathname === "/__log") {
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify(log))
    return
  }
  if (url.pathname === "/__mode" && req.method === "POST") {
    let body = ""
    req.on("data", function(d) { body += d })
    req.on("end", function() { mode = body.trim(); res.end("ok") })
    return
  }
  log.push(url.pathname)
  // Anything below /hop is sent on to another host name for the same server.
  if (url.pathname.indexOf("/hop/") === 0) {
    res.statusCode = 302
    res.setHeader("Location", "http://localhost:" + server.address().port + "/landed" + url.pathname.slice(4))
    res.end()
    return
  }
  if (mode === "down") {
    res.statusCode = 503
    res.end("down")
    return
  }
  const route = routes[url.pathname]
  if (!route && url.pathname.indexOf("/thorchain/thorname/") === 0) {
    res.statusCode = 400
    res.end(JSON.stringify({ code: 3, message: "fail to fetch THORName: THORName doesn't exist: " + url.pathname.slice(20) }))
    return
  }
  if (!route) {
    res.statusCode = 404
    res.end("{}")
    return
  }
  let body = route
  if (url.pathname === "/header") {
    body = { result: { header: { height: "50011", time: new Date(Date.now() - 4000).toISOString() } } }
  }
  if (url.pathname === "/cosmos/base/tendermint/v1beta1/blocks/latest") {
    body = { block: { header: { height: "50010", time: new Date(Date.now() - 5000).toISOString() } } }
  }
  res.setHeader("Content-Type", "application/json")
  res.end(typeof body === "string" ? body : JSON.stringify(body))
})

server.listen(0, "127.0.0.1", function() {
  process.stdout.write(server.address().port + "\n")
})
