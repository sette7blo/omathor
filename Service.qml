import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "Model.js" as Model

// Background service. Every two minutes (or only while the panel is open,
// when background refresh is off) it runs `omathor fetch`, which writes a
// small snapshot of the public THORNode API. The snapshot is turned into a
// summary here, saved for the omathor command, and compared with the last
// one for notifications when those are on.
// THORNames are read separately (`omathor names refresh`) only when they are
// added, refreshed by hand, or due under the chosen daily or weekly period.
Item {
  id: root

  property var shell: null
  property bool panelOpen: false

  // --- Filesystem layout (same rules as bin/omathor) -----------------------
  readonly property string home: Quickshell.env("HOME") || ""
  readonly property string stateDir: (Quickshell.env("XDG_STATE_HOME") || (home + "/.local/state")) + "/omarchy/omathor"
  readonly property string pluginDir: home + "/.config/omarchy/plugins/" + Model.PLUGIN_ID
  readonly property string cli: pluginDir + "/bin/omathor"

  readonly property int refreshSeconds: 120

  // --- Settings (the widget's entry in shell.json) --------------------------
  property var options: Model.settings(null)

  function loadSettings() {
    var sh = root.shell
    var cfg = sh ? (sh.shellConfig || (sh.barConfig ? { bar: sh.barConfig } : null)) : null
    var next = Model.pluginSettings(cfg)
    if (JSON.stringify(next) !== JSON.stringify(root.options)) root.options = next
  }

  function persistSettings(patch) {
    var current = Model.settings(root.options)
    var extra = patch && typeof patch === "object" ? patch : {}
    for (var k in extra) current[k] = extra[k]
    current = Model.settings(current)
    if (root.shell && typeof root.shell.updateEntryInline === "function")
      root.shell.updateEntryInline(Model.PLUGIN_ID, Model.settingsPayload(current))
    root.options = current
  }

  onShellChanged: root.loadSettings()

  Connections {
    target: root.shell
    ignoreUnknownSignals: true
    function onBarConfigChanged() { root.loadSettings() }
    function onShellConfigChanged() { root.loadSettings() }
  }

  // A new endpoint is fetched from at once; anything else only needs the
  // summary rebuilt.
  // Starts as the default (both empty). Saved custom endpoints cause one
  // extra fetch at load, which the running startup fetch absorbs.
  property string lastEndpoints: " "
  onOptionsChanged: {
    var endpoints = root.options.thornode + " " + root.options.midgard
    if (endpoints !== root.lastEndpoints) {
      root.lastEndpoints = endpoints
      root.fetch(true)
    }
    root.recompute(false)
    root.searchNew()
  }

  // --- Summary -------------------------------------------------------------
  property var snapshot: null
  property var summary: Model.summarize(null, null, Date.now())
  readonly property string level: summary.level
  property bool fetching: false
  property bool ready: false
  property string fetchError: ""

  function recompute(fromFetch) {
    var next = Model.summarize(root.snapshot, root.options, Date.now(), root.namesData, root.votesData)
    var previous = root.summary
    root.summary = next
    // Files can load before every path is bound; the first write waits.
    if (root.ready) summaryFile.setText(JSON.stringify(next) + "\n")
    if (fromFetch && root.options.notify) root.notify(Model.events(previous, next))
  }

  function notify(list) {
    for (var i = 0; i < list.length; i++) {
      var argv = ["notify-send", "-a", "Omathor"]
      if (list[i].urgent) argv.push("-u", "critical")
      argv.push(Model.notifyText(list[i].title), Model.notifyText(list[i].body))
      Util.execArgv(argv)
    }
  }

  // --- Fetching ------------------------------------------------------------
  function fetch(full) {
    if (fetchProc.running) return
    root.fetching = true
    // The node list (0.5 MB) every 10 minutes while it is looked at (the
    // panel open, or the reward on the bar), otherwise every 30.
    var nodesAge = root.panelOpen || root.options.barLabel === "reward" ? "600" : "1800"
    fetchProc.command = full ? [root.cli, "fetch", "--full"] : [root.cli, "fetch", "--nodes-age", nodesAge]
    fetchProc.running = true
  }

  Process {
    id: fetchProc
    running: false
    stderr: StdioCollector { id: fetchErr; waitForEnd: true }
    onExited: function(code) {
      root.fetching = false
      root.fetchError = code === 0 ? "" : (Model.errorText(fetchErr.text) || "The fetch failed.")
      // The snapshot watcher picks up the new file; this covers a write the
      // watcher missed.
      snapshotFile.reload()
    }
  }

  Timer {
    interval: root.refreshSeconds * 1000
    repeat: true
    running: root.options.refresh || root.panelOpen
    onTriggered: root.fetch(false)
  }

  // Keeps the countdown and the staleness check moving between fetches.
  Timer {
    interval: 60000
    repeat: true
    running: root.summary.hasData
    onTriggered: root.recompute(false)
  }

  onPanelOpenChanged: {
    if (!root.panelOpen) return
    var age = Date.now() - root.summary.fetchedAt
    if (!root.summary.hasData || age > 60000) root.fetch(false)
    else root.recompute(false)
  }

  FileView {
    id: snapshotFile
    path: root.stateDir + "/snapshot.json"
    watchChanges: true
    printErrors: false
    onLoaded: {
      var data = null
      try { data = JSON.parse(text()) } catch (e) { data = null }
      root.snapshot = data && typeof data === "object" ? data : null
      root.recompute(true)
    }
    onLoadFailed: {
      root.snapshot = null
      root.recompute(false)
    }
    onFileChanged: reload()
  }

  FileView {
    id: summaryFile
    path: root.stateDir + "/summary.json"
    atomicWrites: true
    printErrors: false
    blockLoading: false
  }

  // --- Votes ----------------------------------------------------------------
  // Read only while the Votes tab is looked at, at most every 30 minutes
  // unless asked. Your node addresses are passed to the command to be
  // matched locally.
  property var votesData: null
  property string votesError: ""
  readonly property bool votesBusy: votesProc.running

  function fetchVotes(force) {
    if (votesProc.running) return
    if (!force && !Model.votesDue(root.votesData, Date.now())) return
    root.votesError = ""
    votesProc.payload = Model.voteNodes(root.summary).join(" ")
    votesProc.command = [root.cli, "votes", "fetch", "-"]
    votesProc.running = true
  }

  // Node and bond addresses and THORNames go to the command on stdin, never
  // as arguments: other local accounts can read every process's arguments.
  Process {
    id: votesProc
    property string payload: ""
    running: false
    stdinEnabled: true
    onRunningChanged: if (running) { votesProc.write(votesProc.payload + "\n"); votesProc.payload = "" }
    stderr: StdioCollector { id: votesErr; waitForEnd: true }
    onExited: function(code) {
      if (code !== 0) root.votesError = Model.errorText(votesErr.text) || "Reading the votes failed."
      votesFile.reload()
    }
  }

  FileView {
    id: votesFile
    path: root.stateDir + "/votes.json"
    watchChanges: true
    printErrors: false
    onLoaded: {
      var data = Model.parseJson(text())
      root.votesData = data && typeof data === "object" ? data : null
      root.recompute(false)
    }
    onLoadFailed: root.votesData = null
    onFileChanged: reload()
  }

  // --- THORNames ------------------------------------------------------------
  property var namesData: null
  property string namesError: ""
  readonly property bool namesBusy: findProc.running || namesProc.running
  // Work waiting for the running command to finish.
  property var findQueue: []
  property var refreshQueue: []
  // Whether names.json has been read (or found missing), so it is known
  // which addresses were searched before.
  property bool namesLoaded: false
  // Addresses asked about since the shell started.
  property var tried: ({})

  function addAddress(address) {
    var result = Model.addAddress(root.options, address)
    if (!result.ok) return result.error
    root.persistSettings({ addresses: result.options.addresses })
    root.searchNew()
    return ""
  }

  function removeAddress(address) {
    var next = Model.removeAddress(root.options, address)
    var tried = root.tried
    delete tried[address]
    root.tried = tried
    root.persistSettings({ addresses: next.addresses, names: next.names })
    // A lookup still waiting for its turn is not sent any more.
    root.findQueue = root.findQueue.filter(function(a) { return a !== address })
    root.forgetNames([address])
  }

  function selected(address) {
    return root.options.addresses.indexOf(address) !== -1
  }

  // Each bond address is searched for names once: when it is added, or the
  // first time the plugin runs with it.
  function searchNew() {
    if (!root.namesLoaded) return
    root.findNames(Model.namesToSearch(root.options, root.namesData, root.tried))
  }

  function addName(name) {
    var result = Model.addName(root.options, name)
    if (!result.ok) return result.error
    root.persistSettings({ names: result.options.names })
    root.refreshNames([result.options.names[result.options.names.length - 1].name])
    return ""
  }

  function removeName(name) {
    root.persistSettings({ names: Model.removeName(root.options, name).names })
    root.forgetNames()
  }

  // Sends the addresses to Midgard: only from adding one or Find names. Each
  // is checked against the current selection again when its turn comes.
  function findNames(addresses) {
    var list = (addresses || []).filter(function(a) { return Model.isAddress(a) && root.selected(a) })
    if (!list.length) return
    var tried = root.tried
    for (var i = 0; i < list.length; i++) tried[list[i]] = true
    root.tried = tried
    if (findProc.running) {
      root.findQueue = root.findQueue.concat(list)
      return
    }
    root.namesError = ""
    findProc.asked = list
    findProc.command = [root.cli, "--json", "names", "find", "-"]
    findProc.running = true
  }

  function refreshNames(names) {
    var list = (names || []).filter(function(n) { return Model.isName(n) })
    if (!list.length) return
    if (namesProc.running) {
      root.refreshQueue = root.refreshQueue.concat(list)
      return
    }
    root.namesError = ""
    namesProc.asked = list
    namesProc.command = [root.cli, "names", "refresh", "-"]
    namesProc.running = true
  }

  function refreshAllNames() {
    root.refreshNames(root.options.names.map(function(n) { return n.name }))
  }

  // Drops the saved data of names no longer in the settings, and the
  // record that a removed address was searched.
  function forgetNames(addresses) {
    var gone = Model.namesToForget(root.options, root.namesData).concat(addresses || [])
    if (gone.length) root.writeNames("forget", gone)
  }

  // Every change to names.json made from here goes through one queue, in
  // order, so a search recorded for an address cannot land after the
  // address was removed and its record forgotten. A record of searched
  // addresses is checked against the selection when its turn comes.
  property var writeQueue: []

  function writeNames(op, list) {
    root.writeQueue = root.writeQueue.concat([{ op: op, list: list }])
    root.nextWrite()
  }

  function nextWrite() {
    while (!writeProc.running && root.writeQueue.length) {
      var job = root.writeQueue[0]
      root.writeQueue = root.writeQueue.slice(1)
      var list = job.op === "searched" ? job.list.filter(function(a) { return root.selected(a) }) : job.list
      if (!list.length) continue
      writeProc.payload = list.join(" ")
      writeProc.command = [root.cli, "names", job.op, "-"]
      writeProc.running = true
    }
  }

  Process {
    id: writeProc
    property string payload: ""
    running: false
    stdinEnabled: true
    onRunningChanged: if (running) { writeProc.write(writeProc.payload + "\n"); writeProc.payload = "" }
    onExited: {
      namesFile.reload()
      root.nextWrite()
    }
  }

  Process {
    id: findProc
    property var asked: []
    running: false
    stdinEnabled: true
    onRunningChanged: if (running) findProc.write(findProc.asked.join(" ") + "\n")
    stdout: StdioCollector { id: findOut; waitForEnd: true }
    stderr: StdioCollector { id: findErr; waitForEnd: true }
    onExited: function(code) {
      var found = code === 0 ? Model.parseJson(findOut.text) : null
      if (!found || typeof found !== "object") {
        root.namesError = Model.errorText(findErr.text) || "The name search failed."
      } else {
        // An address removed while it was being looked up is left out: its
        // names are not added and its search is not recorded.
        var still = findProc.asked.filter(function(a) { return root.selected(a) })
        var current = root.options
        var added = []
        for (var i = 0; i < still.length; i++) {
          var r = Model.setFoundNames(current, still[i], found[still[i]])
          current = r.options
          added = added.concat(r.added)
        }
        root.persistSettings({ names: current.names })
        root.writeNames("searched", still)
        root.forgetNames()
        root.refreshNames(added)
      }
      var queued = root.findQueue
      root.findQueue = []
      if (queued.length) root.findNames(queued)
    }
  }

  Process {
    id: namesProc
    property var asked: []
    running: false
    stdinEnabled: true
    onRunningChanged: if (running) namesProc.write(namesProc.asked.join(" ") + "\n")
    stderr: StdioCollector { id: namesErr; waitForEnd: true }
    onExited: function(code) {
      if (code !== 0) root.namesError = Model.errorText(namesErr.text) || "The name refresh failed."
      // A name removed while it was being read is dropped again.
      var kept = root.options.names.map(function(n) { return n.name })
      var dropped = namesProc.asked.filter(function(n) { return kept.indexOf(n) === -1 })
      if (dropped.length) root.writeNames("forget", dropped)
      namesFile.reload()
      var queued = root.refreshQueue
      root.refreshQueue = []
      if (queued.length) root.refreshNames(queued)
    }
  }

  // Daily or weekly refresh: checked every quarter hour, and once shortly
  // after start, against when each name was last read.
  Timer {
    id: namesTimer
    interval: 15 * 60 * 1000
    repeat: true
    running: root.options.namesRefresh !== "manual"
    triggeredOnStart: false
    onTriggered: root.refreshNames(Model.namesDue(root.options, root.namesData, Date.now()))
  }
  Timer {
    interval: 30000
    running: true
    onTriggered: if (root.options.namesRefresh !== "manual") root.refreshNames(Model.namesDue(root.options, root.namesData, Date.now()))
  }

  FileView {
    id: namesFile
    path: root.stateDir + "/names.json"
    watchChanges: true
    printErrors: false
    onLoaded: {
      var data = Model.parseJson(text())
      root.namesData = data && typeof data === "object" ? data : null
      root.namesLoaded = true
      root.recompute(false)
      root.searchNew()
    }
    onLoadFailed: {
      root.namesData = null
      root.namesLoaded = true
      root.recompute(false)
      root.searchNew()
    }
    onFileChanged: reload()
  }

  // --- Lifecycle -----------------------------------------------------------
  // install.sh --if-needed finishes what omarchy plugin add does not (the
  // command and the launcher) and exits at once when that is already done.
  Process {
    id: installProc
    running: false
  }

  Process {
    id: prepareProc
    running: false
    onExited: function(code) {
      snapshotFile.reload()
      namesFile.reload()
      if (root.options.refresh) root.fetch(false)
    }
  }

  Component.onCompleted: {
    root.ready = true
    root.recompute(false)
    prepareProc.command = [root.cli, "prepare"]
    prepareProc.running = true
    installProc.command = [root.pluginDir + "/install.sh", "--if-needed"]
    installProc.running = true
  }
}
