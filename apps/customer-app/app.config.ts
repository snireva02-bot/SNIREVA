import { existsSync } from 'node:fs';
import type { ConfigContext, ExpoConfig } from 'expo/config';

// google-services.json is a secret-ish file kept out of git. Only reference it when present
// (locally, or provided to EAS as a file env var: GOOGLE_SERVICES_JSON).
export default ({ config }: ConfigContext): ExpoConfig => {
  const gs = process.env.GOOGLE_SERVICES_JSON ?? (existsSync('./google-services.json') ? './google-services.json' : undefined);
  return {
    ...(config as ExpoConfig),
    android: { ...config.android, googleServicesFile: gs },
  };
};
