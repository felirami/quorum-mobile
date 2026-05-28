/**
 * feedActiveTab — single-subscriber bus that the Feed tab uses to
 * receive the "tab icon was pressed while already on this tab" event
 * from the Tabs layout. The handler is registered by the Feed screen
 * and invoked by the tabPress listener.
 *
 * Why a module-level bus and not React context: the Tabs layout owns
 * the listener, and the Feed screen (which owns SocialFeedModal +
 * scroll state) is a descendant of that layout. Passing a callback
 * through context would force a re-render of all sub-screens on every
 * change, and naming a listener slot is enough — the feed is the
 * single subscriber.
 */

type Handler = () => void;

let current: Handler | null = null;

export const feedActiveTabBus = {
  /** Subscribe. Returns the unsubscribe function. Calling register
   *  while another handler exists replaces it (only one Feed screen
   *  should be mounted at a time, but Fast Refresh can briefly mount
   *  two — last write wins). */
  register(handler: Handler): () => void {
    current = handler;
    return () => {
      if (current === handler) current = null;
    };
  },

  /** Fire from the tabPress listener. No-op when no subscriber. */
  fire() {
    current?.();
  },
};
