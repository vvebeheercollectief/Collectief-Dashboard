# Testomgeving + automatisch uitrollen — Implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een volledige, veilige tweeling van het dashboard (voorkant + achterkant) op een vaste test-link met eigen test-data, die automatisch in sync blijft met productie — zodat de latere verbouwing (klus 1+2) en alles daarna veilig getest kan worden vóór go-live.

**Architecture:** Eén codebase, omgeving bepaald door de hostname. De frontend kiest tussen productie- en test-`SID`/OneSignal op basis van `location.hostname` (fail-safe: alles wat geen bekende productie-URL is, draait op de test-data). De achterkant (Apps Script) wordt vanuit één bron via `clasp` + een GitHub Action uitgerold: een push op `staging` → test-scriptId, een merge naar `main` → prod-scriptId. De test-link is Vercel's vaste branch-alias van de `staging`-branch.

**Tech Stack:** Statische `index.html` op Vercel (geen build-stap) · Google Identity Services (OAuth, origin-gebonden) · Google Sheets API · Apps Script (container-bound, Web App + triggers) · `@google/clasp` · GitHub Actions · OneSignal · `gh` CLI.

**Omgevings-feiten (geverifieerd 2026-06-09):**
- Vercel-project `collectief-dashboard`, team `vve-beheer-collectief`. Geen eigen domein.
- Productie-URL's (bekend): `collectief-dashboard.vercel.app` (primair), `collectief-dashboard-vve-beheer-collectief.vercel.app`, `collectief-dashboard-vvebeheercollectief-vve-beheer-collectief.vercel.app`, en de main-branch-alias `collectief-dashboard-git-main-vve-beheer-collectief.vercel.app`.
- Verwachte **staging-URL**: `collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app` (Vercel's vaste branch-alias; te bevestigen ná de eerste push in Taak 5).
- Repo: `github.com/vvebeheercollectief/Collectief-Dashboard`. `gh` ingelogd als `vvebeheercollectief`, scopes `repo` (mist `workflow` → Taak 9).
- Lokaal ontbreken `node`/`npm`/`clasp` (Taak 1). `apps-script/` heeft `Code.gs`, `Notifications.gs`, `Extra functies.gs`, `AutoPrioriteit.gs.gs`, `README.md`; **geen** `.clasp.json`/`appsscript.json`/`.github/workflows/`.

**Eigenaarschap:** Code, git en CI doet Claude. Stappen met 🧑 **(samen)** vereisen het Google-account van de gebruiker (Sheet kopiëren, Cloud Console, OneSignal, `clasp login`) — Claude begeleidt, de gebruiker klikt/akkordeert.

---

## File Structure

| Bestand | Actie | Verantwoordelijkheid |
|---|---|---|
| `index.html` (CONFIG ~1152-1162, boot ~1232, tests ~4063) | Modify | Omgevingsherkenning (`_isStagingHost`, `IS_STAGING`), `SID`/`ONESIGNAL_APP_ID`-schakelaar, TESTOMGEVING-balk, unit-tests. |
| `apps-script/Notifications.gs` (regel 21 + usages) | Modify | `ONESIGNAL_APP_ID` van hardcoded const → Script Property-lezer (één bron, twee omgevingen). |
| `apps-script/appsscript.json` | Create | clasp-manifest (vereist). |
| `.clasp.json` | Create (gitignored) | clasp-doel (scriptId + rootDir); lokaal + door CI per branch gegenereerd. |
| `.gitignore` | Create/Modify | `.clasp.json`, `.clasprc.json`, `node_modules/` uitsluiten. |
| `.github/workflows/apps-script-deploy.yml` | Create | Auto-deploy: `staging`→test-scriptId, `main`→prod-scriptId. |

**Niet in git, wél nodig (waarden vastgelegd tijdens uitvoering):** test-Sheet-ID, test-OneSignal app-id + REST-key, prod/test-scriptId, prod/test-deploymentId, `~/.clasprc.json` (→ GitHub-secrets).

---

## Taak 1: Werkbranch + toolchain

**Files:** geen code; git + lokale tools.

- [ ] **Stap 1: Maak en push de `staging`-branch (vanaf actuele `main`)**

```bash
# vanuit ~/collectief-dashboard
git checkout main
git pull --ff-only
git checkout -b staging
git push -u origin staging
```
Verwacht: branch `staging` bestaat lokaal en op origin. Vercel maakt automatisch een preview-deploy aan (URL bevestigen we in Taak 5).

> Alle implementatiewerk gebeurt op `staging`. `main` (= productie) raken we pas bij go-live (Taak 10).

- [ ] **Stap 2: Installeer Node + clasp 🧑 (samen indien nodig)**

```bash
# Node aanwezig?
node -v || brew install node      # geen brew? → https://nodejs.org LTS-installer
npm install -g @google/clasp@2.4.2
clasp --version
```
Verwacht: `clasp --version` toont `2.4.2` (of nabij). Bij rechtenfout op `-g`: `npm config set prefix ~/.npm-global` en `~/.npm-global/bin` aan `PATH` toevoegen, daarna opnieuw.

- [ ] **Stap 3: Zet de Apps Script API aan 🧑 (samen)**

Open https://script.google.com/home/usersettings en zet **"Google Apps Script API"** op **ON** (eenmalig; clasp kan anders niet pushen).
Verwacht: toggle staat op On.

- [ ] **Stap 4: Commit (alleen branch-aanmaak — niets te committen nog)**

Geen bestandswijziging in deze taak; door naar Taak 2.

---

## Taak 2: Voorkant-tweeling — omgevingsherkenning (TDD)

**Files:**
- Modify: `index.html` CONFIG-blok (regels 1156 & 1161), boot (~1232), test-blok (~4062).

Doel: één codebase die op productie-hosts de echte `SID`/OneSignal gebruikt en op élke andere host (staging, preview, localhost) de test-waarden — plus een zichtbare TESTOMGEVING-balk. Fail-safe: onbekende host ⇒ test-data, zodat een willekeurige preview nooit de echte Sheet raakt.

- [ ] **Stap 1: Schrijf de falende test in het `?test=1`-blok**

In `index.html`, vlak vóór `const totOk = ok + _tOk, totFail = fail + _tFail;` (nu regel 4063), invoegen:

```javascript
  // ── _isStagingHost ── (fail-safe: alleen bekende productie-hosts = productie)
  truthy('prod host = geen staging',     _isStagingHost('collectief-dashboard.vercel.app') === false);
  truthy('prod team-alias = geen staging', _isStagingHost('collectief-dashboard-vve-beheer-collectief.vercel.app') === false);
  truthy('main-branch alias = geen staging', _isStagingHost('collectief-dashboard-git-main-vve-beheer-collectief.vercel.app') === false);
  truthy('staging host = staging',       _isStagingHost('collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app') === true);
  truthy('andere preview = staging (veilig)', _isStagingHost('collectief-dashboard-git-experiment-vve-beheer-collectief.vercel.app') === true);
  truthy('localhost = staging',          _isStagingHost('localhost') === true);
```

- [ ] **Stap 2: Draai de test en bevestig dat hij faalt**

```bash
# vanuit ~/collectief-dashboard
python3 -m http.server 8099 >/dev/null 2>&1 &
```
Open `http://localhost:8099/index.html?test=1` (preview-tools of browser), lees de console.
Verwacht: rode `[TESTS] … FAIL` met `_isStagingHost is not defined` (functie bestaat nog niet).

- [ ] **Stap 3: Vervang de `SID`-regel door de omgevings-schakelaar**

In `index.html` regel 1156, vervang:

```javascript
const SID  = '1fnUsbwb4nDMNttWym9FWBw1CMMMAVTuZ3v88b35isUw';
```
door:

```javascript
// ── Omgeving (productie vs. testomgeving) ──────────────────────────────
// Fail-safe: alleen deze exacte hosts zijn PRODUCTIE; al het andere
// (staging-branch, andere previews, localhost) draait op de TEST-data.
const PROD_HOSTS = [
  'collectief-dashboard.vercel.app',
  'collectief-dashboard-vve-beheer-collectief.vercel.app',
  'collectief-dashboard-vvebeheercollectief-vve-beheer-collectief.vercel.app',
  'collectief-dashboard-git-main-vve-beheer-collectief.vercel.app',
];
function _isStagingHost(hostname){ return !PROD_HOSTS.includes(hostname); }
const IS_STAGING = _isStagingHost(location.hostname);

const SID_PROD = '1fnUsbwb4nDMNttWym9FWBw1CMMMAVTuZ3v88b35isUw';
const SID_TEST = 'VUL_IN_NA_TAAK_3';   // ID van de test-Sheet (Taak 3)
const SID = IS_STAGING ? SID_TEST : SID_PROD;
```

- [ ] **Stap 4: Vervang de `ONESIGNAL_APP_ID`-regel door de schakelaar**

In `index.html` regel 1161, vervang:

```javascript
const ONESIGNAL_APP_ID     = 'c0e1301b-2cee-4646-8fab-99698e10e78c';
```
door:

```javascript
const ONESIGNAL_APP_ID_PROD = 'c0e1301b-2cee-4646-8fab-99698e10e78c';
const ONESIGNAL_APP_ID_TEST = 'VUL_IN_NA_TAAK_4';   // test-OneSignal app-id (Taak 4)
const ONESIGNAL_APP_ID      = IS_STAGING ? ONESIGNAL_APP_ID_TEST : ONESIGNAL_APP_ID_PROD;
```
> Alle bestaande code blijft `SID` en `ONESIGNAL_APP_ID` gebruiken — alleen de definitie verandert. `SID_TEST`/`ONESIGNAL_APP_ID_TEST` zijn nu nog placeholders; ze worden in Taak 3/4 ingevuld en zijn ongebruikt zolang we op een productie-host draaien.

- [ ] **Stap 5: Draai de test en bevestig dat hij slaagt**

Herlaad `http://localhost:8099/index.html?test=1`, lees de console.
Verwacht: groene `[TESTS] N OK, 0 FAIL` (N = oude telling + 6).

- [ ] **Stap 6: Voeg de TESTOMGEVING-balk toe (boot)**

In `index.html`, binnen de `DOMContentLoaded`-handler (begint regel 1232), direct ná `document.addEventListener('DOMContentLoaded',()=>{` invoegen:

```javascript
  // Zichtbare waarschuwingsbalk in de testomgeving
  if (IS_STAGING) {
    document.title = '[TEST] ' + document.title;
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#B45309;color:#fff;'
      + 'text-align:center;font:600 13px/2.4 system-ui,sans-serif;letter-spacing:.3px">'
      + '⚠ TESTOMGEVING — dit is niet het echte dashboard</div>'
      + '<div style="height:34px"></div>');
  }
```

- [ ] **Stap 7: Verifieer de balk lokaal (localhost = staging)**

Open `http://localhost:8099/index.html` (zonder `?test=1`). 
Verwacht: oranje balk "⚠ TESTOMGEVING …" bovenin; tabtitel begint met `[TEST]`. (Inloggen werkt lokaal niet — dat is prima; we testen alleen de balk.)

```bash
kill %1 2>/dev/null   # stop de lokale server
```

- [ ] **Stap 8: Commit**

```bash
git add index.html
git commit -m "feat(fase2): omgevingsherkenning + TESTOMGEVING-balk (voorkant-tweeling)"
git push
```

---

## Taak 3: Data-tweeling — test-Sheet

**Files:** geen code; Google Sheets + `index.html:SID_TEST`.

- [ ] **Stap 1: Kopieer de productie-Sheet 🧑 (samen)**

Open de productie-Sheet (`https://docs.google.com/spreadsheets/d/1fnUsbwb4nDMNttWym9FWBw1CMMMAVTuZ3v88b35isUw`) → **Bestand → Een kopie maken** → naam `Collectief Dashboard — TEST`.
Verwacht: nieuwe Sheet geopend. Het container-bound script ("Afgerond script") wordt **automatisch mee-gekopieerd** → dit is straks de test-achterkant (Taak 6/7).

- [ ] **Stap 2: Leg het test-Sheet-ID vast**

Uit de URL van de kopie: `…/spreadsheets/d/<DIT_IS_HET_ID>/edit`. Noteer het ID.

- [ ] **Stap 3: Deel de test-Sheet met de 4 gebruikers 🧑 (samen)**

Delen → bewerker-rechten voor: `info@vvebeheercollectief.nl`, `djiowchico@gmail.com`, `gabrielateterycz1616@gmail.com`, `giocan175@gmail.com`. **Niet** "iedereen met de link". (Privacy: echte data.)

- [ ] **Stap 4: Vul `SID_TEST` in**

In `index.html`, vervang `const SID_TEST = 'VUL_IN_NA_TAAK_3';` door het ID uit Stap 2:

```javascript
const SID_TEST = '<test-Sheet-ID>';
```

- [ ] **Stap 5: Commit**

```bash
git add index.html
git commit -m "feat(fase2): koppel test-Sheet aan staging (SID_TEST)"
git push
```

---

## Taak 4: Test-OneSignal-app

**Files:** geen code; OneSignal + `index.html:ONESIGNAL_APP_ID_TEST`.

- [ ] **Stap 1: Maak een gratis test-OneSignal-app 🧑 (samen)**

OneSignal dashboard → **New App/Website** → naam `Collectief Dashboard TEST` → platform **Web** → site-URL = de staging-URL (`https://collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app`; exact bevestigd in Taak 5, mag hier alvast).
Verwacht: nieuwe app met eigen **App ID** en **REST API Key**.

- [ ] **Stap 2: Leg App ID + REST API Key vast**

Settings → Keys & IDs. Noteer **App ID** (voor de frontend + test-script-property) en **REST API Key** (alleen voor de test-script-property in Taak 7 — nooit in `index.html`).

- [ ] **Stap 3: Vul `ONESIGNAL_APP_ID_TEST` in**

In `index.html`, vervang `const ONESIGNAL_APP_ID_TEST = 'VUL_IN_NA_TAAK_4';` door het test-App-ID:

```javascript
const ONESIGNAL_APP_ID_TEST = '<test-OneSignal-App-ID>';
```

- [ ] **Stap 4: Commit**

```bash
git add index.html
git commit -m "feat(fase2): koppel test-OneSignal-app aan staging"
git push
```

---

## Taak 5: Inloggen op de test-link (OAuth-origin)

**Files:** geen code; Google Cloud Console.

- [ ] **Stap 1: Bevestig de exacte staging-URL**

Lees in het Vercel-dashboard (of via de Vercel-MCP `list_deployments` voor project `collectief-dashboard`) de laatste **preview**-deploy van branch `staging` en kopieer de vaste "Domains"-alias.
Verwacht: `collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app`. Wijkt de werkelijke alias af? Gebruik dán die echte URL in stap 2 hieronder én in de OneSignal-site-URL (Taak 4). (Niet in `PROD_HOSTS` zetten — staging hóórt daar niet in; de fail-safe zorgt dat staging automatisch test-data krijgt.)

- [ ] **Stap 2: Registreer de staging-origin 🧑 (samen)**

Google Cloud Console → **APIs & Services → Credentials** → OAuth 2.0-client `560046984985-1371r4bbt28umi6uslims6mlkucn1278.apps.googleusercontent.com` → **Authorized JavaScript origins** → **+ Add URI**:

```
https://collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app
```
Opslaan. (Geen wildcards mogelijk — daarom een vaste URL. Wijzigingen kunnen tot enkele minuten duren.)

- [ ] **Stap 3: Verifieer inloggen op de test-link**

Open `https://collectief-dashboard-git-staging-vve-beheer-collectief.vercel.app` → klik **Inloggen met Google** → log in als een van de 4 gebruikers.
Verwacht: oranje TESTOMGEVING-balk; succesvolle login; dashboard toont de **test-Sheet**-data. Controleer in een 2e tab dat productie (`collectief-dashboard.vercel.app`) géén balk toont en de echte data laadt.

> Geen commit (alleen Console-instelling). Noteer in de PR/commit-message dat de origin is toegevoegd.

---

## Taak 6: Achterkant — één bron via clasp

**Files:**
- Modify: `apps-script/Notifications.gs` (regel 21 + usages).
- Create: `apps-script/appsscript.json`, `.gitignore`.

- [ ] **Stap 1: Refactor — `ONESIGNAL_APP_ID` naar Script Property**

In `apps-script/Notifications.gs` regel 21, vervang:

```javascript
const ONESIGNAL_APP_ID = 'c0e1301b-2cee-4646-8fab-99698e10e78c';
```
door:

```javascript
// App-id komt uit Script Properties (prod-project: prod-app, test-project: test-app).
// Fallback = prod-app-id, zodat productie blijft werken zonder extra property.
function cd_oneSignalAppId(){
  return PropertiesService.getScriptProperties().getProperty('ONESIGNAL_APP_ID')
      || 'c0e1301b-2cee-4646-8fab-99698e10e78c';
}
```

- [ ] **Stap 2: Vervang alle usages van `ONESIGNAL_APP_ID`**

```bash
grep -n "ONESIGNAL_APP_ID" apps-script/Notifications.gs
```
Vervang elke verwijzing (o.a. `app_id: ONESIGNAL_APP_ID` op ~regel 352) door de functie-aanroep `cd_oneSignalAppId()`. De definitie uit Stap 1 telt niet als usage.
Verwacht ná vervangen: `grep -n "ONESIGNAL_APP_ID\b" apps-script/Notifications.gs` toont alleen nog `getProperty('ONESIGNAL_APP_ID')` en de fallback-comment.

- [ ] **Stap 3: Kloon het PRODUCTIE-script om de canonieke bestanden + manifest te krijgen 🧑 (clasp login, samen)**

Open eerst de **productie**-Sheet → Extensies → Apps Script → ⚙ Project Settings → kopieer het **Script ID** → noteer als `<PROD_SCRIPT_ID>`. Dan:

```bash
clasp login            # 🧑 opent browser → kies het beheer-Google-account, sta toe
mkdir -p /tmp/cd-prod && cd /tmp/cd-prod
clasp clone <PROD_SCRIPT_ID>
ls -1                  # verwacht: appsscript.json + .gs-bestanden met canonieke namen
```

- [ ] **Stap 4: Neem het manifest over en stem bestandsnamen af**

```bash
cp /tmp/cd-prod/appsscript.json ~/collectief-dashboard/apps-script/appsscript.json
cd ~/collectief-dashboard
```
Vergelijk de canonieke `.gs`-namen uit de clone met `apps-script/`. Hernoem lokale afwijkingen zodat ze exact matchen (waarschijnlijk `AutoPrioriteit.gs.gs` → de canonieke naam uit de clone, bv. `AutoPrioriteit.gs`):

```bash
git mv "apps-script/AutoPrioriteit.gs.gs" "apps-script/AutoPrioriteit.gs"   # alleen als de clone die naam gebruikt
```
> Onze lokale `Notifications.gs` is bewust vóór op de live-versie (Fase 1: dode secret eruit). Dat is gewenst — de eerste `clasp push` schoont de live dode secret meteen op. Verifieer dat het verschil **alleen** de dode secret + de OneSignal-refactor betreft:
```bash
diff <(sed -n '1,700p' /tmp/cd-prod/Notifications.gs) <(sed -n '1,700p' apps-script/Notifications.gs) | head -40
```
Verwacht: verschillen beperkt tot het secret-placeholder-blok en de `cd_oneSignalAppId()`-refactor.

- [ ] **Stap 5: Maak `.gitignore` en `.clasp.json` (lokaal, prod-doel)**

```bash
printf '.clasp.json\n.clasprc.json\nnode_modules/\n' >> .gitignore
echo '{"scriptId":"<PROD_SCRIPT_ID>","rootDir":"apps-script"}' > .clasp.json
```

- [ ] **Stap 6: Controleer dat een prod-push een no-op qua gedrag is**

```bash
clasp status     # toont welke bestanden gepusht zouden worden
```
Verwacht: alleen `apps-script/*`-bestanden in scope (rootDir klopt), geen vreemde bestanden. **Nog niet pushen naar prod** — dat gebeurt pas bij go-live (Taak 10) via CI.

- [ ] **Stap 7: Commit (manifest + refactor + gitignore)**

```bash
git add apps-script/appsscript.json apps-script/Notifications.gs .gitignore
git add -A apps-script/   # vangt een eventuele hernoeming
git commit -m "chore(fase2): clasp-manifest + ONESIGNAL_APP_ID via Script Property"
git push
```

---

## Taak 7: Test-achterkant inrichten

**Files:** geen code; test-Apps-Script-project (de mee-gekopieerde bound script) + clasp.

- [ ] **Stap 1: Leg het TEST-Script-ID vast**

Open de **test**-Sheet (Taak 3) → Extensies → Apps Script → ⚙ Project Settings → kopieer het **Script ID**. Noteer `<TEST_SCRIPT_ID>`.

- [ ] **Stap 2: Push de actuele bron naar het test-project**

```bash
cd ~/collectief-dashboard
echo '{"scriptId":"<TEST_SCRIPT_ID>","rootDir":"apps-script"}' > .clasp.json
clasp push --force
```
Verwacht: alle `.gs`-bestanden + `appsscript.json` gepusht (incl. de `cd_oneSignalAppId()`-refactor en de secret-scrub). De test-achterkant draait nu exact dezelfde code als de bron.

- [ ] **Stap 3: Zet de test-Script-Properties 🧑 (samen)**

In het **test**-script: ⚙ Project Settings → Script Properties → toevoegen:
- `ONESIGNAL_APP_ID` = test-App-ID (Taak 4)
- `ONESIGNAL_REST_API_KEY` = test-REST-key (Taak 4)
- `CD_WEBHOOK_SECRET` = een **nieuw** willekeurig test-geheim (los van prod; bv. `openssl rand -hex 24`)

Verwacht: 3 properties op het test-project. (Prod blijft ongemoeid; daar zorgt de fallback voor de juiste app-id.)

- [ ] **Stap 4: Installeer de triggers op het test-project 🧑 (samen)**

In het **test**-script-editor: kies functie **`setupNotificationTriggers`** → Run (sta toestemmingen toe) → daarna **`ap_installeerTrigger`** → Run.
Verwacht: meldingen "✓ Notificatie-triggers ingesteld" en "✓ Dagelijkse auto-prioriteit (06:00)". Triggers-overzicht toont 6 triggers (onEdit, uurlijks, 08:30, onChange, 5-min, 06:00) — allemaal op de **test**-Sheet.

- [ ] **Stap 5: Verifieer de automatisering op de test-Sheet**

Maak in de test-Sheet een testtaak met een deadline dichtbij → controleer dat auto-prioriteit een waarde zet en (na een testpush-abonnement) een melding via de **test**-OneSignal-app komt. Controleer dat de **productie**-Sheet en -meldingen onaangeroerd blijven.
Verwacht: automatisering werkt geïsoleerd op test.

> Geen git-commit (alleen serverinstellingen). Door naar de auto-deploy.

---

## Taak 8: clasp-credentials veilig in GitHub

**Files:** geen code; GitHub-secrets via `gh`.

- [ ] **Stap 1: Vind het clasp-credentialbestand**

```bash
ls -l ~/.clasprc.json    # ontstaan bij 'clasp login' (Taak 6, stap 3)
```
Verwacht: bestand bestaat (bevat access- + refresh-token). **Gevoelig** — niet in git, alleen als secret.

- [ ] **Stap 2: Zet de secrets 🧑 (gebruiker akkoord op least-privilege account)**

```bash
gh secret set CLASPRC_JSON       --repo vvebeheercollectief/Collectief-Dashboard < ~/.clasprc.json
gh secret set PROD_SCRIPT_ID     --repo vvebeheercollectief/Collectief-Dashboard --body "<PROD_SCRIPT_ID>"
gh secret set TEST_SCRIPT_ID     --repo vvebeheercollectief/Collectief-Dashboard --body "<TEST_SCRIPT_ID>"
```
Verwacht: `✓ Set secret …` (3×).

- [ ] **Stap 3: Leg de Web-App-deploymentId's vast (voor de webhook-herimplementatie)**

```bash
echo '{"scriptId":"<PROD_SCRIPT_ID>","rootDir":"apps-script"}' > .clasp.json
clasp deployments      # noteer de deploymentId van de gepubliceerde Web App (niet @HEAD)
echo '{"scriptId":"<TEST_SCRIPT_ID>","rootDir":"apps-script"}' > .clasp.json
clasp deployments      # idem voor test; bestaat er geen? → 'clasp deploy' maakt er één en print de id
```

```bash
gh secret set PROD_DEPLOYMENT_ID --repo vvebeheercollectief/Collectief-Dashboard --body "<PROD_DEPLOYMENT_ID>"
gh secret set TEST_DEPLOYMENT_ID --repo vvebeheercollectief/Collectief-Dashboard --body "<TEST_DEPLOYMENT_ID>"
```
Verwacht: 5 secrets totaal in de repo (`gh secret list`).

---

## Taak 9: GitHub Action — automatisch uitrollen

**Files:**
- Create: `.github/workflows/apps-script-deploy.yml`.

- [ ] **Stap 1: Geef de gh-token de `workflow`-scope 🧑 (samen)**

```bash
gh auth refresh -h github.com -s workflow
```
🧑 Volg de device-code in de browser. Verwacht: scopes bevatten nu `workflow` (`gh auth status`). (Nodig om workflow-bestanden te mogen pushen.)

- [ ] **Stap 2: Schrijf de workflow**

Maak `.github/workflows/apps-script-deploy.yml`:

```yaml
name: Apps Script uitrollen
on:
  push:
    branches: [main, staging]
    paths:
      - 'apps-script/**'
      - '.github/workflows/apps-script-deploy.yml'
  workflow_dispatch: {}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Installeer clasp
        run: npm install -g @google/clasp@2.4.2
      - name: Schrijf clasp-credentials
        run: printf '%s' "$CLASPRC_JSON" > "$HOME/.clasprc.json"
        env:
          CLASPRC_JSON: ${{ secrets.CLASPRC_JSON }}
      - name: Kies doel-omgeving
        id: target
        run: |
          if [ "${{ github.ref_name }}" = "main" ]; then
            echo "scriptId=${{ secrets.PROD_SCRIPT_ID }}" >> "$GITHUB_OUTPUT"
            echo "deploymentId=${{ secrets.PROD_DEPLOYMENT_ID }}" >> "$GITHUB_OUTPUT"
            echo "omgeving=PRODUCTIE" >> "$GITHUB_OUTPUT"
          else
            echo "scriptId=${{ secrets.TEST_SCRIPT_ID }}" >> "$GITHUB_OUTPUT"
            echo "deploymentId=${{ secrets.TEST_DEPLOYMENT_ID }}" >> "$GITHUB_OUTPUT"
            echo "omgeving=TEST" >> "$GITHUB_OUTPUT"
          fi
      - name: Genereer .clasp.json
        run: echo '{"scriptId":"${{ steps.target.outputs.scriptId }}","rootDir":"apps-script"}' > .clasp.json
      - name: Push code (${{ steps.target.outputs.omgeving }})
        run: clasp push --force
      - name: Herimplementeer Web App (webhook)
        run: clasp deploy --deploymentId "${{ steps.target.outputs.deploymentId }}" --description "CI ${{ github.sha }}"
```

- [ ] **Stap 3: Push de workflow naar `staging`**

```bash
git checkout staging
git add .github/workflows/apps-script-deploy.yml
git commit -m "ci(fase2): automatisch uitrollen Apps Script (staging→test, main→prod)"
git push
```

- [ ] **Stap 4: Verifieer de auto-deploy met een triviale wijziging**

Voeg een onschuldige commentaarregel toe aan `apps-script/Code.gs`, commit & push naar `staging`:

```bash
printf '\n// ci-test %s\n' "$(date +%s)" >> apps-script/Code.gs   # (datum mag ook handmatig)
git add apps-script/Code.gs
git commit -m "test(ci): triviale wijziging om auto-deploy te verifiëren"
git push
gh run watch --repo vvebeheercollectief/Collectief-Dashboard
```
Verwacht: workflow-run **slaagt**, job "Push code (TEST)". Open het **test**-script en bevestig dat de commentaarregel erin staat → de bron rolt automatisch uit naar test. Verwijder daarna de testregel weer (commit + push) en bevestig dat ook die wijziging doorkomt.

---

## Taak 10: End-to-end verificatie + go-live (merge naar `main`)

**Files:** geen nieuwe code; samenvoegen.

- [ ] **Stap 1: Loop de klaar-criteria langs (op `staging`)**

Bevestig stuk voor stuk:
1. Test-link toont TESTOMGEVING-balk; productie niet. ✅
2. Inloggen werkt op de test-link. ✅
3. Test-link leest/schrijft de **test**-Sheet; productie-Sheet aantoonbaar onaangeroerd. ✅
4. Test-Apps-Script draait dezelfde automatisering op de test-Sheet (6 triggers). ✅
5. Eén bronwijziging in `apps-script/` rolt automatisch uit naar test (Taak 9 geverifieerd). ✅
6. Push op de test-link gaat naar de **test**-OneSignal-app. ✅
7. Gedocumenteerde flow branch → test → prod (dit plan + spec). ✅

- [ ] **Stap 2: Merge `staging` → `main` (go-live)**

```bash
git checkout main
git pull --ff-only
git merge --no-ff staging -m "feat(fase2): testomgeving + automatisch uitrollen live (klus 3+4)"
git push
```
Verwacht: 
- Vercel deployt productie (`collectief-dashboard.vercel.app`) — onveranderd gedrag (prod-host ⇒ prod-`SID`/OneSignal, geen balk).
- De GitHub Action draait op `main` → job "Push code (PRODUCTIE)" → pusht de bron (incl. secret-scrub + OneSignal-refactor) naar het **prod**-scriptId en herimplementeert de Web App.

- [ ] **Stap 3: Verifieer productie ná merge**

- Open `collectief-dashboard.vercel.app`: **geen** balk, echte data, login werkt.
- `gh run watch`: de `main`-run slaagt.
- Open het **prod**-script: dode secret is weg, `cd_oneSignalAppId()` aanwezig; meldingen werken nog (echte OneSignal-app).
Verwacht: productie volledig intact; testomgeving operationeel; auto-deploy actief op beide branches.

- [ ] **Stap 4: Werkbranch behouden**

`staging` blíjft bestaan als permanente testomgeving (niet verwijderen). Toekomstige wijzigingen: eerst op `staging` (→ test-link + test-script), dan merge naar `main` (→ live).

---

## Self-Review (dekking t.o.v. spec)

| Spec-onderdeel | Taak |
|---|---|
| 4.1 Voorkant-tweeling + TESTOMGEVING-balk | Taak 2 |
| 4.2 Data-tweeling (test-Sheet, kopie echte data, 4 gebruikers) | Taak 3 |
| 4.3 Achterkant-tweeling (test-script, properties, triggers) | Taak 6 (bron) + Taak 7 (inrichten) |
| 4.4 Automatisch uitrollen (clasp + Action, branch→omgeving, Web App-deploy) | Taak 6, 8, 9 |
| 4.5 Aparte test-OneSignal-app | Taak 4 (frontend) + Taak 7 (server-key) |
| 4.6 OAuth-origin voor de test-link | Taak 5 |
| §5 Deploy-flow (staging→test→merge→prod) | Taak 9 + Taak 10 |
| §6 Eenmalig handwerk (Sheet, origin, clasp-token, OneSignal) | Taak 3,5,8,4 (🧑-stappen) |
| §7 Klaar-criteria | Taak 10, stap 1 |
| §10 Risico's (least-privilege CI-token, privacy test-data, Web App-deploy) | Taak 8 (secrets), 3 (delen), 9 (deploy-stap) |

**Aannames die het plan maakt (bevestigen tijdens uitvoering):**
- Vercel branch-alias is stabiel en heet zoals voorspeld (geverifieerd in Taak 5, stap 1).
- De Sheet-kopie neemt het bound script mee als afzonderlijk test-script (Taak 3 → 7).
- Er bestaat een gepubliceerde Web-App-deployment om te herimplementeren; zo niet, maakt Taak 8 stap 3 er één.
- Het beheer-Google-account heeft rechten op zowel het prod- als test-script (zelfde eigenaar).
