import * as fs from 'fs';
import * as path from 'path';

/**
 * Best-effort, unofficial detection of the signed-in account for a profile's config dir.
 * Claude Code's local credential/account file format is not publicly documented and may
 * change or (on some platforms) live outside the filesystem entirely (e.g. an OS keychain).
 * This never throws and never claims certainty - callers should label results as "detected"
 * rather than authoritative.
 */
export interface DetectedAuthInfo {
  email?: string;
  plan?: string;
  source: string;
}

const CANDIDATE_FILES = ['auth.json', '.credentials.json', 'credentials.json', 'settings.json'];
const EMAIL_KEY_HINTS = ['email', 'useremail', 'accountemail'];
const PLAN_KEY_HINTS = ['plan', 'subscriptiontype', 'subscription', 'tier'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function searchObject(obj: unknown, keyHints: string[], depth = 0): string | undefined {
  if (depth > 4 || obj === null || typeof obj !== 'object') {
    return undefined;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (typeof value === 'string') {
      if (keyHints.some(hint => lowerKey.includes(hint))) {
        return value;
      }
      if (keyHints === EMAIL_KEY_HINTS && EMAIL_REGEX.test(value)) {
        return value;
      }
    } else if (typeof value === 'object') {
      const found = searchObject(value, keyHints, depth + 1);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

export function detectAuthInfo(configDir: string): DetectedAuthInfo | undefined {
  for (const fileName of CANDIDATE_FILES) {
    const filePath = path.join(configDir, fileName);
    try {
      if (!fs.existsSync(filePath)) {
        continue;
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const email = searchObject(parsed, EMAIL_KEY_HINTS);
      const plan = searchObject(parsed, PLAN_KEY_HINTS);
      if (email || plan) {
        return { email, plan, source: fileName };
      }
    } catch {
      // Ignore unreadable/unparseable candidate files - detection is best-effort only.
    }
  }
  return undefined;
}
