import QtQuick
import qs.Commons

// A small dim label over a value, with an optional dim line under it, the
// way Omarchy's weather panel shows its readings.
Column {
  id: root

  property var tile: ({})
  property color foreground: Color.foreground
  property color warnColor: "#E5C736"
  property string fontFamily: Style.font.family
  property int valueSize: Style.font.title

  readonly property color dim: Qt.darker(foreground, 1.5)
  readonly property color valueColor: !tile ? foreground
    : (tile.level === "alert" ? Color.urgent : (tile.level === "warn" ? warnColor : foreground))

  spacing: Style.space(4)

  Text {
    textFormat: Text.PlainText
    width: root.width
    text: root.tile ? String(root.tile.label || "").toUpperCase() : ""
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    font.letterSpacing: 1
    elide: Text.ElideRight
    maximumLineCount: 1
  }
  Text {
    textFormat: Text.PlainText
    width: root.width
    text: root.tile ? root.tile.value : ""
    color: root.valueColor
    font.family: root.fontFamily
    font.pixelSize: root.valueSize
    elide: Text.ElideRight
    maximumLineCount: 1
  }
  Text {
    textFormat: Text.PlainText
    width: root.width
    visible: text !== ""
    text: root.tile ? root.tile.sub : ""
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    // Two lines, so a note like "of 90 RUNE, paid in ETH.USDC" is not cut.
    wrapMode: Text.WordWrap
    elide: Text.ElideRight
    maximumLineCount: 2
  }
}
