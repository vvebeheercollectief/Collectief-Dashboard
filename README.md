# Collectief-Dashboard
Collectief Dashboard 4.0

## Minimumversie (`versie.json`)

`versie.json` in de root bevat `{"minimaal":"X.Y"}`. Een open tabblad met een `APP_VERSION`
(src/config.js) lager dan `minimaal` mag niet meer opslaan: lezen werkt gewoon, schrijven wordt
geweigerd met een vaste balk "Herlaad om weer te kunnen opslaan" (src/versie.js). Het bestand komt
nooit uit een cache (sw-strategie.js: 'live'); lukt het ophalen niet, dan wordt er niets geblokkeerd.

**Wanneer ophogen:** alleen bij een release die het SCHRIJFGEDRAG of de KOLOMINDELING van de Sheet
verandert (nieuwe/verschoven kolommen, andere waarden in een cel, een andere manier van invoegen of
archiveren). Zet `minimaal` dan op de versie van díe release, en pas nadat die release live staat.
Bij een gewone release (opmaak, teksten, leeswerk) blijft hij staan.

**Nooit hoger dan de huidige `APP_VERSION`** — dan blokkeert elke client zichzelf. De zelftest
(src/tests.js) controleert dat. Let op: de rem werkt alleen in tabbladen die hem zelf kennen
(v13.4 en later); tabbladen met een oudere versie lezen `versie.json` niet.
