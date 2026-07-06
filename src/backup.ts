import * as fs from 'fs';
import * as path from 'path';
import { backupsRootDir } from './paths';
import { ClaudeProfile } from './profileStore';

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function backupProfile(profile: ClaudeProfile): string {
  const destDir = path.join(backupsRootDir(), profile.id, timestampSlug());
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(profile.configDir, destDir, { recursive: true });
  return destDir;
}

export function listBackups(profileId: string): string[] {
  const dir = path.join(backupsRootDir(), profileId);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(dir, entry.name))
    .sort()
    .reverse();
}

export function restoreProfile(profile: ClaudeProfile, backupDir: string): void {
  fs.rmSync(profile.configDir, { recursive: true, force: true });
  fs.mkdirSync(profile.configDir, { recursive: true });
  fs.cpSync(backupDir, profile.configDir, { recursive: true });
}

export function exportProfile(profile: ClaudeProfile, destParentDir: string): string {
  const destDir = path.join(destParentDir, `claude-profile-${profile.id}-${timestampSlug()}`);
  fs.cpSync(profile.configDir, destDir, { recursive: true });
  return destDir;
}

export function importProfileFrom(sourceDir: string, newConfigDir: string): void {
  fs.mkdirSync(newConfigDir, { recursive: true });
  fs.cpSync(sourceDir, newConfigDir, { recursive: true });
}
