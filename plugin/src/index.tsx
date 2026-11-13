import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import RemoteControlPlugin from './RemoteControlPlugin';

const script = document.currentScript as HTMLScriptElement | null;
const uuid = script?.getAttribute('uuid') || 'root';

// config.json lives next to the bundle (…/plugins/remote-control/config.json).
const configUrl = new URL('config.json', script?.src || window.location.href).toString();

const root = ReactDOM.createRoot(document.getElementById(uuid) as HTMLElement);
root.render(<RemoteControlPlugin pluginUuid={uuid} configUrl={configUrl} />);
