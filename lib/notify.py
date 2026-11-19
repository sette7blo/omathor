"""Desktop notifications for the omathor panel, sent over D-Bus.

The panel writes one line of JSON on stdin: a list of {title, body, urgent}.
Titles can hold a THORName or a node address, so they are never put in a
process's arguments, as notify-send would need them: other accounts on the
computer can read every process's arguments. Exits 1 if the notification
service could not be reached, so the panel can fall back to a notice that
names nothing.
"""

import json
import sys

import gi

gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib

LIMIT = 5


def clean(value, size):
    text = value if isinstance(value, str) else ""
    return "".join(ch for ch in text if ch.isprintable())[:size]


def main():
    try:
        items = json.loads(sys.stdin.readline() or "[]")
    except ValueError:
        return 2
    if not isinstance(items, list):
        return 2
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    for item in items[:LIMIT]:
        if not isinstance(item, dict):
            continue
        title = clean(item.get("title"), 200)
        if not title:
            continue
        # Urgency 2 is critical, 1 normal: what notify-send -u critical sets.
        hints = {"urgency": GLib.Variant("y", 2 if item.get("urgent") is True else 1)}
        bus.call_sync(
            "org.freedesktop.Notifications",
            "/org/freedesktop/Notifications",
            "org.freedesktop.Notifications",
            "Notify",
            GLib.Variant("(susssasa{sv}i)", ("Omathor", 0, "", title, clean(item.get("body"), 400), [], hints, -1)),
            None,
            Gio.DBusCallFlags.NONE,
            5000,
            None,
        )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except GLib.Error:
        sys.exit(1)
