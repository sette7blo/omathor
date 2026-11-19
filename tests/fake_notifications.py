# A stand-in notification service on a private session bus (run it under
# dbus-run-session). Runs the helper given as argv[1] with this script's stdin,
# records the Notify calls and the helper's arguments, and prints them as JSON.
import json
import subprocess
import sys
import threading

import gi

gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib

XML = """<node><interface name="org.freedesktop.Notifications">
<method name="Notify"><arg type="s" direction="in"/><arg type="u" direction="in"/><arg type="s" direction="in"/>
<arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="as" direction="in"/>
<arg type="a{sv}" direction="in"/><arg type="i" direction="in"/><arg type="u" direction="out"/></method>
</interface></node>"""

calls = []


def on_call(conn, sender, path, iface, method, params, invocation):
    app, _, _, summary, body, _, hints, _ = params.unpack()
    calls.append({"app": app, "summary": summary, "body": body, "urgency": hints.get("urgency")})
    invocation.return_value(GLib.Variant("(u)", (len(calls),)))


def main():
    helper = sys.argv[1]
    payload = sys.stdin.read()
    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    info = Gio.DBusNodeInfo.new_for_xml(XML).interfaces[0]
    bus.register_object("/org/freedesktop/Notifications", info, on_call, None, None)
    loop = GLib.MainLoop()
    result = {}

    def owned(*_):
        def run():
            argv = ["python3", "-I", helper]
            proc = subprocess.run(argv, input=payload, text=True, capture_output=True, timeout=20)
            result["helperExit"] = proc.returncode
            result["helperArgv"] = argv
            GLib.idle_add(loop.quit)
        threading.Thread(target=run, daemon=True).start()

    Gio.bus_own_name_on_connection(bus, "org.freedesktop.Notifications", Gio.BusNameOwnerFlags.NONE, owned, None)
    GLib.timeout_add_seconds(25, loop.quit)
    loop.run()
    result["calls"] = calls
    print(json.dumps(result))


if __name__ == "__main__":
    main()
