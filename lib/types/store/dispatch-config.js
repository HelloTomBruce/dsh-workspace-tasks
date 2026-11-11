let current = {};
export function setPluginConfig(config) {
    current = config ?? {};
}
export function isCrossWorkspaceDispatchEnabled() {
    return current.dispatch?.crossWorkspace === true;
}
//# sourceMappingURL=dispatch-config.js.map