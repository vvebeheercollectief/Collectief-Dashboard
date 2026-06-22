// Gedeelde allowlist — één bron van waarheid voor zowel de frontend
// (src/config.js) als de Vercel-proxy (api/chat.js). Voorheen stond deze lijst
// op twee plekken; bij personeelswissel was er één makkelijk te vergeten.
export const ALLOWED_EMAILS = [
  'info@vvebeheercollectief.nl',
  'djiowchico@gmail.com',
  'gabrielateterycz1616@gmail.com',
  'giocan175@gmail.com',
].map(e => e.trim().toLowerCase()); // defensief normaliseren: één bron leest zo overal hetzelfde
