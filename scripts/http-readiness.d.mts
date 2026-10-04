type ProbeResult = { ok: boolean; error: string | null };
export function probeHttp(url: string, html?: boolean): Promise<ProbeResult>;
export function waitForHttp(options: { webUrl: string; serverUrl: string; timeoutMs?: number; intervalMs?: number;
  probe?: (url: string, html: boolean) => Promise<ProbeResult>; signal?: AbortSignal;
  processes?: () => { name: string; pid?: number; exitCode: number | null; signalCode?: string | null }[];
  onTimeout?: () => void }): Promise<boolean>;
