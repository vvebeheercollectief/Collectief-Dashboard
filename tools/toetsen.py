#!/usr/bin/env python3
# ══════════════════════════════════════
#  TOETSEN — draait de zelftest (?test=1) in headless Chrome en drukt de uitslag af
# ══════════════════════════════════════
#
#   python3 tools/toetsen.py                 # lokale no-cache server + headless Chrome
#   python3 tools/toetsen.py --url <URL>     # tegen staging of productie
#   python3 tools/toetsen.py --toon 40       # meer faalregels tonen
#
# WAAROM DIT BESTAAT. Er staat geen node op deze machine en er is niet altijd een browser-MCP.
# De zelftest leeft in de browser (`main.js` importeert `tests.js` bij `?test=1`) en schrijft
# zijn uitslag naar `window._testResult` ("2821 OK, 0 FAIL") plus `window._testFails`. Dit script
# is de weg daarheen zonder handwerk: het start de no-store preview-server, start Chrome met het
# DevTools-protocol, navigeert en pollt.
#
# Drie dingen die hier met opzet zo staan:
#   · VENSTER 1440x900. Tientallen toetsen meten echte breedtes (kolommen, afkapping). In een
#     venster van 0 breed geven die 0 terug en zijn ze vacuüm groen. Zie de les in
#     reference_lokaal_testen: bij een vergrendeld scherm was innerWidth 0.
#   · VERSE --user-data-dir per run. Anders serveert een eerder geregistreerde service worker
#     (cache cd-vNN) oude modules en draait de suite op code die niet meer bestaat.
#   · KORTE LOSSE EVALUATIES in een lus, geen lange `await` in de pagina. De pagina kan zichzelf
#     herladen bij een SW-update; dan geeft CDP "Execution context was destroyed" en is een
#     lange evaluatie verloren. Een korte poll pikt de draad gewoon weer op.
#
# Wat het NIET doet: inloggen (geen OAuth in een headless browser). De zelftest heeft dat ook niet
# nodig — hij draait op pure functies en op de DOM. Geauthenticeerde schrijfwegen verifieer je via
# de Google-Sheets-MCP op de test-Sheet.

import argparse, base64, hashlib, json, os, re, shutil, socket, struct, subprocess, sys, tempfile, time
from urllib import request as urlrequest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
SERVER = os.path.expanduser('~/.claude/nocache-server.py')


