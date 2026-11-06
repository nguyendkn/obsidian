import { ipc, type VaultInfo } from '../renderer/core/ipc-bridge';

const listEl = document.getElementById('vault-list')!;
const footerEl = document.getElementById('footer')!;
const dialog = document.getElementById('create-dialog') as HTMLDialogElement;
const nameInput = document.getElementById('vault-name') as HTMLInputElement;
const locationEl = document.getElementById('create-location')!;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

async function openVault(path: string): Promise<void> {
  try {
    await ipc.openVault(path);
  } catch (err) {
    renderError((err as Error).message);
  }
}

function renderError(message: string): void {
  listEl.replaceChildren(el('div', 'empty', `Could not open vault: ${message}`));
}

function renderVaults(vaults: VaultInfo[]): void {
  listEl.replaceChildren();
  if (!vaults.length) {
    listEl.append(el('div', 'empty', 'No vaults yet. Open a folder to get started.'));
    return;
  }
  for (const vault of vaults) {
    const row = el('div', 'vault');
    row.dataset.id = vault.id;
    const main = el('div', 'vault-main');
    main.append(el('div', 'vault-name', vault.name), el('div', 'vault-path', vault.path));
    const remove = el('button', 'vault-remove', '×');
    remove.title = 'Remove from list';
    remove.addEventListener('click', async (event) => {
      event.stopPropagation();
      await ipc.removeVault(vault.id);
      await refresh();
    });
    row.addEventListener('click', () => void openVault(vault.path));
    row.append(main, remove);
    listEl.append(row);
  }
}

async function refresh(): Promise<void> {
  const vaults = await ipc.listVaults();
  renderVaults(vaults);
}

async function openFolder(): Promise<void> {
  const folder = await ipc.pickFolder();
  if (folder) await openVault(folder);
}

async function createVault(): Promise<void> {
  const parent = await ipc.getDocumentsPath();
  locationEl.textContent = `Location: ${parent}`;
  nameInput.value = 'Obsidian Vault';
  dialog.showModal();
  setTimeout(() => nameInput.select(), 30);
}

dialog.addEventListener('close', async () => {
  if (dialog.returnValue !== 'create') return;
  const name = nameInput.value.trim();
  if (!name) return;
  const parent = await ipc.getDocumentsPath();
  try {
    await ipc.createVault(parent, name);
  } catch (err) {
    renderError((err as Error).message);
  }
});

document.getElementById('open-folder')!.addEventListener('click', () => void openFolder());
document.getElementById('create-vault')!.addEventListener('click', () => void createVault());
nameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    dialog.close('create');
  }
});

try {
  const info = ipc.version();
  footerEl.textContent = `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}`;
} catch {
  footerEl.textContent = 'Running outside Electron';
}

void refresh();
