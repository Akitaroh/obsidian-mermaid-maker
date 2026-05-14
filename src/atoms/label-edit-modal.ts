/**
 * Atom-LabelEditModal
 *
 * ノードラベル編集用の Obsidian Modal。
 * Electron 版 Obsidian は `window.prompt` を禁止しているため代替を用意する。
 */

import { App, Modal } from 'obsidian';

export function openLabelEdit(
  app: App,
  initial: string,
  onSubmit: (next: string) => void,
): void {
  const modal = new LabelEditModal(app, initial, onSubmit);
  modal.open();
}

class LabelEditModal extends Modal {
  private initial: string;
  private onSubmit: (next: string) => void;

  constructor(app: App, initial: string, onSubmit: (next: string) => void) {
    super(app);
    this.initial = initial;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h3', { text: 'ノードラベル編集' });

    const input = contentEl.createEl('input', {
      type: 'text',
      value: this.initial,
    });
    input.style.cssText = 'width:100%;padding:6px 8px;font-size:14px;';

    const row = contentEl.createDiv();
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:12px;';
    const cancel = row.createEl('button', { text: 'キャンセル' });
    const ok = row.createEl('button', { text: 'OK', cls: 'mod-cta' });

    const submit = () => {
      this.onSubmit(input.value);
      this.close();
    };

    cancel.addEventListener('click', () => this.close());
    ok.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  onClose() {
    this.contentEl.empty();
  }
}
