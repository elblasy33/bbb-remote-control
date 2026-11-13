import * as React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  BbbPluginSdk,
  PluginApi,
  DataChannelTypes,
  ScreenshareHelperButton,
  ScreenshareHelperItemPosition,
  OptionsDropdownOption,
  NotificationTypeUiCommand,
  pluginLogger,
} from 'bigbluebutton-html-plugin-sdk';
import {
  RcMessage, RcConfig, IncomingRequest, OutgoingRequest,
} from './types';
import { getStrings } from './i18n';
import {
  loadMyId, saveMyId, isValidId, normalizeId, connectUri, newReqId,
} from './rustdesk';
import {
  Modal, CopyField, btn, input,
} from './Modal';

const CHANNEL = 'remote-control';
const REQUEST_TIMEOUT_MS = 60_000;

interface Props {
  pluginUuid: string;
  configUrl: string;
}

export default function RemoteControlPlugin({ pluginUuid, configUrl }: Props): React.ReactElement | null {
  BbbPluginSdk.initialize(pluginUuid);
  const pluginApi: PluginApi = BbbPluginSdk.getPluginApi(pluginUuid);
  const { t, rtl } = getStrings();

  const [config, setConfig] = useState<RcConfig | null>(null);
  const [myId, setMyId] = useState<string>(loadMyId());
  const [idDraft, setIdDraft] = useState<string>(loadMyId());
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [incoming, setIncoming] = useState<IncomingRequest | null>(null);
  const [outgoing, setOutgoing] = useState<OutgoingRequest | null>(null);

  const seen = useRef<Set<string>>(new Set());
  const incomingRef = useRef<IncomingRequest | null>(null);
  incomingRef.current = incoming;
  const outgoingRef = useRef<OutgoingRequest | null>(null);
  outgoingRef.current = outgoing;

  // ---- data -------------------------------------------------------------
  const currentUser = pluginApi.useCurrentUser?.();
  const usersInfo = pluginApi.useUsersBasicInfo?.();
  const { data: channelData, pushEntry } = pluginApi.useDataChannel!<RcMessage>(
    CHANNEL, DataChannelTypes.NEW_ITEMS,
  );

  const me = currentUser?.data;
  const users = usersInfo?.data?.user || [];
  const presenter = users.find((u) => u.presenter);
  const meInfo = users.find((u) => u.userId === me?.userId);
  const amPresenter = !!me?.presenter;
  const amModerator = !!meInfo?.isModerator || me?.role === 'MODERATOR';
  const canRequest = !!config && !amPresenter
    && (config.requestRoles === 'all' || amModerator);

  // ---- config.json --------------------------------------------------------
  useEffect(() => {
    fetch(configUrl, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((c: RcConfig) => setConfig(c))
      .catch((e) => pluginLogger.error('[RemoteControl] failed to load config.json', e));
  }, [configUrl]);

  const send = useCallback((msg: RcMessage) => {
    if (!pushEntry) return;
    pushEntry(msg, { receivers: [{ userId: msg.to }] });
  }, [pushEntry]);

  // ---- incoming messages --------------------------------------------------
  useEffect(() => {
    const entries = channelData?.data || [];
    if (!me?.userId) return;
    entries.forEach((entry) => {
      if (seen.current.has(entry.entryId)) return;
      seen.current.add(entry.entryId);
      const msg = entry.payloadJson;
      const from = entry.createdBy; // set by the server — trusted
      if (!msg || msg.to !== me.userId || from === me.userId) return;

      switch (msg.kind) {
        case 'request': {
          if (!me.presenter) return;
          const sender = users.find((u) => u.userId === from);
          if (config?.requestRoles !== 'all' && !sender?.isModerator) return;
          if (incomingRef.current) {
            send({ kind: 'deny', reqId: msg.reqId, to: from, reason: 'busy' });
            return;
          }
          setIncoming({ reqId: msg.reqId, fromId: from, fromName: sender?.name || msg.fromName });
          break;
        }
        case 'cancel': {
          if (incomingRef.current?.reqId === msg.reqId && incomingRef.current.fromId === from) setIncoming(null);
          break;
        }
        case 'grant': {
          const o = outgoingRef.current;
          if (!o || o.reqId !== msg.reqId || o.presenterId !== from || !isValidId(msg.rustdeskId)) return;
          setOutgoing({ ...o, status: 'granted', rustdeskId: msg.rustdeskId });
          break;
        }
        case 'deny': {
          const o = outgoingRef.current;
          if (!o || o.reqId !== msg.reqId || o.presenterId !== from) return;
          setOutgoing({ ...o, status: msg.reason === 'busy' ? 'busy' : 'denied' });
          break;
        }
        default:
      }
    });
  }, [channelData, me?.userId, me?.presenter, users, config, send]);

  // Pending request times out.
  useEffect(() => {
    if (outgoing?.status !== 'pending') return undefined;
    const id = outgoing.reqId;
    const timer = setTimeout(() => {
      if (outgoingRef.current?.reqId === id && outgoingRef.current.status === 'pending') {
        setOutgoing({ ...outgoingRef.current, status: 'timeout' });
      }
    }, REQUEST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [outgoing?.reqId, outgoing?.status]);

  // Presenter role lost → drop any pending incoming request.
  useEffect(() => {
    if (!amPresenter && incoming) setIncoming(null);
  }, [amPresenter, incoming]);

  // ---- actions ------------------------------------------------------------
  const requestControl = useCallback(() => {
    if (!presenter || !me) {
      pluginApi.uiCommands?.notification.send({
        message: t.noPresenter, icon: 'desktop', type: NotificationTypeUiCommand.INFO,
      });
      return;
    }
    const reqId = newReqId();
    setOutgoing({
      reqId, presenterId: presenter.userId, presenterName: presenter.name, status: 'pending',
    });
    send({
      kind: 'request', reqId, to: presenter.userId, fromName: me.name,
    });
  }, [presenter, me, send, t, pluginApi]);

  const cancelOutgoing = () => {
    const o = outgoingRef.current;
    if (o?.status === 'pending') send({ kind: 'cancel', reqId: o.reqId, to: o.presenterId });
    setOutgoing(null);
  };

  const answer = (allow: boolean) => {
    const req = incomingRef.current;
    if (!req) return;
    if (allow) {
      const id = normalizeId(idDraft);
      if (!isValidId(id)) return;
      if (id !== myId) { saveMyId(id); setMyId(id); }
      send({
        kind: 'grant', reqId: req.reqId, to: req.fromId, rustdeskId: id,
      });
    } else {
      send({
        kind: 'deny', reqId: req.reqId, to: req.fromId, reason: 'denied',
      });
    }
    setIncoming(null);
  };

  // ---- UI registration ----------------------------------------------------
  const requestRef = useRef(requestControl);
  requestRef.current = requestControl;

  useEffect(() => {
    pluginApi.setScreenshareHelperItems(canRequest ? [
      new ScreenshareHelperButton({
        icon: 'desktop',
        label: t.requestControl,
        tooltip: t.requestControlTip,
        disabled: false,
        hasSeparator: false,
        position: ScreenshareHelperItemPosition.TOP_LEFT,
        dataTest: 'remoteControlRequestButton',
        onClick: () => requestRef.current(),
      }),
    ] : []);
  }, [canRequest]);

  useEffect(() => {
    pluginApi.setOptionsDropdownItems([
      new OptionsDropdownOption({
        label: t.settingsMenu,
        icon: 'desktop',
        dataTest: 'remoteControlSettings',
        onClick: () => { setIdDraft(loadMyId()); setSettingsSaved(false); setShowSettings(true); },
      }),
    ]);
  }, []);

  // ---- render -------------------------------------------------------------
  const draftValid = isValidId(normalizeId(idDraft));

  return (
    <>
      {incoming && (
        <Modal
          title={t.incomingTitle}
          rtl={rtl}
          actions={(
            <>
              <button type="button" style={btn('primary')} disabled={!draftValid} onClick={() => answer(true)}>{t.allow}</button>
              <button type="button" style={btn('danger')} onClick={() => answer(false)}>{t.deny}</button>
            </>
          )}
        >
          <p style={{ margin: '0 0 8px' }}>{t.incomingBody(incoming.fromName)}</p>
          {!isValidId(myId) && <p style={{ margin: 0 }}>{t.needId}</p>}
          <input
            style={input}
            value={idDraft}
            placeholder={t.idPlaceholder}
            onChange={(e) => setIdDraft(e.target.value)}
            inputMode="numeric"
          />
          {idDraft && !draftValid && <div style={{ color: '#c62828', fontSize: 12 }}>{t.invalidId}</div>}
          <p style={{ fontSize: 12, color: '#555', margin: '8px 0 0' }}>{t.incomingNote}</p>
        </Modal>
      )}

      {outgoing && (
        <Modal
          title={outgoing.status === 'pending' ? t.pendingTitle
            : outgoing.status === 'granted' ? t.grantedTitle : t.deniedTitle}
          rtl={rtl}
          onClose={outgoing.status === 'pending' ? undefined : () => setOutgoing(null)}
          actions={outgoing.status === 'pending'
            ? <button type="button" style={btn()} onClick={cancelOutgoing}>{t.cancel}</button>
            : (
              <>
                {outgoing.status === 'granted' && outgoing.rustdeskId && (
                  <a style={btn('primary')} href={connectUri(outgoing.rustdeskId)}>{t.openRustdesk}</a>
                )}
                <button type="button" style={btn()} onClick={() => setOutgoing(null)}>{t.close}</button>
              </>
            )}
        >
          {outgoing.status === 'pending' && <p>{t.pendingBody(outgoing.presenterName)}</p>}
          {outgoing.status === 'granted' && outgoing.rustdeskId && (
            <>
              <p style={{ marginTop: 0 }}>{t.grantedBody(outgoing.presenterName)}</p>
              <p style={{ margin: '4px 0', fontSize: 12 }}>{t.manualId}</p>
              <CopyField value={outgoing.rustdeskId} label={t.copy} copiedLabel={t.copied} />
            </>
          )}
          {outgoing.status === 'denied' && <p>{t.deniedBody(outgoing.presenterName)}</p>}
          {outgoing.status === 'busy' && <p>{t.busyBody(outgoing.presenterName)}</p>}
          {outgoing.status === 'timeout' && <p>{t.timeoutBody(outgoing.presenterName)}</p>}
        </Modal>
      )}

      {showSettings && (
        <Modal
          title={t.settingsTitle}
          rtl={rtl}
          onClose={() => setShowSettings(false)}
          actions={(
            <>
              <button
                type="button"
                style={btn('primary')}
                disabled={!draftValid}
                onClick={() => {
                  const id = normalizeId(idDraft);
                  saveMyId(id); setMyId(id); setSettingsSaved(true);
                }}
              >
                {settingsSaved ? t.saved : t.save}
              </button>
              <button type="button" style={btn()} onClick={() => setShowSettings(false)}>{t.close}</button>
            </>
          )}
        >
          <p style={{ marginTop: 0 }}>{t.settingsIntro}</p>
          <ol style={{ paddingInlineStart: 18, margin: 0 }}>
            <li>
              {t.step1}
              {' '}
              <a href={config?.downloadUrl || 'https://rustdesk.com/download'} target="_blank" rel="noreferrer">rustdesk.com/download</a>
            </li>
            {config && (
              <li>
                {t.step2Win}
                <CopyField value={config.windowsExeName} label={t.copy} copiedLabel={t.copied} />
                {t.step2Other}
                <CopyField value={config.configString} label={t.copy} copiedLabel={t.copied} />
              </li>
            )}
            <li>{t.step3}</li>
            <li>
              {t.step4}
              <input
                style={input}
                value={idDraft}
                placeholder={t.idPlaceholder}
                onChange={(e) => { setIdDraft(e.target.value); setSettingsSaved(false); }}
                inputMode="numeric"
              />
              {idDraft && !draftValid && <div style={{ color: '#c62828', fontSize: 12 }}>{t.invalidId}</div>}
            </li>
          </ol>
          <p style={{ fontSize: 12, color: '#555', marginBottom: 0 }}>{t.macNote}</p>
        </Modal>
      )}
    </>
  );
}
