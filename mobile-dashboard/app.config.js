const fs = require('fs');
const path = require('path');

/** Read mobile-dashboard/.env without extra deps (Expo loads this in Node when you run `expo start`). */
function parseDotEnv(filePath) {
  const out = {};
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    for (const line of txt.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch {
    /* missing .env */
  }
  return out;
}

const appJson = require('./app.json');
const envPath = path.join(__dirname, '.env');
const fileEnv = parseDotEnv(envPath);
const apiUrl =
  fileEnv.EXPO_PUBLIC_API_BASE_URL ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  '';

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra || {}),
      EXPO_PUBLIC_API_BASE_URL: apiUrl,
    },
  },
};
