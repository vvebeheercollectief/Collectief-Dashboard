// Gedeelde allowlist — één bron van waarheid voor zowel de frontend (src/config.js) als de
// Vercel-proxy (api/chat.js). Voorheen stond deze lijst op twee plekken; bij personeelswissel
// was er één makkelijk te vergeten.
//
// Sinds v15.4 staan hier SHA-256-hashes en geen adressen meer (U9 in AUDIT.md): deze repository
// is openbaar en drie van de vier adressen waren privé-gmails van collega's. Een hash is niet
// terug te rekenen naar het adres, en de controle blijft even streng: het ingelogde adres wordt
// genormaliseerd (kleine letters, zonder witruimte) en gehasht, en moet hier letterlijk in staan.
//
// Een collega toevoegen: in een terminal
//   node -e "console.log(require('crypto').createHash('sha256').update('adres@voorbeeld.nl').digest('hex'))"
// en de uitkomst hier én in EMAIL_NAMES (src/config.js) zetten.
export const ALLOWED_EMAIL_HASHES = [
  '33f0fe21146283058710f1a0fde19dc5f940453cd0e7e76fb5dfb00a9a8dc644', // info@ (kantoor)
  'cb884483e517829a56da8206f35f2c80f82629338a279573e4dac6a5909814a3',
  '2091b21099f4297a28f9a49f5507aebb6bfb25ed57cfd49ac46f055ebb2d6498',
  'ca55c1b1d601ac26a500d0827d5f7986f1f285f5ed2a037fad32dd67ce39029e',
];
