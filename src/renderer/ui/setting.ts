import { createDiv, createEl } from '../core/dom';

export interface TextComponent {
  inputEl: HTMLInputElement;
  setValue(value: string): TextComponent;
  onChange(fn: (value: string) => void): TextComponent;
}

export interface TextAreaComponent {
  inputEl: HTMLTextAreaElement;
  setValue(value: string): TextAreaComponent;
  onChange(fn: (value: string) => void): TextAreaComponent;
}

export interface ToggleComponent {
  toggleEl: HTMLInputElement;
  setValue(value: boolean): ToggleComponent;
  onChange(fn: (value: boolean) => void): ToggleComponent;
}

export interface DropdownComponent {
  selectEl: HTMLSelectElement;
  addOption(value: string, label: string): DropdownComponent;
  setValue(value: string): DropdownComponent;
  onChange(fn: (value: string) => void): DropdownComponent;
}

export interface ButtonComponent {
  buttonEl: HTMLButtonElement;
  setButtonText(value: string): ButtonComponent;
  setCta(): ButtonComponent;
  setWarning(): ButtonComponent;
  onClick(fn: () => void): ButtonComponent;
}

/** Chainable setting row (name / description / control), like Obsidian's Setting. */
export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = createDiv({ cls: 'setting-item', parent: containerEl });
    this.infoEl = createDiv({ cls: 'setting-item-info', parent: this.settingEl });
    this.nameEl = createDiv({ cls: 'setting-item-name', parent: this.infoEl });
    this.descEl = createDiv({ cls: 'setting-item-description', parent: this.infoEl });
    this.controlEl = createDiv({ cls: 'setting-item-control', parent: this.settingEl });
  }

  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }

  setDesc(desc: string): this {
    this.descEl.textContent = desc;
    return this;
  }

  setHeading(): this {
    this.settingEl.classList.add('setting-item-heading');
    return this;
  }

  addText(cb: (text: TextComponent) => void): this {
    const inputEl = createEl('input', { cls: 'setting-input', type: 'text', parent: this.controlEl });
    const component: TextComponent = {
      inputEl,
      setValue(value: string) {
        inputEl.value = value;
        return component;
      },
      onChange(fn: (value: string) => void) {
        inputEl.addEventListener('change', () => fn(inputEl.value));
        return component;
      },
    };
    cb(component);
    return this;
  }

  addTextArea(cb: (text: TextAreaComponent) => void): this {
    const inputEl = createEl('textarea', { cls: 'setting-input', parent: this.controlEl });
    const component: TextAreaComponent = {
      inputEl,
      setValue(value: string) {
        inputEl.value = value;
        return component;
      },
      onChange(fn: (value: string) => void) {
        inputEl.addEventListener('change', () => fn(inputEl.value));
        return component;
      },
    };
    cb(component);
    return this;
  }

  addToggle(cb: (toggle: ToggleComponent) => void): this {
    const toggleEl = createEl('input', { cls: 'setting-toggle', type: 'checkbox', parent: this.controlEl });
    const component: ToggleComponent = {
      toggleEl,
      setValue(value: boolean) {
        toggleEl.checked = value;
        return component;
      },
      onChange(fn: (value: boolean) => void) {
        toggleEl.addEventListener('change', () => fn(toggleEl.checked));
        return component;
      },
    };
    cb(component);
    return this;
  }

  addDropdown(cb: (dropdown: DropdownComponent) => void): this {
    const selectEl = createEl('select', { cls: 'setting-dropdown', parent: this.controlEl });
    const component: DropdownComponent = {
      selectEl,
      addOption(value: string, label: string) {
        createEl('option', { text: label, attr: { value }, parent: selectEl });
        return component;
      },
      setValue(value: string) {
        selectEl.value = value;
        return component;
      },
      onChange(fn: (value: string) => void) {
        selectEl.addEventListener('change', () => fn(selectEl.value));
        return component;
      },
    };
    cb(component);
    return this;
  }

  addButton(cb: (button: ButtonComponent) => void): this {
    const buttonEl = createEl('button', { cls: 'btn', parent: this.controlEl });
    const component: ButtonComponent = {
      buttonEl,
      setButtonText(value: string) {
        buttonEl.textContent = value;
        return component;
      },
      setCta() {
        buttonEl.classList.add('btn-primary');
        return component;
      },
      setWarning() {
        buttonEl.classList.add('btn-danger');
        return component;
      },
      onClick(fn: () => void) {
        buttonEl.addEventListener('click', fn);
        return component;
      },
    };
    cb(component);
    return this;
  }
}