# ── Minimale WebSocket-client ────────────────────────────────────────────────────────────────
# Genoeg voor CDP: tekstframes heen (gemaskeerd, zoals de standaard eist van een client) en
# tekstframes terug. Geen extensies, geen fragmentatie boven 2^63. Bewust geen bibliotheek:
# er is geen pip-omgeving die we hier mogen aannemen.
class WS:
    def __init__(self, url, timeout=30):
        m = re.match(r'ws://([^:/]+):(\d+)(/.*)', url)
        if not m:
            raise RuntimeError('onbegrijpelijke websocket-URL: ' + url)
        host, port, pad = m.group(1), int(m.group(2)), m.group(3)
        self.sock = socket.create_connection((host, port), timeout=timeout)
        self.sock.settimeout(timeout)
        sleutel = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((
            f'GET {pad} HTTP/1.1\r\nHost: {host}:{port}\r\n'
            f'Upgrade: websocket\r\nConnection: Upgrade\r\n'
            f'Sec-WebSocket-Key: {sleutel}\r\nSec-WebSocket-Version: 13\r\n\r\n'
        ).encode())
        verwacht = base64.b64encode(hashlib.sha1(
            (sleutel + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
        kop = b''
        while b'\r\n\r\n' not in kop:
            brok = self.sock.recv(4096)
            if not brok:
                raise RuntimeError('verbinding verbroken tijdens de handdruk')
            kop += brok
        if verwacht.lower() not in kop.decode('latin1').lower():
            raise RuntimeError('websocket-handdruk geweigerd')
        self.rest = kop.split(b'\r\n\r\n', 1)[1]
        self._id = 0

    def _lees(self, n):
        while len(self.rest) < n:
            brok = self.sock.recv(65536)
            if not brok:
                raise RuntimeError('verbinding verbroken')
            self.rest += brok
        uit, self.rest = self.rest[:n], self.rest[n:]
        return uit

    def _frame(self, data):
        masker = os.urandom(4)
        gemaskeerd = bytes(b ^ masker[i % 4] for i, b in enumerate(data))
        n = len(data)
        if n < 126:
            kop = struct.pack('!BB', 0x81, 0x80 | n)
        elif n < (1 << 16):
            kop = struct.pack('!BBH', 0x81, 0x80 | 126, n)
        else:
            kop = struct.pack('!BBQ', 0x81, 0x80 | 127, n)
        return kop + masker + gemaskeerd

    def _ontvang(self):
        while True:
            b0, b1 = self._lees(2)
            opcode, n = b0 & 0x0F, b1 & 0x7F
            if n == 126:
                n = struct.unpack('!H', self._lees(2))[0]
            elif n == 127:
                n = struct.unpack('!Q', self._lees(8))[0]
            lading = self._lees(n)
            if opcode == 0x9:                       # ping → pong, anders sluit Chrome de pijp
                self.sock.sendall(b'\x8a\x80' + os.urandom(4))
                continue
            if opcode == 0x8:
                raise RuntimeError('websocket gesloten door de browser')
            if opcode in (0x1, 0x2):
                return lading.decode('utf8', 'replace')

    def roep(self, methode, params=None):
        self._id += 1
        eigen = self._id
        self.sock.sendall(self._frame(json.dumps(
            {'id': eigen, 'method': methode, 'params': params or {}}).encode()))
        while True:
            bericht = json.loads(self._ontvang())
            if bericht.get('id') == eigen:
                if 'error' in bericht:
                    raise RuntimeError(f"{methode}: {bericht['error'].get('message')}")
                return bericht.get('result', {})

    def evalueer(self, uitdrukking):
        """Eén korte evaluatie. Geeft (waarde, fouttekst) — nooit een uitzondering op een
        vernietigde context, want dat is de normale gang van zaken bij een SW-herlading."""
        try:
            r = self.roep('Runtime.evaluate', {
                'expression': uitdrukking, 'returnByValue': True, 'awaitPromise': False})
        except RuntimeError as e:
            return None, str(e)
        if r.get('exceptionDetails'):
            return None, r['exceptionDetails'].get('text', 'uitzondering')
        return r.get('result', {}).get('value'), None

    def sluit(self):
        try:
            self.sock.close()
        except Exception:
            pass


def vrije_poort():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def wacht_op_poort(poort, seconden=15):
    einde = time.time() + seconden
    while time.time() < einde:
        try:
            with socket.create_connection(('127.0.0.1', poort), timeout=0.4):
                return True
        except OSError:
            time.sleep(0.15)
    return False


def hoofd():
    p = argparse.ArgumentParser(description='Draai de zelftest van het dashboard.')
    p.add_argument('--url', help='Testen tegen deze URL i.p.v. de lokale server.')
    p.add_argument('--toon', type=int, default=25, help='Aantal faalregels om af te drukken.')
    p.add_argument('--wacht', type=int, default=420, help='Maximale wachttijd in seconden.')
    p.add_argument('--breed', type=int, default=1440)
    p.add_argument('--hoog', type=int, default=900)
    args = p.parse_args()

    if not os.path.exists(CHROME):
        print('Google Chrome niet gevonden op ' + CHROME, file=sys.stderr)
        return 2

    server = None
    if args.url:
        doel = args.url + ('&' if '?' in args.url else '?') + 'test=1'
    else:
        poort = vrije_poort()
        omgeving = dict(os.environ, PORT=str(poort))
        server = subprocess.Popen([sys.executable, SERVER, REPO],
                                  env=omgeving, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if not wacht_op_poort(poort):
            server.kill()
            print('preview-server startte niet op poort %d' % poort, file=sys.stderr)
            return 2
        doel = f'http://127.0.0.1:{poort}/index.html?test=1'

    profiel = tempfile.mkdtemp(prefix='cd-toetsen-')
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
        # /json/new wil PUT, niet GET — een GET geeft hier HTTP 405.
        verzoek = urlrequest.Request(f'http://127.0.0.1:{dbg}/json/new?about:blank', method='PUT')
        tab = json.loads(urlrequest.urlopen(verzoek, timeout=10).read())
        ws = WS(tab['webSocketDebuggerUrl'])
        ws.roep('Page.enable')
        ws.roep('Runtime.enable')
        ws.roep('Page.navigate', {'url': doel})

        einde = time.time() + args.wacht
        uitslag, vorige = None, None
        while time.time() < einde:
            time.sleep(1.0)
            waarde, _fout = ws.evalueer('window._testResult || ""')
            if waarde:
                uitslag = waarde
                break
            voortgang, _ = ws.evalueer('window._testVoortgang || ""')
            if voortgang and voortgang != vorige:
                vorige = voortgang
                print('  … ' + str(voortgang), file=sys.stderr)

        if not uitslag:
            titel, _ = ws.evalueer('document.title')
            print('GEEN UITSLAG binnen %ds (titel: %r).' % (args.wacht, titel), file=sys.stderr)
            print('Draai eerst  osascript -l JavaScript tools/syntaxcheck.js  — een syntaxfout in '
                  'tests.js geeft nul asserts in plaats van een rode.', file=sys.stderr)
            return 1

        print(uitslag)
        fails, _ = ws.evalueer(
            'JSON.stringify((window._testFails||[]).slice(0,%d))' % args.toon)
        lijst = json.loads(fails) if fails else []
        for regel in lijst:
            print('  FAIL  ' + (regel if isinstance(regel, str) else json.dumps(regel)))
        aantal, _ = ws.evalueer('(window._testFails||[]).length')
        if aantal and aantal > len(lijst):
            print('  … en nog %d' % (aantal - len(lijst)))
        return 0 if re.search(r'\b0 FAIL\b', uitslag) else 1
    finally:
        if ws:
            ws.sluit()
        chrome.terminate()
        if server:
            server.terminate()
        shutil.rmtree(profiel, ignore_errors=True)


if __name__ == '__main__':
    sys.exit(hoofd())
