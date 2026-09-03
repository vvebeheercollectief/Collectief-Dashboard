#!/usr/bin/env python3
# ══════════════════════════════════════
#  MEET — één JS-uitdrukking evalueren op een pagina, in een venster van een gekozen maat
# ══════════════════════════════════════
#
#   python3 tools/meet.py --breed 1920 --js "document.title"
#   python3 tools/meet.py --url https://… --breed 1440 --js-bestand probe.js
#
# WAAROM DIT BESTAAT. `tools/toetsen.py` draait de hele zelftest; voor een losse meting (past de
# kopbalk op één regel? hoe breed is die kolom echt?) is dat een minuut wachten op iets wat je
# niet vroeg. Dit is dezelfde weg — no-cache server + headless Chrome via het DevTools-protocol —
# maar dan met één uitdrukking en zonder `?test=1`.
#
# De uitdrukking wordt geëvalueerd MET awaitPromise, dus een `(async()=>{…})()` mag. Geef iets
# terug dat JSON-serialiseerbaar is (een string, getal of gewoon object); DOM-knopen niet.

import argparse, json, os, shutil, subprocess, sys, tempfile, time
from urllib import request as urlrequest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from toetsen import WS, CHROME, SERVER, REPO, vrije_poort, wacht_op_poort   # noqa: E402


def hoofd():
    p = argparse.ArgumentParser(description='Evalueer JS op een pagina in headless Chrome.')
    p.add_argument('--url', help='Doel-URL; zonder dit wordt de lokale no-cache server gebruikt.')
    p.add_argument('--pad', default='/index.html', help='Pad op de lokale server.')
    p.add_argument('--js', help='JS-uitdrukking.')
    p.add_argument('--js-bestand', help='Bestand met de JS-uitdrukking.')
    p.add_argument('--breed', type=int, default=1440)
    p.add_argument('--hoog', type=int, default=900)
    p.add_argument('--wacht', type=float, default=3.0, help='Seconden laten laden vóór de meting.')
    p.add_argument('--schermafdruk', help='Sla een PNG van de pagina op onder dit pad (ná de JS).')
    args = p.parse_args()

    uitdrukking = args.js
    if args.js_bestand:
        uitdrukking = open(args.js_bestand).read()
    if not uitdrukking:
        print('Geef --js of --js-bestand mee.', file=sys.stderr)
        return 2

    server = None
    if args.url:
        doel = args.url
    else:
        poort = vrije_poort()
        server = subprocess.Popen([sys.executable, SERVER, REPO], env=dict(os.environ, PORT=str(poort)),
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not wacht_op_poort(poort):
            server.kill(); print('preview-server startte niet', file=sys.stderr); return 2
        doel = f'http://127.0.0.1:{poort}{args.pad}'

    profiel = tempfile.mkdtemp(prefix='cd-meet-')
    dbg = vrije_poort()
    chrome = subprocess.Popen([
        CHROME, '--headless=new', f'--remote-debugging-port={dbg}',
        f'--user-data-dir={profiel}', f'--window-size={args.breed},{args.hoog}',
        '--no-first-run', '--no-default-browser-check', '--disable-gpu',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
        'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    ws = None
    try:
        if not wacht_op_poort(dbg, 25):
            raise RuntimeError('Chrome opende geen debug-poort')
        verzoek = urlrequest.Request(f'http://127.0.0.1:{dbg}/json/new?about:blank', method='PUT')
        tab = json.loads(urlrequest.urlopen(verzoek, timeout=10).read())
        ws = WS(tab['webSocketDebuggerUrl'])
        ws.roep('Page.enable'); ws.roep('Runtime.enable')
        ws.roep('Page.navigate', {'url': doel})
        time.sleep(args.wacht)
        r = ws.roep('Runtime.evaluate', {'expression': uitdrukking,
                                         'returnByValue': True, 'awaitPromise': True})
        if r.get('exceptionDetails'):
            print('FOUT: ' + r['exceptionDetails'].get('text', 'uitzondering'), file=sys.stderr)
            det = r['exceptionDetails'].get('exception', {})
            if det.get('description'):
                print(det['description'], file=sys.stderr)
            return 1
        waarde = r.get('result', {}).get('value')
        print(json.dumps(waarde, indent=2, ensure_ascii=False) if not isinstance(waarde, str) else waarde)
        if args.schermafdruk:
            # Ná de JS: die zet de pagina eerst in de stand die je wilt zien (login-gate weg,
            # rijen erin). Een screenshot dwingt bovendien een echte tekening af — zonder dat
            # blijven getransitioneerde eigenschappen in headless op hun oude waarde staan.
            import base64 as _b64, time as _t
            _t.sleep(0.6)
            beeld = ws.roep('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': True})
            with open(args.schermafdruk, 'wb') as f:
                f.write(_b64.b64decode(beeld['data']))
            print('schermafdruk: ' + args.schermafdruk, file=sys.stderr)
        return 0
    finally:
        if ws: ws.sluit()
        chrome.terminate()
        if server: server.terminate()
        shutil.rmtree(profiel, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(hoofd())
