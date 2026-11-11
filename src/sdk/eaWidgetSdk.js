import { useState, useEffect, useCallback } from 'react';

/**
 * Modern Web Guidance (`validate-origins`):
 * Validate parent host MessageEvent origin using the browser `Origin` API (`Origin.from` + `isSameOrigin`)
 * with a strict `new URL()` fallback that explicitly rejects `'null'` opaque origins.
 */
function resolveTrustedParentOrigin() {
  const params = new URLSearchParams(window.location.search);
  const explicitHost = params.get('eaHostOrigin');
  if (explicitHost) {
    try {
      const parsed = new URL(explicitHost);
      if (parsed.origin !== 'null') return parsed.origin;
    } catch {
      // fall through
    }
  }
  if (document.referrer) {
    try {
      const refUrl = new URL(document.referrer);
      if (refUrl.origin !== 'null') return refUrl.origin;
    } catch {
      // fall through
    }
  }
  return window.location.origin;
}

function isTrustedHostMessage(event, trustedOriginString) {
  if (window.parent && event.source !== window.parent) {
    return false;
  }
  try {
    if ('Origin' in globalThis) {
      let eventOriginObj;
      try {
        eventOriginObj = globalThis.Origin.from(event);
      } catch {
        eventOriginObj = globalThis.Origin.from(event.origin);
      }
      return eventOriginObj.isSameOrigin(globalThis.Origin.from(trustedOriginString));
    }
    const candidateUrl = new URL(event.origin);
    const trustedUrl = new URL(trustedOriginString);
    return candidateUrl.origin !== 'null' && candidateUrl.origin === trustedUrl.origin;
  } catch {
    return false;
  }
}

const initialParams = new URLSearchParams(window.location.search);
const initialProxyBase = initialParams.get('eaProxyBase') || '';
const trustedHostOrigin = resolveTrustedParentOrigin();

let sharedState = {
  ready: window.parent === window,
  token: null,
  widgetId: 'virtual-office',
  widgetLevel: 'execute',
  proxyBasePath: initialProxyBase,
  capabilities: [],
  user: null
};

const subscribers = new Set();
let pendingTokenResolvers = [];

function notifySubscribers() {
  const snapshot = { ...sharedState };
  for (const listener of subscribers) {
    listener(snapshot);
  }
}

function postToHost(message) {
  if (!window.parent || window.parent === window) return;
  // Modern Web Guidance (`security` §1.5): Always specify exact targetOrigin, never '*'
  window.parent.postMessage(message, trustedHostOrigin);
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (!isTrustedHostMessage(event, trustedHostOrigin)) {
      return;
    }
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'ZTA_AUTH_TOKEN' && data.payload) {
      sharedState = {
        ...sharedState,
        ready: true,
        token: data.payload.token || sharedState.token,
        widgetId: data.payload.widgetId || sharedState.widgetId,
        widgetLevel: data.payload.widgetLevel || sharedState.widgetLevel,
        proxyBasePath: data.payload.proxyBasePath ?? sharedState.proxyBasePath,
        capabilities: Array.isArray(data.payload.capabilities) ? data.payload.capabilities : [],
        user: data.payload.user || sharedState.user
      };
      notifySubscribers();

      if (pendingTokenResolvers.length > 0 && sharedState.token) {
        const resolvers = pendingTokenResolvers;
        pendingTokenResolvers = [];
        resolvers.forEach((resolve) => resolve(sharedState.token));
      }
    }
  });

  // Notify EA-Core PluginHostFrame that iframe listener is active
  if (window.parent && window.parent !== window) {
    postToHost({ type: 'EA_PLUGIN_READY', payload: { widgetId: 'virtual-office' } });
  }

  // Proactive ZTA silent refresh every 12 minutes (before 15m Agent JWT expiration)
  setInterval(() => {
    if (window.parent && window.parent !== window) {
      postToHost({ type: 'REQUEST_A2A_TOKEN' });
    }
  }, 12 * 60 * 1000);
}

function requestSilentTokenRefresh(timeoutMs = 4000) {
  if (!window.parent || window.parent === window) {
    return Promise.resolve(sharedState.token);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(sharedState.token);
    }, timeoutMs);
    pendingTokenResolvers.push((freshToken) => {
      clearTimeout(timer);
      resolve(freshToken);
    });
    postToHost({ type: 'REQUEST_A2A_TOKEN' });
  });
}

export async function eaFetch(apiPath, options = {}) {
  const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const fullUrl = sharedState.proxyBasePath
    ? `${sharedState.proxyBasePath}${normalizedPath}`
    : normalizedPath;

  const buildHeaders = (tok) => {
    const headers = new Headers(options.headers || {});
    if (tok) {
      headers.set('Authorization', `Bearer ${tok}`);
    }
    return headers;
  };

  let res = await fetch(fullUrl, {
    ...options,
    headers: buildHeaders(sharedState.token)
  });

  // Transparent ZTA silent refresh retry on expired Agent JWT
  if (res.status === 401 && window.parent && window.parent !== window) {
    const refreshedToken = await requestSilentTokenRefresh();
    if (refreshedToken) {
      res = await fetch(fullUrl, {
        ...options,
        headers: buildHeaders(refreshedToken)
      });
    }
  }

  return res;
}

export function openSubWindow({ windowId, subView, title, width, height, params = {} }) {
  if (window.parent && window.parent !== window) {
    postToHost({
      type: 'EA_OPEN_WINDOW',
      payload: { windowId, subView, title, width, height, params }
    });
    return;
  }
  // Standalone preview fallback outside EA-Core Desktop
  const url = new URL(window.location.href);
  url.searchParams.set('view', subView);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  window.open(url.href, windowId || subView, `width=${width || 420},height=${height || 540}`);
}

export function pushHostNotification({ title, body, senderId, senderName, senderAvatar }) {
  postToHost({
    type: 'EA_PUSH_NOTIFICATION',
    payload: { title, body, senderId, senderName, senderAvatar }
  });
}

export function useEaWidgetContext() {
  const [ctx, setCtx] = useState(() => ({ ...sharedState }));

  useEffect(() => {
    const listener = (next) => setCtx(next);
    subscribers.add(listener);
    if (window.parent && window.parent !== window && !sharedState.token) {
      postToHost({ type: 'EA_PLUGIN_READY', payload: { widgetId: 'virtual-office' } });
    }
    return () => {
      subscribers.delete(listener);
    };
  }, []);

  const hasMinLevel = useCallback((requiredLevel) => {
    const rank = { none: 0, read: 1, execute: 2, manage: 3 };
    const current = rank[ctx.widgetLevel] ?? rank.execute;
    return current >= (rank[requiredLevel] ?? rank.read);
  }, [ctx.widgetLevel]);

  return {
    ...ctx,
    hasMinLevel,
    eaFetch,
    openSubWindow,
    pushHostNotification
  };
}
