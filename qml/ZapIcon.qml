// Lucide `zap` — https://lucide.dev/icons/zap (ISC license).
// Drawn as a path so the icon stays recolorable at runtime.
import QtQuick
import QtQuick.Shapes

Item {
  id: root

  property real size: 14
  property color iconColor: "white"
  property real strokeWidth: 2

  implicitWidth: size
  implicitHeight: size

  Shape {
    anchors.fill: parent
    preferredRendererType: Shape.CurveRenderer
    transformOrigin: Item.TopLeft
    scale: root.size / 24

    ShapePath {
      strokeWidth: root.strokeWidth
      strokeColor: root.iconColor
      fillColor: "transparent"
      capStyle: ShapePath.RoundCap
      joinStyle: ShapePath.RoundJoin
      PathSvg { path: "M4 14 a1 1 0 0 1 -0.78 -1.63 l9.9 -10.2 a0.5 0.5 0 0 1 0.86 0.46 l-1.92 6.02 A1 1 0 0 0 13 10 h7 a1 1 0 0 1 0.78 1.63 l-9.9 10.2 a0.5 0.5 0 0 1 -0.86 -0.46 l1.92 -6.02 A1 1 0 0 0 11 14 z" }
    }
  }
}
