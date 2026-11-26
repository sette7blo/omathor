import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "qml"
import "Model.js" as Model

// One panel: a header, seven tabs, and the settings behind the gear. The
// network tab leads with the churn as one big readout, then small labelled
// readings; the bonds tab has a card per node, the names tab a card per
// THORName, the votes tab the node votes closest to passing, the releases
// tab a card per upcoming THORNode milestone, the pools tab a compact row
// per pool, and the chains tab a grid.
// Everything shown comes from the service's summary; the panel never fetches.
Panel {
  id: root
  moduleName: "io.github.sette7blo.omathor"
  ipcTarget: "io.github.sette7blo.omathor"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property var service: null

  readonly property var barIdentity: hostWidget || root

  readonly property color foreground: bar ? bar.foreground : Commons.Color.foreground
  readonly property color accent: Commons.Color.accent
  readonly property color dim: Qt.darker(foreground, 1.5)
  readonly property color warnColor: "#E5C736"
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  readonly property var summary: service ? service.summary : null
  readonly property var options: service ? service.options : Model.settings(null)
  readonly property bool hasData: !!summary && summary.hasData === true

  property bool showSettings: false
  property string tab: "network"
  // The node selected with the keyboard on the bond tab.
  property string selectedNode: ""

  readonly property var network: hasData ? Model.networkView(summary, options, summary.computedAt) : null
  readonly property var bonds: Model.bondView(summary, options)
  readonly property var chains: Model.chainsView(summary)
  readonly property var names: Model.namesView(summary, options, summary ? summary.computedAt : 0)
  readonly property var votes: Model.votesView(summary, summary ? summary.computedAt : 0)
  readonly property var releases: Model.releasesView(summary, summary ? summary.computedAt : 0)
  property bool showAllPools: false
  readonly property var pools: Model.poolsView(summary, options, showAllPools)
  readonly property var targets: Model.bondTargets(bonds)

  function levelColor(level, fallback) {
    if (level === "alert") return Commons.Color.urgent
    if (level === "warn") return root.warnColor
    return fallback === undefined ? root.foreground : fallback
  }

  readonly property string emptyText: {
    if (!root.service || root.hasData) return ""
    if (root.service.fetching) return "Reading THORChain."
    var err = root.service.fetchError || (root.summary ? root.summary.error : "")
    return err ? "No data: " + err : "No data yet."
  }

  function selectTab(name) {
    root.tab = name
    root.selectedNode = ""
    scroller.contentY = 0
    if (name === "votes" && root.service) root.service.fetchVotes(false)
    if (name === "releases" && root.service) root.service.fetchReleases(false)
  }

  function moveSelection(delta) {
    if (root.tab !== "bond" || !root.targets.length) return
    var i = root.targets.indexOf(root.selectedNode)
    i = i === -1 ? (delta > 0 ? 0 : root.targets.length - 1) : Math.max(0, Math.min(root.targets.length - 1, i + delta))
    root.selectedNode = root.targets[i]
  }

  // Only the explorer, THORNode's ADR documents and its merge requests are
  // ever opened.
  function openUrl(url) {
    if (!url) return
    if (url.indexOf("https://thorchain.net/") !== 0
      && url.indexOf("https://gitlab.com/thorchain/thornode/-/blob/develop/docs/architecture/") !== 0
      && url.indexOf("https://gitlab.com/thorchain/thornode/-/merge_requests") !== 0) return
    Util.execArgv(["xdg-open", url])
  }

  function openSelected() {
    if (root.tab === "bond" && Model.explorerUrl("node", root.selectedNode)) root.openUrl(Model.explorerUrl("node", root.selectedNode))
  }

  function refresh() {
    if (!root.service) return
    root.service.fetch(true)
    if (root.tab === "votes") root.service.fetchVotes(true)
    if (root.tab === "releases") root.service.fetchReleases(true)
  }

  // Keeps the selected card in view.
  function reveal(item) {
    if (!item) return
    var y = item.mapToItem(scrollContent, 0, 0).y
    if (y < scroller.contentY) scroller.contentY = y
    else if (y + item.height > scroller.contentY + scroller.height) scroller.contentY = y + item.height - scroller.height
  }

  // `omathor panel <tab>` opens the panel on a tab, and `scroll` moves the
  // open tab, for keybindings and screenshots.
  ShellIpc {
    target: "io.github.sette7blo.omathor.panel"

    function tab(name: string): string {
      if (Model.TABS.indexOf(name) === -1) return "unknown tab"
      root.showSettings = false
      root.selectTab(name)
      return "ok"
    }
    function scroll(pixels: int): string {
      scroller.contentY = Math.max(0, Math.min(pixels, scroller.contentHeight - scroller.height))
      return "ok"
    }
  }

  Connections {
    target: root
    function onOpenedChanged() {
      if (root.service) root.service.panelOpen = root.opened
      if (!root.opened) {
        root.showSettings = false
        return
      }
      Qt.callLater(function() { keys.forceActiveFocus() })
      if (root.tab === "votes" && root.service) root.service.fetchVotes(false)
      if (root.tab === "releases" && root.service) root.service.fetchReleases(false)
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keys
    contentWidth: panel.fittedContentWidth(Style.space(460))
    contentHeight: panel.fittedContentHeight(body.implicitHeight, Style.space(780))

    Item {
      id: keys
      focus: true
      Keys.onPressed: function(event) {
        var key = event.key
        var letter = event.text
        if (key === Qt.Key_Escape) {
          if (root.showSettings) root.showSettings = false
          else root.close()
        } else if (root.showSettings) {
          return
        } else if (key === Qt.Key_Tab) {
          root.selectTab(Model.nextTab(root.tab, 1))
        } else if (key === Qt.Key_Backtab) {
          root.selectTab(Model.nextTab(root.tab, -1))
        } else if (key === Qt.Key_Down || letter === "j") {
          if (root.tab === "bond") root.moveSelection(1)
          else scroller.contentY = Math.min(scroller.contentY + Style.space(40), Math.max(0, scroller.contentHeight - scroller.height))
        } else if (key === Qt.Key_Up || letter === "k") {
          if (root.tab === "bond") root.moveSelection(-1)
          else scroller.contentY = Math.max(0, scroller.contentY - Style.space(40))
        } else if (key === Qt.Key_Return || key === Qt.Key_Enter) {
          root.openSelected()
        } else if (letter === "r") {
          root.refresh()
        } else if (letter === "1") {
          root.selectTab("network")
        } else if (letter === "2") {
          root.selectTab("bond")
        } else if (letter === "3") {
          root.selectTab("names")
        } else if (letter === "4") {
          root.selectTab("votes")
        } else if (letter === "5") {
          root.selectTab("releases")
        } else if (letter === "6") {
          root.selectTab("pools")
        } else if (letter === "7") {
          root.selectTab("chains")
        } else if (letter === ",") {
          root.showSettings = true
        } else {
          return
        }
        event.accepted = true
      }
    }

    Column {
      id: body
      width: parent.width
      spacing: Style.spacing.xxl

      PanelHero {
        title: "THORChain"
        meta: root.showSettings ? "Settings" : Model.heroMeta(root.summary, root.summary ? root.summary.computedAt : 0)
        foreground: root.foreground
        fontFamily: root.fontFamily
        iconComponent: Component {
          ZapIcon {
            size: Style.font.display
            iconColor: root.levelColor(root.summary ? root.summary.level : "", root.foreground)
            strokeWidth: 1.75
          }
        }
        trailingControl: Component {
          Row {
            spacing: Style.spacing.md

            PanelActionButton {
              visible: !root.showSettings
              iconText: "\u{f0450}"
              tooltipText: "Fetch now"
              opacity: root.service && root.service.fetching ? 0.45 : 1
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: root.refresh()
            }
            PanelActionButton {
              iconText: root.showSettings ? "\u{f0156}" : "\u{f0493}"
              tooltipText: root.showSettings ? "Close settings" : "Settings"
              foreground: root.foreground
              fontFamily: root.fontFamily
              onClicked: {
                keys.forceActiveFocus()
                root.showSettings = !root.showSettings
              }
            }
          }
        }
      }

      PanelSeparator { foreground: root.foreground }

      // ---- Settings ----
      // Scrolls like the tabs do, so the lower sections stay reachable.
      Flickable {
        id: settingsScroller
        width: parent.width
        height: Math.min(contentHeight, Style.space(560))
        visible: root.showSettings
        contentWidth: width
        contentHeight: settingsLoader.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        Loader {
          id: settingsLoader
          width: settingsScroller.width
          active: root.showSettings
          sourceComponent: Component {
            SettingsView {
              width: settingsScroller.width
              service: root.service
              foreground: root.foreground
              accent: root.accent
              fontFamily: root.fontFamily
            }
          }
        }
      }

      ButtonGroup {
        visible: !root.showSettings
        options: Model.tabs(root.summary)
        value: root.tab
        // Seven tabs fit the panel's width only at the caption size.
        fontSize: Style.font.caption
        focusable: false
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        onChanged: function(value) {
          keys.forceActiveFocus()
          root.selectTab(value)
        }
      }

      Text {
        textFormat: Text.PlainText
        width: parent.width
        visible: !root.showSettings && text !== ""
        text: root.emptyText
        color: root.dim
        wrapMode: Text.WordWrap
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
      }

      Flickable {
        id: scroller
        width: parent.width
        height: Math.min(contentHeight, Style.space(560))
        visible: !root.showSettings && root.hasData
        contentWidth: width
        contentHeight: scrollContent.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        Column {
          id: scrollContent
          width: scroller.width
          spacing: Style.spacing.xxl

          // ================= Network =================
          Column {
            width: parent.width
            spacing: Style.spacing.xxl
            visible: root.tab === "network" && root.network !== null

            // The churn, big, with when the last one was and the height.
            Item {
              width: parent.width
              height: Math.max(heroLeft.implicitHeight, heroRight.implicitHeight)

              Column {
                id: heroLeft
                anchors.left: parent.left
                anchors.right: heroRight.left
                anchors.rightMargin: Style.spacing.xxl
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(4)

                Text {
                  textFormat: Text.PlainText
                  text: root.network ? root.network.hero.label.toUpperCase() : ""
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  font.letterSpacing: 1
                }
                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  text: root.network ? root.network.hero.value : ""
                  color: root.network ? root.levelColor(root.network.hero.level) : root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.displayLarge
                  font.bold: true
                  elide: Text.ElideRight
                  maximumLineCount: 1
                }
                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  text: root.network ? root.network.hero.note : ""
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  wrapMode: Text.WordWrap
                }
              }

              Column {
                id: heroRight
                width: Style.space(130)
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.spacing.lg

                Repeater {
                  model: root.network ? root.network.side : []
                  delegate: StatTile {
                    required property var modelData
                    width: heroRight.width
                    tile: modelData
                    foreground: root.foreground
                    warnColor: root.warnColor
                    fontFamily: root.fontFamily
                  }
                }
              }
            }

            // How far into the churn cycle, only while counting down.
            Rectangle {
              width: parent.width
              height: Style.space(3)
              visible: !!root.network && root.network.progress >= 0
              radius: height / 2
              color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)

              Rectangle {
                width: parent.width * (root.network ? Math.max(0, root.network.progress) : 0)
                height: parent.height
                radius: parent.radius
                color: root.foreground
              }
            }

            // What needs attention, one line each with a coloured dot.
            Column {
              width: parent.width
              spacing: Style.spacing.md
              visible: !!root.network && root.network.attention.length > 0

              Repeater {
                model: root.network ? root.network.attention : []
                delegate: Row {
                  required property var modelData
                  width: parent ? parent.width : 0
                  spacing: Style.spacing.lg

                  Rectangle {
                    width: Style.space(6)
                    height: width
                    radius: width / 2
                    anchors.verticalCenter: parent.verticalCenter
                    color: root.levelColor(modelData.level)
                  }
                  Text {
                    textFormat: Text.PlainText
                    width: parent.width - Style.space(6) - Style.spacing.lg
                    text: modelData.text
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                    elide: Text.ElideRight
                    maximumLineCount: 1
                  }
                }
              }
            }

            PanelSeparator { foreground: root.foreground }

            Grid {
              id: statGrid
              width: parent.width
              columns: 3
              rowSpacing: Style.spacing.xxl
              columnSpacing: Style.spacing.xxl

              Repeater {
                model: root.network ? root.network.stats : []
                delegate: StatTile {
                  required property var modelData
                  width: (statGrid.width - statGrid.columnSpacing * 2) / 3
                  tile: modelData
                  foreground: root.foreground
                  warnColor: root.warnColor
                  fontFamily: root.fontFamily
                }
              }
            }

            // ---- Security: the incentive pendulum ----
            PanelSeparator {
              foreground: root.foreground
              visible: !!root.network && root.network.security !== null
            }
            Text {
              textFormat: Text.PlainText
              visible: !!root.network && root.network.security !== null
              text: "SECURITY"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.letterSpacing: 1
            }
            Grid {
              id: securityGrid
              width: parent.width
              columns: 3
              rowSpacing: Style.spacing.xxl
              columnSpacing: Style.spacing.xxl
              visible: !!root.network && root.network.security !== null

              Repeater {
                model: root.network && root.network.security ? root.network.security.tiles : []
                delegate: StatTile {
                  required property var modelData
                  width: (securityGrid.width - securityGrid.columnSpacing * 2) / 3
                  tile: modelData
                  foreground: root.foreground
                  warnColor: root.warnColor
                  fontFamily: root.fontFamily
                }
              }
            }
            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: text !== ""
              text: root.network && root.network.security ? root.network.security.note : ""
              color: root.dim
              wrapMode: Text.WordWrap
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }

            // ---- Upgrade: node versions and proposals ----
            PanelSeparator { foreground: root.foreground }
            Column {
              width: parent.width
              spacing: Style.space(4)

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: root.network ? root.network.upgrade.title.toUpperCase() : ""
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.letterSpacing: 1
                elide: Text.ElideRight
                maximumLineCount: 1
              }
              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: root.network ? root.network.upgrade.value : ""
                color: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.heading
                elide: Text.ElideRight
                maximumLineCount: 1
              }
              Text {
                textFormat: Text.PlainText
                width: parent.width
                visible: text !== ""
                text: root.network ? root.network.upgrade.sub : ""
                color: root.dim
                wrapMode: Text.WordWrap
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
              }
            }
            Rectangle {
              width: parent.width
              height: Style.space(3)
              visible: !!root.network && root.network.upgrade.progress >= 0
              radius: height / 2
              color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)

              Rectangle {
                width: parent.width * (root.network ? Math.max(0, root.network.upgrade.progress) : 0)
                height: parent.height
                radius: parent.radius
                color: root.foreground
              }
            }
            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: text !== ""
              text: root.network ? root.network.upgrade.versions : ""
              color: root.dim
              wrapMode: Text.WordWrap
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
            // Whether nodes below the required version can be churned out.
            Row {
              width: parent.width
              spacing: Style.spacing.lg
              visible: !!root.network && root.network.upgrade.lowVersion !== null

              Rectangle {
                width: Style.space(6)
                height: width
                radius: width / 2
                anchors.verticalCenter: parent.verticalCenter
                color: root.network && root.network.upgrade.lowVersion ? root.levelColor(root.network.upgrade.lowVersion.level, root.dim) : root.dim
              }
              Text {
                textFormat: Text.PlainText
                width: parent.width - Style.space(6) - Style.spacing.lg
                text: root.network && root.network.upgrade.lowVersion ? root.network.upgrade.lowVersion.text : ""
                color: root.network && root.network.upgrade.lowVersion ? root.levelColor(root.network.upgrade.lowVersion.level) : root.foreground
                wrapMode: Text.WordWrap
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
              }
            }
            Repeater {
              model: root.network ? root.network.upgrade.proposals : []
              delegate: Row {
                required property var modelData
                width: parent ? parent.width : 0
                spacing: Style.spacing.lg

                Rectangle {
                  width: Style.space(6)
                  height: width
                  radius: width / 2
                  anchors.verticalCenter: parent.verticalCenter
                  color: root.levelColor(modelData.level, root.dim)
                }
                Text {
                  textFormat: Text.PlainText
                  width: parent.width - Style.space(6) - Style.spacing.lg
                  text: modelData.text
                  color: root.levelColor(modelData.level)
                  wrapMode: Text.WordWrap
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                }
              }
            }
          }

          // ================= Bonds =================
          Column {
            width: parent.width
            spacing: Style.spacing.xxl
            visible: root.tab === "bond"

            Column {
              width: parent.width
              spacing: Style.spacing.lg
              visible: root.bonds.empty

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: "Add the addresses you bond from, and each node you bond to shows here."
                color: root.dim
                wrapMode: Text.WordWrap
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
              }
              Button {
                text: "Add an address"
                bordered: true
                foreground: root.foreground
                accent: root.accent
                fontFamily: root.fontFamily
                onClicked: root.showSettings = true
              }
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: root.bonds.waiting && !root.bonds.empty
              text: "Waiting for the node list."
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
            }

            // Across all addresses, when there is more than one.
            Grid {
              id: totalsGrid
              width: parent.width
              columns: 3
              columnSpacing: Style.spacing.xxl
              visible: root.bonds.totals !== null

              Repeater {
                model: root.bonds.totals || []
                delegate: StatTile {
                  required property var modelData
                  width: (totalsGrid.width - totalsGrid.columnSpacing * 2) / 3
                  tile: modelData
                  foreground: root.foreground
                  warnColor: root.warnColor
                  fontFamily: root.fontFamily
                  valueSize: Style.font.heading
                }
              }
            }

            Repeater {
              model: root.bonds.addresses
              delegate: Column {
                id: addressBlock
                required property var modelData
                width: parent ? parent.width : 0
                spacing: Style.spacing.lg

                PanelSeparator {
                  foreground: root.foreground
                  visible: root.bonds.totals !== null
                }

                RowLayout {
                  width: parent.width
                  spacing: Style.spacing.md

                  Text {
                    textFormat: Text.PlainText
                    Layout.fillWidth: true
                    text: addressBlock.modelData.address
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    font.letterSpacing: 1
                    elide: Text.ElideMiddle
                    maximumLineCount: 1
                  }
                  PanelActionButton {
                    iconText: "\u{f03cc}"
                    tooltipText: "Open in the explorer"
                    foreground: root.foreground
                    fontFamily: root.fontFamily
                    onClicked: root.openUrl(addressBlock.modelData.url)
                  }
                }

                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  visible: !addressBlock.modelData.found
                  text: "No bond found. This address is not a bond provider or operator of any node."
                  color: root.dim
                  wrapMode: Text.WordWrap
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                }

                Grid {
                  id: addressGrid
                  width: parent.width
                  columns: 3
                  columnSpacing: Style.spacing.xxl
                  visible: addressBlock.modelData.found

                  Repeater {
                    model: addressBlock.modelData.stats
                    delegate: StatTile {
                      required property var modelData
                      width: (addressGrid.width - addressGrid.columnSpacing * 2) / 3
                      tile: modelData
                      foreground: root.foreground
                      warnColor: root.warnColor
                      fontFamily: root.fontFamily
                      valueSize: Style.font.heading
                    }
                  }
                }

                // One card per node.
                Repeater {
                  model: addressBlock.modelData.nodes
                  delegate: Item {
                    id: card
                    required property var modelData
                    readonly property bool selected: keys.activeFocus && root.selectedNode === modelData.node
                    width: addressBlock.width
                    implicitHeight: cardBody.implicitHeight + Style.spacing.lg * 2

                    onSelectedChanged: if (selected) root.reveal(card)

                    Rectangle {
                      anchors.fill: parent
                      radius: Style.cornerRadius
                      color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b,
                        card.selected ? 0.12 : (cardMouse.containsMouse ? 0.08 : 0.04))
                    }

                    Column {
                      id: cardBody
                      anchors.left: parent.left
                      anchors.right: parent.right
                      anchors.verticalCenter: parent.verticalCenter
                      anchors.leftMargin: Style.spacing.lg
                      anchors.rightMargin: Style.spacing.lg
                      spacing: Style.space(4)

                      RowLayout {
                        width: parent.width
                        spacing: Style.spacing.lg

                        Rectangle {
                          Layout.preferredWidth: Style.space(7)
                          Layout.preferredHeight: Style.space(7)
                          radius: width / 2
                          color: root.levelColor(card.modelData.level, root.foreground)
                        }
                        Text {
                          textFormat: Text.PlainText
                          Layout.fillWidth: true
                          text: card.modelData.short
                          color: root.foreground
                          font.family: root.fontFamily
                          font.pixelSize: Style.font.body
                          font.bold: true
                          elide: Text.ElideRight
                          maximumLineCount: 1
                        }
                        Text {
                          textFormat: Text.PlainText
                          text: card.modelData.status
                          color: root.levelColor(card.modelData.level, root.dim)
                          font.family: root.fontFamily
                          font.pixelSize: Style.font.caption
                          font.letterSpacing: 1
                        }
                        Text {
                          textFormat: Text.PlainText
                          text: card.modelData.amount
                          color: root.foreground
                          font.family: root.fontFamily
                          font.pixelSize: Style.font.body
                        }
                      }
                      Text {
                        textFormat: Text.PlainText
                        width: parent.width
                        visible: text !== ""
                        text: card.modelData.earned !== "" ? "Earned " + card.modelData.earned : ""
                        color: root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.bodySmall
                        elide: Text.ElideRight
                        maximumLineCount: 1
                      }
                      // Share, fee, version and slash, each with its label.
                      Item { width: 1; height: Style.space(4) }
                      Grid {
                        id: cellGrid
                        width: parent.width
                        columns: 4
                        columnSpacing: Style.spacing.lg

                        Repeater {
                          model: card.modelData.cells
                          delegate: StatTile {
                            required property var modelData
                            width: (cellGrid.width - cellGrid.columnSpacing * 3) / 4
                            tile: modelData
                            foreground: root.foreground
                            warnColor: root.warnColor
                            fontFamily: root.fontFamily
                            valueSize: Style.font.bodySmall
                          }
                        }
                      }
                      Item { width: 1; height: Style.space(4); visible: card.modelData.risk !== null }
                      RowLayout {
                        width: parent.width
                        spacing: Style.spacing.md
                        visible: card.modelData.risk !== null

                        Text {
                          textFormat: Text.PlainText
                          text: "CHURN-OUT RISK"
                          color: root.dim
                          font.family: root.fontFamily
                          font.pixelSize: Style.font.caption
                          font.letterSpacing: 1
                        }
                        Text {
                          textFormat: Text.PlainText
                          text: card.modelData.risk ? card.modelData.risk.value : ""
                          color: card.modelData.risk ? root.levelColor(card.modelData.risk.level) : root.foreground
                          font.family: root.fontFamily
                          font.pixelSize: Style.font.caption
                          font.bold: true
                        }
                        Item { Layout.fillWidth: true }
                      }
                      Text {
                        textFormat: Text.PlainText
                        width: parent.width
                        visible: card.modelData.risk !== null
                        text: card.modelData.risk ? card.modelData.risk.sub : ""
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        elide: Text.ElideRight
                        maximumLineCount: 1
                      }
                      Repeater {
                        model: card.modelData.issues
                        delegate: Text {
                          required property var modelData
                          textFormat: Text.PlainText
                          width: cardBody.width
                          text: modelData.text
                          color: root.levelColor(modelData.level)
                          font.family: root.fontFamily
                          font.pixelSize: Style.font.caption
                          wrapMode: Text.WordWrap
                        }
                      }
                    }

                    MouseArea {
                      id: cardMouse
                      anchors.fill: parent
                      hoverEnabled: true
                      cursorShape: Qt.PointingHandCursor
                      onClicked: {
                        keys.forceActiveFocus()
                        root.selectedNode = card.modelData.node
                        root.openUrl(card.modelData.url)
                      }
                    }
                  }
                }
              }
            }
          }

          // ================= Names =================
          Column {
            id: namesBlock
            width: parent.width
            spacing: Style.spacing.lg
            visible: root.tab === "names"

            Column {
              width: parent.width
              spacing: Style.spacing.lg
              visible: root.names.length === 0

              Text {
                textFormat: Text.PlainText
                width: parent.width
                text: root.service && root.service.namesBusy
                  ? "Looking for names your bond addresses own."
                  : "The THORNames your bond addresses own show here, with their expiry and the affiliate fees waiting. Add other names in the settings."
                color: root.dim
                wrapMode: Text.WordWrap
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
              }
              Button {
                text: "Open settings"
                bordered: true
                foreground: root.foreground
                accent: root.accent
                fontFamily: root.fontFamily
                onClicked: root.showSettings = true
              }
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: root.names.length > 0 && root.service && root.service.namesBusy
              text: "Reading names."
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: text !== ""
              text: root.service ? root.service.namesError : ""
              color: Commons.Color.urgent
              wrapMode: Text.WordWrap
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }

            Repeater {
              model: root.names
              delegate: Item {
                id: nameCard
                required property var modelData
                width: namesBlock.width
                implicitHeight: nameBody.implicitHeight + Style.spacing.lg * 2

                Rectangle {
                  anchors.fill: parent
                  radius: Style.cornerRadius
                  color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.04)
                }

                Column {
                  id: nameBody
                  anchors.left: parent.left
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.leftMargin: Style.spacing.lg
                  anchors.rightMargin: Style.spacing.lg
                  spacing: Style.spacing.md

                  RowLayout {
                    width: parent.width
                    spacing: Style.spacing.lg

                    Rectangle {
                      Layout.preferredWidth: Style.space(7)
                      Layout.preferredHeight: Style.space(7)
                      radius: width / 2
                      color: root.levelColor(nameCard.modelData.level, root.foreground)
                    }
                    Text {
                      textFormat: Text.PlainText
                      Layout.fillWidth: true
                      text: nameCard.modelData.name
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.title
                      font.bold: true
                      elide: Text.ElideRight
                      maximumLineCount: 1
                    }
                    Text {
                      textFormat: Text.PlainText
                      visible: text !== ""
                      text: nameCard.modelData.status
                      color: root.levelColor(nameCard.modelData.level, root.dim)
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      font.letterSpacing: 1
                    }
                    PanelActionButton {
                      iconText: "\u{f0450}"
                      tooltipText: "Read this name again"
                      opacity: root.service && root.service.namesBusy ? 0.45 : 1
                      foreground: root.foreground
                      fontFamily: root.fontFamily
                      onClicked: if (root.service) root.service.refreshNames([nameCard.modelData.name])
                    }
                  }

                  Grid {
                    id: nameGrid
                    width: parent.width
                    columns: 2
                    columnSpacing: Style.spacing.xxl
                    visible: nameCard.modelData.expiry !== ""

                    StatTile {
                      width: (nameGrid.width - nameGrid.columnSpacing) / 2
                      tile: ({ label: nameCard.modelData.expiryLabel, value: nameCard.modelData.expiry, sub: nameCard.modelData.expirySub, level: nameCard.modelData.level })
                      foreground: root.foreground
                      warnColor: root.warnColor
                      fontFamily: root.fontFamily
                      valueSize: Style.font.heading
                    }
                    StatTile {
                      width: (nameGrid.width - nameGrid.columnSpacing) / 2
                      tile: nameCard.modelData.fees
                      foreground: root.foreground
                      warnColor: root.warnColor
                      fontFamily: root.fontFamily
                      valueSize: Style.font.heading
                    }
                  }

                  // Fees collected towards the payout threshold.
                  Rectangle {
                    width: parent.width
                    height: Style.space(3)
                    visible: nameCard.modelData.progress >= 0
                    radius: height / 2
                    color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)

                    Rectangle {
                      width: parent.width * Math.max(0, nameCard.modelData.progress)
                      height: parent.height
                      radius: parent.radius
                      color: root.foreground
                    }
                  }

                  Column {
                    width: parent.width
                    spacing: Style.space(2)
                    visible: nameCard.modelData.owner !== "" || nameCard.modelData.aliases.length > 0

                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      visible: text !== ""
                      text: nameCard.modelData.owner
                      color: root.dim
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      elide: Text.ElideRight
                      maximumLineCount: 1
                    }
                    Repeater {
                      model: nameCard.modelData.aliases
                      delegate: Text {
                        required property var modelData
                        textFormat: Text.PlainText
                        width: nameBody.width
                        text: modelData.chain + "   " + modelData.address
                        color: root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        elide: Text.ElideRight
                        maximumLineCount: 1
                      }
                    }
                    Text {
                      textFormat: Text.PlainText
                      visible: text !== ""
                      text: nameCard.modelData.more
                      color: root.dim
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                    }
                  }

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    visible: text !== ""
                    text: nameCard.modelData.note
                    color: root.dim
                    wrapMode: Text.WordWrap
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.bodySmall
                  }
                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    visible: text !== ""
                    text: nameCard.modelData.hint
                    color: root.levelColor(nameCard.modelData.level, root.dim)
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                  }
                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    visible: text !== ""
                    text: nameCard.modelData.error !== "" ? nameCard.modelData.error : nameCard.modelData.asOf
                    color: nameCard.modelData.error !== "" ? Commons.Color.urgent : root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    elide: Text.ElideRight
                    maximumLineCount: 1
                  }
                }
              }
            }
          }

          // ================= Votes =================
          Column {
            id: votesBlock
            width: parent.width
            spacing: Style.spacing.lg
            visible: root.tab === "votes"

            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: root.votes === null
              text: root.service && root.service.votesBusy ? "Reading the node votes."
                : (root.service && root.service.votesError ? "No votes: " + root.service.votesError : "No votes read yet.")
              color: root.dim
              wrapMode: Text.WordWrap
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
            }

            Grid {
              id: votesGrid
              width: parent.width
              columns: 3
              columnSpacing: Style.spacing.xxl
              visible: root.votes !== null

              Repeater {
                model: root.votes ? root.votes.tiles : []
                delegate: StatTile {
                  required property var modelData
                  width: (votesGrid.width - votesGrid.columnSpacing * 2) / 3
                  tile: modelData
                  foreground: root.foreground
                  warnColor: root.warnColor
                  fontFamily: root.fontFamily
                  valueSize: Style.font.heading
                }
              }
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: root.votes !== null
              text: "CLOSEST TO PASSING"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.letterSpacing: 1
            }

            Repeater {
              model: root.votes ? root.votes.open : []
              delegate: Item {
                id: voteCard
                required property var modelData
                width: votesBlock.width
                implicitHeight: voteBody.implicitHeight + Style.spacing.lg * 2

                Rectangle {
                  anchors.fill: parent
                  radius: Style.cornerRadius
                  color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b,
                    voteMouse.containsMouse && voteCard.modelData.url !== "" ? 0.08 : 0.04)
                }

                Column {
                  id: voteBody
                  anchors.left: parent.left
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.leftMargin: Style.spacing.lg
                  anchors.rightMargin: Style.spacing.lg
                  spacing: Style.space(4)

                  RowLayout {
                    width: parent.width
                    spacing: Style.spacing.lg

                    Text {
                      textFormat: Text.PlainText
                      Layout.fillWidth: true
                      text: voteCard.modelData.title
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                      font.bold: true
                      elide: Text.ElideRight
                      maximumLineCount: 1
                    }
                    Text {
                      textFormat: Text.PlainText
                      text: voteCard.modelData.count
                      color: voteCard.modelData.close ? root.warnColor : root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                    }
                  }

                  Rectangle {
                    width: parent.width
                    height: Style.space(3)
                    radius: height / 2
                    color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)

                    Rectangle {
                      width: parent.width * Math.max(0, voteCard.modelData.progress)
                      height: parent.height
                      radius: parent.radius
                      color: voteCard.modelData.close ? root.warnColor : root.foreground
                    }
                  }

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    visible: text !== ""
                    text: [voteCard.modelData.key, voteCard.modelData.detail].filter(function(x) { return x !== "" }).join("  ·  ")
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    elide: Text.ElideRight
                    maximumLineCount: 1
                  }
                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    visible: text !== ""
                    text: voteCard.modelData.summary
                    color: root.dim
                    wrapMode: Text.WordWrap
                    maximumLineCount: 2
                    elide: Text.ElideRight
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                  }
                  Repeater {
                    model: voteCard.modelData.mine
                    delegate: Text {
                      required property var modelData
                      textFormat: Text.PlainText
                      width: voteBody.width
                      text: modelData.text
                      color: modelData.voted ? root.foreground : root.dim
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                      elide: Text.ElideRight
                      maximumLineCount: 1
                    }
                  }
                }

                MouseArea {
                  id: voteMouse
                  anchors.fill: parent
                  hoverEnabled: true
                  enabled: voteCard.modelData.url !== ""
                  cursorShape: Qt.PointingHandCursor
                  onClicked: root.openUrl(voteCard.modelData.url)
                }
              }
            }

            PanelSeparator {
              foreground: root.foreground
              visible: !!root.votes && root.votes.inForce.length > 0
            }
            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: !!root.votes && root.votes.inForce.length > 0
              text: "IN FORCE BY NODE VOTE"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.letterSpacing: 1
            }
            Repeater {
              model: root.votes ? root.votes.inForce : []
              delegate: RowLayout {
                required property var modelData
                width: votesBlock.width
                spacing: Style.spacing.lg

                Text {
                  textFormat: Text.PlainText
                  Layout.fillWidth: true
                  text: modelData.title
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                  elide: Text.ElideRight
                  maximumLineCount: 1
                }
                Text {
                  textFormat: Text.PlainText
                  text: modelData.value
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                }
              }
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: text !== ""
              text: root.service && root.service.votesError && root.votes !== null
                ? "Last read failed: " + root.service.votesError
                : (root.votes ? root.votes.asOf + (root.service && root.service.votesBusy ? ", reading again" : "") : "")
              color: root.service && root.service.votesError ? Commons.Color.urgent : root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
              maximumLineCount: 1
            }
          }

          // ================= Releases =================
          Column {
            id: releasesBlock
            width: parent.width
            spacing: Style.spacing.lg
            visible: root.tab === "releases"

            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: root.releases === null
              text: root.service && root.service.releasesBusy ? "Reading the milestones from GitLab."
                : (root.service && root.service.releasesError ? "No releases: " + root.service.releasesError : "No releases read yet.")
              color: root.dim
              wrapMode: Text.WordWrap
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
            }

            Grid {
              id: releasesGrid
              width: parent.width
              columns: 3
              columnSpacing: Style.spacing.xxl
              visible: root.releases !== null

              Repeater {
                model: root.releases ? root.releases.tiles : []
                delegate: StatTile {
                  required property var modelData
                  width: (releasesGrid.width - releasesGrid.columnSpacing * 2) / 3
                  tile: modelData
                  foreground: root.foreground
                  warnColor: root.warnColor
                  fontFamily: root.fontFamily
                  valueSize: Style.font.heading
                }
              }
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: root.releases !== null
              text: root.releases && root.releases.milestones.length ? "UPCOMING MILESTONES" : "NO MILESTONE ABOVE THE NETWORK'S VERSION"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.letterSpacing: 1
            }

            Repeater {
              model: root.releases ? root.releases.milestones : []
              delegate: Item {
                id: releaseCard
                required property var modelData
                width: releasesBlock.width
                implicitHeight: releaseBody.implicitHeight + Style.spacing.lg * 2

                Rectangle {
                  anchors.fill: parent
                  radius: Style.cornerRadius
                  color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.04)
                }

                Column {
                  id: releaseBody
                  anchors.left: parent.left
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.leftMargin: Style.spacing.lg
                  anchors.rightMargin: Style.spacing.lg
                  spacing: Style.space(4)

                  RowLayout {
                    width: parent.width
                    spacing: Style.spacing.lg

                    Text {
                      textFormat: Text.PlainText
                      Layout.fillWidth: true
                      text: releaseCard.modelData.title
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                      font.bold: true
                      elide: Text.ElideRight
                      maximumLineCount: 1
                    }
                    Text {
                      textFormat: Text.PlainText
                      text: releaseCard.modelData.count
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                    }
                  }

                  Rectangle {
                    width: parent.width
                    height: Style.space(3)
                    radius: height / 2
                    color: Qt.rgba(root.foreground.r, root.foreground.g, root.foreground.b, 0.12)

                    Rectangle {
                      width: parent.width * Math.max(0, Math.min(1, releaseCard.modelData.progress))
                      height: parent.height
                      radius: parent.radius
                      color: root.levelColor(releaseCard.modelData.level)
                    }
                  }

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: releaseCard.modelData.state
                    color: root.levelColor(releaseCard.modelData.level)
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    elide: Text.ElideRight
                    maximumLineCount: 1
                  }
                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    text: releaseCard.modelData.detail
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    elide: Text.ElideRight
                    maximumLineCount: 1
                  }

                  Repeater {
                    model: releaseCard.modelData.flagged
                    delegate: Item {
                      id: flagRow
                      required property var modelData
                      width: releaseBody.width
                      implicitHeight: flagText.implicitHeight + flagWhy.implicitHeight + Style.space(4)

                      Text {
                        id: flagText
                        textFormat: Text.PlainText
                        width: parent.width
                        text: flagRow.modelData.text
                        color: flagMouse.containsMouse ? root.accent : root.foreground
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        elide: Text.ElideRight
                        maximumLineCount: 1
                      }
                      Text {
                        id: flagWhy
                        anchors.top: flagText.bottom
                        textFormat: Text.PlainText
                        width: parent.width
                        text: flagRow.modelData.flags
                        color: flagRow.modelData.alert ? root.warnColor : root.dim
                        font.family: root.fontFamily
                        font.pixelSize: Style.font.caption
                        elide: Text.ElideRight
                        maximumLineCount: 1
                      }
                      MouseArea {
                        id: flagMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.openUrl(flagRow.modelData.url)
                      }
                    }
                  }

                  Text {
                    textFormat: Text.PlainText
                    width: parent.width
                    visible: releaseCard.modelData.url !== ""
                    text: (releaseCard.modelData.more ? releaseCard.modelData.more + "  ·  " : "") + "View all open on GitLab"
                    color: allMouse.containsMouse ? root.accent : root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                    elide: Text.ElideRight
                    maximumLineCount: 1

                    MouseArea {
                      id: allMouse
                      anchors.fill: parent
                      hoverEnabled: true
                      cursorShape: Qt.PointingHandCursor
                      onClicked: root.openUrl(releaseCard.modelData.url)
                    }
                  }
                }
              }
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: !!root.releases && root.releases.latest !== null
              text: "LATEST RELEASE"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              font.letterSpacing: 1
            }
            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: !!root.releases && root.releases.latest !== null
              text: root.releases && root.releases.latest ? root.releases.latest.title : ""
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              elide: Text.ElideRight
              maximumLineCount: 1
            }
            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: text !== ""
              text: root.releases && root.releases.latest ? root.releases.latest.text : ""
              color: root.dim
              wrapMode: Text.WordWrap
              maximumLineCount: 2
              elide: Text.ElideRight
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }

            PanelSeparator {
              foreground: root.foreground
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: text !== ""
              text: root.service && root.service.releasesError && root.releases !== null
                ? "Last read failed: " + root.service.releasesError
                : (root.releases ? root.releases.asOf + (root.service && root.service.releasesBusy ? ", reading again" : "") : "")
              color: root.service && root.service.releasesError ? Commons.Color.urgent : root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
              maximumLineCount: 1
            }
          }

          // ================= Pools =================
          Column {
            id: poolsBlock
            width: parent.width
            spacing: Style.spacing.lg
            visible: root.tab === "pools"

            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: root.pools === null
              text: "Waiting for the pool list."
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
            }

            Grid {
              id: poolsGrid
              width: parent.width
              columns: 3
              columnSpacing: Style.spacing.xxl
              visible: root.pools !== null

              Repeater {
                model: root.pools ? root.pools.tiles : []
                delegate: StatTile {
                  required property var modelData
                  width: (poolsGrid.width - poolsGrid.columnSpacing * 2) / 3
                  tile: modelData
                  foreground: root.foreground
                  warnColor: root.warnColor
                  fontFamily: root.fontFamily
                  valueSize: Style.font.heading
                }
              }
            }

            PanelSeparator {
              foreground: root.foreground
              visible: root.pools !== null
            }

            // A table, one line a pool. The numbers are in the unit the
            // header names; a pool that cannot be swapped says why.
            Component {
              id: poolCells
              RowLayout {
                property var row: ({})
                property bool header: false
                width: poolsBlock.width
                spacing: Style.spacing.md

                Row {
                  Layout.fillWidth: true
                  spacing: Style.spacing.md
                  clip: true

                  Text {
                    textFormat: Text.PlainText
                    text: header ? "POOL" : (row.name || "")
                    color: header ? root.dim : root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: header ? Style.font.caption : Style.font.bodySmall
                    font.bold: !header
                    font.letterSpacing: header ? 1 : 0
                  }
                  Text {
                    textFormat: Text.PlainText
                    visible: !header && text !== ""
                    text: header ? "" : (row.chain || "")
                    color: root.dim
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                  }
                  Text {
                    textFormat: Text.PlainText
                    visible: !header && text !== ""
                    text: header ? "" : (row.state || "")
                    color: header ? root.dim : root.levelColor(row.level, root.dim)
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.caption
                  }
                }
                Repeater {
                  model: [
                    { key: "liquidity", label: "LIQUIDITY", width: 76 },
                    { key: "depth", label: "2%", width: 48 },
                    { key: "volume", label: "24H", width: 52 },
                    { key: "apr", label: "APR", width: 48 }
                  ]
                  delegate: Text {
                    required property var modelData
                    textFormat: Text.PlainText
                    Layout.preferredWidth: Style.space(modelData.width)
                    horizontalAlignment: Text.AlignRight
                    text: header ? modelData.label : (row[modelData.key] || "")
                    color: header || modelData.key !== "liquidity" ? root.dim : root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: header ? Style.font.caption : Style.font.bodySmall
                    font.letterSpacing: header ? 1 : 0
                    elide: Text.ElideRight
                    maximumLineCount: 1
                  }
                }
              }
            }

            Loader {
              visible: root.pools !== null
              sourceComponent: poolCells
              onLoaded: item.header = true
            }
            Repeater {
              model: root.pools ? root.pools.rows : []
              delegate: Loader {
                required property var modelData
                sourceComponent: poolCells
                opacity: modelData.dim ? 0.55 : 1
                onLoaded: item.row = modelData
              }
            }

            Button {
              visible: !!root.pools && root.pools.more !== ""
              text: root.pools ? root.pools.more : ""
              foreground: root.foreground
              accent: root.accent
              fontFamily: root.fontFamily
              onClicked: {
                keys.forceActiveFocus()
                root.showAllPools = !root.showAllPools
              }
            }

            Text {
              textFormat: Text.PlainText
              width: parent.width
              visible: root.pools !== null
              text: "In " + (root.pools ? root.pools.unit : "RUNE") + ". Liquidity counts both sides of the pool; 2% is about how big a swap moves the price by 2%."
              color: root.dim
              wrapMode: Text.WordWrap
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }

          // ================= Chains =================
          Grid {
            id: chainGrid
            width: parent.width
            visible: root.tab === "chains"
            columns: 3
            rowSpacing: Style.spacing.xxl
            columnSpacing: Style.spacing.xxl

            Repeater {
              model: root.chains
              delegate: Column {
                required property var modelData
                width: (chainGrid.width - chainGrid.columnSpacing * 2) / 3
                spacing: Style.space(4)

                Row {
                  spacing: Style.spacing.md

                  Rectangle {
                    width: Style.space(6)
                    height: width
                    radius: width / 2
                    anchors.verticalCenter: parent.verticalCenter
                    color: modelData.ok ? Qt.darker(root.foreground, 2.2) : root.levelColor(modelData.level, root.foreground)
                  }
                  Text {
                    textFormat: Text.PlainText
                    text: modelData.chain
                    color: root.foreground
                    font.family: root.fontFamily
                    font.pixelSize: Style.font.title
                    font.bold: true
                  }
                }
                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  visible: text !== ""
                  text: modelData.state
                  color: root.levelColor(modelData.level, root.dim)
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  font.letterSpacing: 1
                  elide: Text.ElideRight
                  maximumLineCount: 1
                }
                Text {
                  textFormat: Text.PlainText
                  width: parent.width
                  visible: text !== ""
                  text: modelData.gas
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  elide: Text.ElideRight
                  maximumLineCount: 1
                }
              }
            }
          }
        }
      }

      // A failed fetch over older data: the data stays, with a note.
      Text {
        textFormat: Text.PlainText
        width: parent.width
        visible: !root.showSettings && root.hasData && text !== ""
        text: root.service && root.service.fetchError ? "Last fetch failed: " + root.service.fetchError : ""
        color: Commons.Color.urgent
        wrapMode: Text.WordWrap
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall
      }

      Text {
        textFormat: Text.PlainText
        width: parent.width
        visible: !root.showSettings
        text: root.tab === "bond"
          ? "tab next   j k select node   enter explorer   r fetch   , settings"
          : "tab next   1-7 tabs   r fetch   , settings"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        elide: Text.ElideRight
        maximumLineCount: 1
      }
    }
  }
}
