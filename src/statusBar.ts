import * as vscode from 'vscode';
import { ClaudeProfile } from './profileStore';
import { detectAuthInfo } from './authInfo';

export class ProfileStatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'claudeProfiles.switchProfile';
    this.item.show();
  }

  update(profile: ClaudeProfile | undefined): void {
    if (!profile) {
      this.item.text = '$(account) Claude: No Profile';
      this.item.tooltip = 'No Claude profile configured yet. Click to create one.';
      this.item.color = undefined;
      return;
    }
    this.item.text = `$(account) ${profile.name}`;
    this.item.color = profile.color ? new vscode.ThemeColor(profile.color) : undefined;

    const authInfo = detectAuthInfo(profile.configDir);
    const lines = [`Config dir: ${profile.configDir}`];
    if (authInfo?.email) {
      lines.push(`Email (detected, unofficial): ${authInfo.email}`);
    }
    if (authInfo?.plan) {
      lines.push(`Plan (detected, unofficial): ${authInfo.plan}`);
    }
    lines.push('Click to switch profile');
    this.item.tooltip = lines.join('\n');
  }

  dispose(): void {
    this.item.dispose();
  }
}
