import * as fs from 'fs';
import * as path from 'path';
import { profilesFilePath, profilesRootDir, defaultConfigDirFor, slugify } from './paths';

export interface ClaudeProfile {
  id: string;
  name: string;
  configDir: string;
  color?: string;
  env?: Record<string, string>;
  workspaceMatchers?: string[];
}

export interface ProfilesFile {
  activeProfileId: string;
  profiles: ClaudeProfile[];
}

function emptyProfilesFile(): ProfilesFile {
  return { activeProfileId: '', profiles: [] };
}

export function profilesFileExists(): boolean {
  return fs.existsSync(profilesFilePath());
}

export function loadProfiles(): ProfilesFile {
  if (!profilesFileExists()) {
    return emptyProfilesFile();
  }
  try {
    const raw = fs.readFileSync(profilesFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as ProfilesFile;
    if (!Array.isArray(parsed.profiles)) {
      return emptyProfilesFile();
    }
    return parsed;
  } catch {
    return emptyProfilesFile();
  }
}

export function saveProfiles(data: ProfilesFile): void {
  fs.mkdirSync(profilesRootDir(), { recursive: true });
  fs.writeFileSync(profilesFilePath(), JSON.stringify(data, null, 2), 'utf8');
}

export function getActiveProfile(data: ProfilesFile): ClaudeProfile | undefined {
  return data.profiles.find(p => p.id === data.activeProfileId);
}

export function uniqueIdFor(data: ProfilesFile, name: string): string {
  const base = slugify(name);
  let id = base;
  let n = 2;
  while (data.profiles.some(p => p.id === id)) {
    id = `${base}-${n}`;
    n++;
  }
  return id;
}

export function addProfile(
  data: ProfilesFile,
  opts: { name: string; configDir?: string; makeActive?: boolean }
): ClaudeProfile {
  const id = uniqueIdFor(data, opts.name);
  const configDir = opts.configDir ?? defaultConfigDirFor(id);
  const profile: ClaudeProfile = { id, name: opts.name, configDir };
  data.profiles.push(profile);
  if (opts.makeActive || !data.activeProfileId) {
    data.activeProfileId = id;
  }
  saveProfiles(data);
  return profile;
}

export function renameProfile(data: ProfilesFile, id: string, newName: string): void {
  const profile = data.profiles.find(p => p.id === id);
  if (!profile) {
    throw new Error(`Profile "${id}" not found`);
  }
  profile.name = newName;
  saveProfiles(data);
}

export function removeProfile(data: ProfilesFile, id: string): void {
  if (data.profiles.length <= 1) {
    throw new Error('Cannot delete the last remaining profile.');
  }
  if (data.activeProfileId === id) {
    throw new Error('Cannot delete the active profile. Switch to another profile first.');
  }
  data.profiles = data.profiles.filter(p => p.id !== id);
  saveProfiles(data);
}

export function ensureConfigDirExists(profile: ClaudeProfile): void {
  fs.mkdirSync(profile.configDir, { recursive: true });
}

export function isValidNewProfileName(data: ProfilesFile, name: string): string | undefined {
  if (!name || !name.trim()) {
    return 'Profile name cannot be empty.';
  }
  if (data.profiles.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) {
    return `A profile named "${name.trim()}" already exists.`;
  }
  return undefined;
}
