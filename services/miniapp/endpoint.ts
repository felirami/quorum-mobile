/**
 * WebView RPC Endpoint for MiniApp Communication
 *
 * Uses Comlink-compatible endpoint for bidirectional communication with mini apps.
 * Compatible with @farcaster/miniapp-host-react-native SDK.
 *
 * Protocol:
 * - Mini app sends via: window.ReactNativeWebView.postMessage(JSON.stringify(data))
 * - Native responds via: FarcasterFrameCallback event
 * - Native emits events via: FarcasterFrameEvent event
 */

import * as Comlink from 'comlink';
import { RefObject } from 'react';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import { logger } from '@quilibrium/quorum-shared';

// ============ Types ============

export interface WebViewEndpoint extends Comlink.Endpoint {
  /** Handle incoming messages from WebView */
  onMessage: (e: WebViewMessageEvent) => void;
  /** Emit event to WebView */
  emit: (data: unknown) => void;
}

// ============ Endpoint Creation ============

/**
 * Standard MessageEvent is unavailable in React Native since it's part of HTML Standard.
 * Implement our own MessageEvent with the minimum properties required by Comlink.
 */
class ComlinkMessageEvent {
  public origin = 'ReactNativeWebView';
  constructor(public data: unknown) {}
}

/**
 * Creates a Comlink-compatible WebView RPC endpoint for communicating with mini apps.
 * This matches the interface expected by @farcaster/miniapp-host-react-native.
 */
export function createWebViewEndpoint(
  webViewRef: RefObject<WebView | null>,
  domain: string
): WebViewEndpoint {
  const listeners: EventListenerOrEventListenerObject[] = [];

  return {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'message') {
        throw Error(`Got an unexpected event type "${type}". Expected "message".`);
      }
      listeners.push(listener);
    },

    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type !== 'message') {
        throw Error(`Got an unexpected event type "${type}". Expected "message".`);
      }
      const index = listeners.findIndex((l) => l === listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    },

    postMessage: (data: unknown) => {
      if (!webViewRef.current) {
        logger.warn('[MiniApp] Cannot respond - WebView not available');
        return;
      }

      const dataStr = JSON.stringify(data);

      // Inject JavaScript to dispatch the response event
      // The mini app SDK listens on 'FarcasterFrameCallback' for Comlink responses
      const script = `
        (function() {
          const data = ${dataStr};
          console.log('[MiniApp:res]', JSON.stringify(data, null, 2));
          document.dispatchEvent(new MessageEvent('FarcasterFrameCallback', { data: data }));
        })();
        true;
      `;

      webViewRef.current.injectJavaScript(script);
    },

    onMessage: (e: WebViewMessageEvent) => {
      try {
        // Validate origin domain for security
        // Allow the exact domain, www subdomain, or any subdomain of the domain
        const originDomain = new URL(e.nativeEvent.url).hostname;
        const isValidDomain = originDomain === domain ||
          originDomain === `www.${domain}` ||
          originDomain.endsWith(`.${domain}`);
        if (!isValidDomain) {
          logger.warn('[MiniApp] Invalid message domain, ignoring:', originDomain, 'expected:', domain);
          return;
        }

        const data = JSON.parse(e.nativeEvent.data);

        // Create a MessageEvent-like object for Comlink
        const messageEvent = new ComlinkMessageEvent(data);

        // Dispatch to all registered Comlink listeners
        for (const listener of listeners) {
          if (typeof listener === 'function') {
            listener(messageEvent as unknown as Event);
          } else {
            listener.handleEvent(messageEvent as unknown as Event);
          }
        }
      } catch (error) {
        logger.warn('[MiniApp] Failed to parse WebView message:', e.nativeEvent.data);
      }
    },

    emit: (data: unknown) => {
      if (!webViewRef.current) {
        return;
      }

      const dataStr = JSON.stringify(data);

      // Inject JavaScript to dispatch the event
      // The mini app SDK listens on 'FarcasterFrameEvent' for events
      const script = `
        (function() {
          const data = ${dataStr};
          console.debug('[MiniApp:event]', data);
          document.dispatchEvent(new MessageEvent('FarcasterFrameEvent', { data: data }));
        })();
        true;
      `;

      webViewRef.current.injectJavaScript(script);
    },
  };
}

export { Comlink };
