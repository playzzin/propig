export function init(_options?: unknown): undefined {
  return undefined;
}

export function replayIntegration(): { name: string } {
  return { name: 'DisabledSentryReplay' };
}

export function captureRouterTransitionStart(_href: string, _navigationType: string): void {}

export function captureRequestError(..._args: unknown[]): void {}
