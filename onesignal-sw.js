// Collectief Dashboard — service worker van OneSignal (push-meldingen)
//
// BEWUST een eigen bestand op een EIGEN bereik ('/onesignal/'), los van de app-sw.js.
// Waarom niet gewoon importScripts in sw.js (de 'gecombineerde' aanpak uit de OneSignal-docs):
// de SDK registreert zijn worker met een query erachter —
//     sw.js?appId=<id>&sdkVersion=<versie>
// terwijl src/sw-update.js hetzelfde bestand ZONDER query registreert. Voor de browser zijn
// dat twee verschillende workers die om hetzelfde bereik vechten: er kan er maar één per
// bereik zijn, dus verving de een steeds de ander. De verdrongen versie belandde in
// 'waiting', wat precies de trigger is van de balk "Er is een nieuwe versie van het
// dashboard" — die daardoor na élke herlading terugkwam (gemeten 2026-08-06).
// Twee bestanden op twee bereiken kunnen elkaar niet verdringen.
//
// Een push heeft geen client nodig: het push-event vuurt op de registratie die het abonnement
// draagt, ook als die geen enkele pagina bedient. Dit bereik hoeft dus niet te bestaan als map.
//
// LET OP de bestandsnaam van de import: in v16 heet de worker OneSignalSDK.sw.js.
// Het veelgeciteerde OneSignalSDKWorker.js geeft een 404 en zou de push stil kapot laten.
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
