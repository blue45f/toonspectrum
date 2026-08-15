import { useEffect, useRef, useState } from "react";

import {
  persistStudioLiveGuestCredential,
  requestStudioLiveAuthTicket,
  type StudioLiveAuthTicketClientOptions,
} from "./studio-live-auth-ticket-client";
import { createStudioServerLiveTransportFactory } from "./studio-live-socket-transport";

import type { StudioLiveTransportFactory } from "./studio-live-collaboration-transport";
import type { StudioLiveAuthTicketResponse } from "../../../lib/studio-live-auth-ticket";

const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8_000;
const MAX_AUTOMATIC_RETRY_ATTEMPTS = 5;

function defaultScheduleTimeout(handler: () => void, delayMs: number): unknown {
  return globalThis.setTimeout(handler, delayMs);
}

function defaultCancelTimeout(handle: unknown): void {
  globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
}

interface AuthenticatedTransportFactoryState {
  readonly userId: string;
  readonly factory: StudioLiveTransportFactory;
}

export interface StudioLiveTransportAuthInput {
  readonly authReady: boolean;
  readonly userId: string | null;
}

export interface StudioLiveTransportAuthDependencies {
  readonly requestTicket?: (
    options?: StudioLiveAuthTicketClientOptions,
  ) => Promise<StudioLiveAuthTicketResponse>;
  readonly createGuestCredential?: () => string;
  readonly createServerFactory?: typeof createStudioServerLiveTransportFactory;
  readonly setTimeout?: (handler: () => void, delayMs: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
}

/**
 * Owns the browser-only admission credential lifecycle without coupling the one-minute
 * handshake ticket to the lifetime of an already-authorized collaboration room.
 *
 * The returned factory is stable for the authenticated user. Socket reconnects request a fresh
 * admission ticket through the factory's in-memory refresh callback; neither an expired seed
 * ticket nor a transient issuance failure can downgrade an authenticated document to a guest.
 */
export function useStudioLiveTransportAuth(
  input: StudioLiveTransportAuthInput,
  dependencies: StudioLiveTransportAuthDependencies = {},
): StudioLiveTransportFactory | undefined {
  const requestTicket = dependencies.requestTicket ?? requestStudioLiveAuthTicket;
  const createGuestCredential =
    dependencies.createGuestCredential ?? persistStudioLiveGuestCredential;
  const createServerFactory =
    dependencies.createServerFactory ?? createStudioServerLiveTransportFactory;
  const scheduleTimeout = dependencies.setTimeout ?? defaultScheduleTimeout;
  const cancelTimeout = dependencies.clearTimeout ?? defaultCancelTimeout;
  const guestFactoryRef = useRef<{
    readonly credential: string;
    readonly factory: StudioLiveTransportFactory;
  } | null>(null);
  const [authenticatedFactory, setAuthenticatedFactory] =
    useState<AuthenticatedTransportFactoryState | null>(null);

  useEffect(() => {
    if (!input.authReady || !input.userId) {
      setAuthenticatedFactory(null);
      return;
    }

    const userId = input.userId;
    let cancelled = false;
    let requestInFlight = false;
    let factoryReady = false;
    let automaticFailures = 0;
    let retryTimer: unknown | null = null;
    let requestController: AbortController | null = null;

    const clearRetry = () => {
      if (retryTimer === null) return;
      cancelTimeout(retryTimer);
      retryTimer = null;
    };
    const scheduleRetry = () => {
      if (
        cancelled ||
        factoryReady ||
        retryTimer !== null ||
        automaticFailures >= MAX_AUTOMATIC_RETRY_ATTEMPTS
      ) return;
      const delayMs = Math.min(
        MAX_RETRY_DELAY_MS,
        INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, automaticFailures - 1),
      );
      retryTimer = scheduleTimeout(() => {
        retryTimer = null;
        void issueInitialCredential();
      }, delayMs);
    };
    const issueInitialCredential = async () => {
      if (cancelled || factoryReady || requestInFlight) return;
      requestInFlight = true;
      const controller = new AbortController();
      requestController = controller;
      try {
        const response = await requestTicket({ signal: controller.signal });
        if (cancelled || controller.signal.aborted) return;
        const factory = createServerFactory(response.ticket, {
          refreshSocketCredential: async () => {
            const refreshed = await requestTicket();
            return refreshed.ticket;
          },
        });
        factoryReady = true;
        clearRetry();
        setAuthenticatedFactory({ userId, factory });
      } catch {
        if (cancelled || controller.signal.aborted) return;
        automaticFailures += 1;
        scheduleRetry();
      } finally {
        if (requestController === controller) requestController = null;
        requestInFlight = false;
      }
    };
    const recover = () => {
      if (cancelled || factoryReady) return;
      automaticFailures = 0;
      clearRetry();
      void issueInitialCredential();
    };

    setAuthenticatedFactory((current) =>
      current?.userId === userId ? current : null,
    );
    globalThis.addEventListener("online", recover, { passive: true });
    globalThis.addEventListener("focus", recover, { passive: true });
    void issueInitialCredential();

    return () => {
      cancelled = true;
      clearRetry();
      requestController?.abort();
      globalThis.removeEventListener("online", recover);
      globalThis.removeEventListener("focus", recover);
    };
  }, [
    cancelTimeout,
    createServerFactory,
    input.authReady,
    input.userId,
    requestTicket,
    scheduleTimeout,
  ]);

  if (!input.authReady) return undefined;
  if (input.userId) {
    return authenticatedFactory?.userId === input.userId
      ? authenticatedFactory.factory
      : undefined;
  }
  if (!guestFactoryRef.current) {
    try {
      const credential = createGuestCredential();
      guestFactoryRef.current = {
        credential,
        factory: createServerFactory(credential, {
          refreshSocketCredential: async () => credential,
        }),
      };
    } catch {
      guestFactoryRef.current = null;
    }
  }
  return guestFactoryRef.current?.factory;
}
