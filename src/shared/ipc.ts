/** IPC channel names mirroring the surveyed main-process surface. */
export const IPC = {
  version: 'version',
  vault: 'vault',
  vaultList: 'vault-list',
  pickFolder: 'pick-folder',
  vaultOpen: 'vault-open',
  vaultCreate: 'vault-create',
  vaultRemove: 'vault-remove',
  vaultMove: 'vault-move',
  requestUrl: 'request-url',
  openUrl: 'open-url',
  openFile: 'open-file',
  fileUrl: 'file-url',
  getDocumentsPath: 'get-documents-path',
  getDefaultVaultPath: 'get-default-vault-path',
  pluginScriptRoot: 'plugin-script-root',
  getIcon: 'get-icon',
  appInfo: 'app-info',
  windowFrame: 'frame',
  contextMenu: 'context-menu',
  renderMenu: 'render-menu',
  setMenu: 'set-menu',
  cli: 'cli',
  isQuitting: 'is-quitting',
  isClosing: 'is-closing',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
