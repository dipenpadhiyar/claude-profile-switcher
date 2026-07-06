import * as vscode from 'vscode';
import { ClaudeProfile } from './profileStore';
import { detectAuthInfo } from './authInfo';

export class ProfileStatusBar {
  private readonly item: vscode.StatusBarItem;
  private lastProfile: ClaudeProfile | undefined;
  private reloadPending = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'claudeProfiles.switchProfile';
    this.item.show();
  }

  update(profile: ClaudeProfile | undefined): void {
    this.lastProfile = profile;
    if (!profile) {
      this.item.text = '$(account) Claude: No Profile';
      this.item.tooltip = 'No Claude profile configured yet. Click to create one.';
      this.item.color = undefined;
      return;
    }
    this.item.text = `${this.reloadPending ? '$(warning) ' : '$(account) '}${profile.name}`;
    this.item.color = this.reloadPending
      ? new vscode.ThemeColor('statusBarItem.warningForeground')
      : profile.color
        ? new vscode.ThemeColor(profile.color)
        : undefined;

    const authInfo = detectAuthInfo(profile.configDir);
    const lines = [`Config dir: ${profile.configDir}`];
    if (authInfo?.email) {
      lines.push(`Email (detected, unofficial): ${authInfo.email}`);
    }
    if (authInfo?.plan) {
      lines.push(`Plan (detected, unofficial): ${authInfo.plan}`);
    }
    if (this.reloadPending) {
      lines.push(
        '⚠ Reload Window recommended: the Claude sidebar may still show the ' +
          'previous account\'s name/email even though usage/chat now use this profile.'
      );
    }
    lines.push('Click to switch profile');
    this.item.tooltip = lines.join('\n');
  }

  /** Marks whether a full "Reload Window" is still needed for the Claude sidebar to fully catch up. */
  setReloadPending(pending: boolean): void {
    this.reloadPending = pending;
    this.update(this.lastProfile);
  }

  dispose(): void {
    this.item.dispose();
  }
}
