import { userKey } from '../api/userKey';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Bring your own key, on the start screen. The free AI (the server's key, with a daily limit) is the default; a player
 * may paste their own Sarvam key instead, kept only in this browser (api/userKey) and sent with each AI request.
 */
export class KeyPanel {
  readonly root = el('div', 'key-panel');
  private readonly toggle = el('button', 'link-button');
  private readonly form = el('form', 'key-form hidden');
  private readonly input = el('input', 'key-input');
  private readonly note = el('p', 'key-note');

  constructor() {
    this.toggle.type = 'button';
    this.toggle.onclick = () => {
      if (userKey.get()) userKey.clear();
      else if (this.form.classList.contains('hidden')) { this.form.classList.remove('hidden'); this.input.focus(); }
      else this.form.classList.add('hidden');
      this.render();
    };
    this.input.type = 'password';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.placeholder = 'Paste your Sarvam API key';
    this.input.setAttribute('aria-label', 'Your Sarvam API key');
    const save = el('button', 'secondary', 'Save key');
    save.type = 'submit';
    this.form.append(this.input, save);
    this.form.onsubmit = (e) => {
      e.preventDefault();
      if (!userKey.set(this.input.value)) {
        this.note.textContent = "That doesn't look like an API key. Check it and paste it again.";
        return;
      }
      this.input.value = '';
      this.form.classList.add('hidden');
      this.render();
    };
    this.root.append(this.toggle, this.form, this.note);
    this.render();
  }

  private render(): void {
    const key = userKey.get();
    this.toggle.textContent = key ? 'Remove my key' : this.form.classList.contains('hidden') ? 'Use my own AI key' : 'Cancel';
    this.note.textContent = key
      ? `Using your own key (ending ${key.slice(-4)}), kept only in this browser. No daily limit.`
      : this.form.classList.contains('hidden') ? '' : 'Kept only in this browser. Without a key, the free AI is used, with a daily limit.';
  }
}
