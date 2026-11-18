import QtQuick
import Quickshell
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "qml"
import "Model.js" as Model

// A bolt on the bar, coloured by health: the theme's foreground when all is
// well, gold when the network is degraded, the theme's urgent colour when
// something needs attention, and dimmed when there is no fresh data. The
// settings can add the churn countdown or the accrued reward next to it.
BarWidget {
  id: root
  moduleName: "io.github.sette7blo.omathor"

  // Service.qml instance, provided by Omarchy's plugin host.
  readonly property var service: bar && bar.shell && typeof bar.shell.serviceFor === "function"
    ? bar.shell.serviceFor(moduleName) : null

  readonly property var summary: service ? service.summary : null
  readonly property var options: service ? service.options : Model.settings(settings)
  readonly property string level: summary ? summary.level : "unknown"

  readonly property color foreground: bar ? bar.barForeground : Commons.Color.foreground
  readonly property color dim: Qt.darker(foreground, 1.55)
  // A literal gold, as Omarchy's own panels use: several themes' "yellow"
  // is not yellow.
  readonly property color warnColor: "#E5C736"
  readonly property color iconColor: level === "alert" ? Commons.Color.urgent
    : (level === "warn" ? warnColor : (level === "ok" ? foreground : dim))

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("service" in target) target.service = root.service
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  onBarChanged: injectPanel()
  onServiceChanged: injectPanel()

  // Panel contract for the bar's popout coordinator.
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }
  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }
  function togglePanel() {
    if (panelLoader.item) panelLoader.item.toggle()
  }
  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  TextMetrics {
    id: labelMetrics
    font.family: button.fontFamily
    font.pixelSize: button.fontSize
    text: button.labelText
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    foreground: root.iconColor
    iconComponent: Component {
      ZapIcon {
        size: Style.bar.iconCanvas
        iconColor: root.iconColor
        strokeWidth: 2.2

        Behavior on iconColor {
          enabled: !root.bar || root.bar.foregroundAnimationEnabled
          ColorAnimation { duration: Style.duration(160) }
        }
      }
    }
    // The slot is sized for a lone icon; widen it while a label shows.
    fixedWidth: vertical ? -1
      : slotSize + (labelText !== "" ? Math.ceil(labelMetrics.width) + Style.space(4) : 0)
    labelText: !root.vertical ? Model.barLabel(root.summary, root.options) : ""
    tooltipText: Model.tooltip(root.summary)
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.LeftButton) {
        root.togglePanel()
      } else if (buttonCode === Qt.RightButton) {
        if (root.service) root.service.fetch(true)
      }
    }
  }
}
