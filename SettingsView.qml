import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "Model.js" as Model

// The settings behind the gear: bond addresses, THORNames, what the bar
// shows, the currency, notifications, background refresh and the endpoints. All of it
// is saved in the widget's entry in shell.json.
Column {
  id: root

  property var service: null
  property color foreground: Commons.Color.foreground
  property color accent: Commons.Color.accent
  property string fontFamily: Style.font.family

  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property var options: service ? service.options : Model.settings(null)

  property string addressError: ""
  property string nameError: ""
  property string endpointError: ""

  spacing: Style.spacing.xxl

  function save(patch) {
    if (root.service) root.service.persistSettings(patch)
  }

  function addAddress() {
    if (!root.service) return
    var error = root.service.addAddress(addressField.text)
    root.addressError = error
    if (!error) addressField.text = ""
  }

  function addName() {
    if (!root.service) return
    var error = root.service.addName(nameField.text)
    root.nameError = error
    if (!error) nameField.text = ""
  }

  function ownerText(owner) {
    return owner ? "found from " + Model.shortAddress(owner) : "added by hand"
  }

  function saveEndpoints() {
    var thornode = thornodeField.text.trim().replace(/\/+$/, "")
    var midgard = midgardField.text.trim().replace(/\/+$/, "")
    if ((thornode && !Model.validBase(thornode)) || (midgard && !Model.validBase(midgard))) {
      root.endpointError = "Use an https address, or http to this computer or your own network."
      return
    }
    root.endpointError = ""
    root.save({ thornode: thornode, midgard: midgard })
  }

  // ---- Bond addresses ----
  Column {
    width: parent.width
    spacing: Style.spacing.lg

    PanelSectionHeader {
      text: "Bond addresses"
      foreground: root.foreground
      fontFamily: root.fontFamily
    }
    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: "The addresses you bond from. Bonds are found in the public node list, which is fetched whole, so fetching never sends an address. Each address is sent once, to Midgard, to find the THORNames it owns."
      color: root.dim
      wrapMode: Text.WordWrap
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
    Repeater {
      model: root.options.addresses
      delegate: RowLayout {
        required property var modelData
        width: parent ? parent.width : 0
        spacing: Style.spacing.md

        Text {
          textFormat: Text.PlainText
          Layout.fillWidth: true
          text: modelData
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
          elide: Text.ElideMiddle
          maximumLineCount: 1
        }
        PanelActionButton {
          iconText: "\u{f01b4}"
          tooltipText: "Remove, with its names"
          foreground: root.foreground
          fontFamily: root.fontFamily
          onClicked: if (root.service) root.service.removeAddress(modelData)
        }
      }
    }
    RowLayout {
      width: parent.width
      spacing: Style.spacing.md
      visible: root.options.addresses.length < 10

      TextField {
        id: addressField
        Layout.fillWidth: true
        placeholderText: "thor1…"
        foreground: root.foreground
        accent: root.accent
        Keys.onReturnPressed: root.addAddress()
        onTextChanged: root.addressError = ""
      }
      Button {
        text: "Add"
        enabled: addressField.text.trim() !== ""
        bordered: true
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        onClicked: root.addAddress()
      }
    }
    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: text !== ""
      text: root.addressError
      color: Commons.Color.urgent
      wrapMode: Text.WordWrap
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  PanelSeparator { foreground: root.foreground }

  // ---- THORNames ----
  Column {
    width: parent.width
    spacing: Style.spacing.lg

    PanelSectionHeader {
      text: "THORNames"
      foreground: root.foreground
      fontFamily: root.fontFamily
    }
    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: "Names your bond addresses own are found on their own. Add any other name by hand. Each name is read by name and saved, so the expiry countdown keeps going without asking again."
      color: root.dim
      wrapMode: Text.WordWrap
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
    Repeater {
      model: root.options.names
      delegate: RowLayout {
        required property var modelData
        width: parent ? parent.width : 0
        spacing: Style.spacing.md

        Column {
          Layout.fillWidth: true
          spacing: Style.space(2)

          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: modelData.name
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
            elide: Text.ElideRight
            maximumLineCount: 1
          }
          Text {
            textFormat: Text.PlainText
            width: parent.width
            text: root.ownerText(modelData.owner)
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            elide: Text.ElideRight
            maximumLineCount: 1
          }
        }
        PanelActionButton {
          iconText: "\u{f01b4}"
          tooltipText: "Remove"
          foreground: root.foreground
          fontFamily: root.fontFamily
          onClicked: if (root.service) root.service.removeName(modelData.name)
        }
      }
    }
    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: root.service && root.service.namesBusy
      text: "Looking up names."
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
    RowLayout {
      width: parent.width
      spacing: Style.spacing.md
      visible: root.options.names.length < 20

      TextField {
        id: nameField
        Layout.fillWidth: true
        placeholderText: "Add a name by hand"
        foreground: root.foreground
        accent: root.accent
        Keys.onReturnPressed: root.addName()
        onTextChanged: root.nameError = ""
      }
      Button {
        text: "Add"
        enabled: nameField.text.trim() !== ""
        bordered: true
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        onClicked: root.addName()
      }
    }
    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: text !== ""
      text: root.nameError || (root.service ? root.service.namesError : "")
      color: Commons.Color.urgent
      wrapMode: Text.WordWrap
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
    ButtonGroup {
      options: [
        { value: "manual", label: "Manual" },
        { value: "daily", label: "Daily" },
        { value: "weekly", label: "Weekly" }
      ]
      value: root.options.namesRefresh
      fontSize: Style.font.bodySmall
      focusable: false
      foreground: root.foreground
      accent: root.accent
      fontFamily: root.fontFamily
      onChanged: function(value) { root.save({ namesRefresh: value }) }
    }
    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: root.options.namesRefresh === "manual"
        ? "Names are read again only when you press refresh on a card in the Names tab. The expiry still counts down; the fees waiting show when they were read."
        : "Each name is read again once a " + (root.options.namesRefresh === "daily" ? "day" : "week") + ". Only the names are sent, never your addresses."
      color: root.dim
      wrapMode: Text.WordWrap
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  PanelSeparator { foreground: root.foreground }

  // ---- Bar ----
  Column {
    width: parent.width
    spacing: Style.spacing.lg

    PanelSectionHeader {
      text: "Bar"
      foreground: root.foreground
      fontFamily: root.fontFamily
    }
    ButtonGroup {
      options: [
        { value: "none", label: "Colour only" },
        { value: "churn", label: "Next churn" },
        { value: "reward", label: "Reward" }
      ]
      value: root.options.barLabel
      fontSize: Style.font.bodySmall
      focusable: false
      foreground: root.foreground
      accent: root.accent
      fontFamily: root.fontFamily
      onChanged: function(value) { root.save({ barLabel: value }) }
    }
    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: "The bolt is your theme's colour when all is well, gold when the network is degraded (a halted chain or churn), red when one of your nodes or the chain itself needs attention, and dim when the data is old. Reward is what your bonds have earned since the last churn."
      color: root.dim
      wrapMode: Text.WordWrap
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  PanelSeparator { foreground: root.foreground }

  // ---- Currency ----
  Column {
    width: parent.width
    spacing: Style.spacing.lg

    PanelSectionHeader {
      text: "Currency"
      foreground: root.foreground
      fontFamily: root.fontFamily
    }
    ButtonGroup {
      options: [
        { value: "RUNE", label: "RUNE" },
        { value: "USD", label: "USD" }
      ]
      value: root.options.currency
      fontSize: Style.font.bodySmall
      focusable: false
      foreground: root.foreground
      accent: root.accent
      fontFamily: root.fontFamily
      onChanged: function(value) { root.save({ currency: value }) }
    }
    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: "USD uses THORChain's own RUNE price from the same API."
      color: root.dim
      wrapMode: Text.WordWrap
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  PanelSeparator { foreground: root.foreground }

  // ---- Refresh and notifications ----
  Column {
    width: parent.width
    spacing: Style.spacing.lg

    PanelSectionHeader {
      text: "Updates"
      foreground: root.foreground
      fontFamily: root.fontFamily
    }
    Toggle {
      width: parent.width
      label: "Refresh in the background"
      description: "Every two minutes, so the bar colour stays current. Off: only while this panel is open."
      checked: root.options.refresh
      foreground: root.foreground
      accent: root.accent
      fontFamily: root.fontFamily
      onClicked: root.save({ refresh: !root.options.refresh })
    }
    Toggle {
      width: parent.width
      label: "Notifications"
      description: "Churn started or finished, a chain halted or resumed, one of your nodes changed status, was jailed or is leaving, a THORName has a week left or expired. Off unless you turn it on."
      checked: root.options.notify
      foreground: root.foreground
      accent: root.accent
      fontFamily: root.fontFamily
      onClicked: root.save({ notify: !root.options.notify })
    }
  }

  PanelSeparator { foreground: root.foreground }

  // ---- Endpoints ----
  Column {
    width: parent.width
    spacing: Style.spacing.lg

    PanelSectionHeader {
      text: "Endpoints"
      foreground: root.foreground
      fontFamily: root.fontFamily
    }
    Text {
      textFormat: Text.PlainText
      width: parent.width
      text: "Empty uses the public ones: THORNode at gateway.liquify.com, falling back to public-thornode.nativeswap.io, and Midgard at gateway.liquify.com. Point these at your own node if you run one."
      color: root.dim
      wrapMode: Text.WordWrap
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
    TextField {
      id: thornodeField
      width: parent.width
      placeholderText: "THORNode API, e.g. https://thornode.example"
      text: root.options.thornode
      foreground: root.foreground
      accent: root.accent
      Keys.onReturnPressed: root.saveEndpoints()
    }
    TextField {
      id: midgardField
      width: parent.width
      placeholderText: "Midgard, e.g. https://midgard.example"
      text: root.options.midgard
      foreground: root.foreground
      accent: root.accent
      Keys.onReturnPressed: root.saveEndpoints()
    }
    Row {
      spacing: Style.spacing.lg

      Button {
        text: "Save"
        enabled: thornodeField.text.trim().replace(/\/+$/, "") !== root.options.thornode
          || midgardField.text.trim().replace(/\/+$/, "") !== root.options.midgard
        bordered: true
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        onClicked: root.saveEndpoints()
      }
      Button {
        visible: root.options.thornode !== "" || root.options.midgard !== ""
        text: "Use the public ones"
        foreground: root.foreground
        accent: root.accent
        fontFamily: root.fontFamily
        onClicked: {
          thornodeField.text = ""
          midgardField.text = ""
          root.endpointError = ""
          root.save({ thornode: "", midgard: "" })
        }
      }
    }
    Text {
      textFormat: Text.PlainText
      width: parent.width
      visible: text !== ""
      text: root.endpointError
      color: Commons.Color.urgent
      wrapMode: Text.WordWrap
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }
}
