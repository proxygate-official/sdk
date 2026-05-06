/** Configuration for a single service exposed through a tunnel. */
export interface TunnelServiceConfig {
  name: string;
  port: number;
  price_per_request?: number;
  pricing_unit?: 'per_request' | 'per_token';
  price_per_input_token?: number;
  price_per_output_token?: number;
  paths?: string[];
  description?: string;
  endpoints?: Array<{
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    description?: string;
  }>;
  /** Path to docs file (.yaml/.json = openapi, .md = markdown). Read and uploaded on connect. */
  docs?: string;
}

/** Options for creating a tunnel client. Provide either apiKey OR walletAddress+secretKey. */
export interface TunnelOptions {
  gatewayUrl: string;
  /** API key for bearer auth (Phase 49). Alternative to walletAddress+secretKey. */
  apiKey?: string;
  walletAddress?: string;
  secretKey?: Uint8Array;
  services: TunnelServiceConfig[];
  onConnected?: (listings: TunnelRegisteredListing[]) => void;
  onDisconnected?: (reason: string) => void;
  onError?: (error: Error) => void;
  onRequest?: (requestId: string, service: string, path: string) => void;
  onDrained?: () => void;
}

/** A listing registered through the tunnel. */
export interface TunnelRegisteredListing {
  id: string;
  service: string;
  endpoint: string;
}

/** Tunnel client interface. */
export interface TunnelClient {
  connect(): Promise<TunnelRegisteredListing[]>;
  disconnect(): void;
  drain(): Promise<void>;
  isConnected(): boolean;
}

/** Options for client.serve() — exposes local services via tunnel. */
export interface ServeOptions {
  /** Callback when tunnel is connected and services registered. */
  onConnected?: (listings: TunnelRegisteredListing[]) => void;
  /** Callback when tunnel disconnects. */
  onDisconnected?: (reason: string) => void;
  /** Callback on errors. */
  onError?: (error: Error) => void;
  /** Callback on each incoming request. */
  onRequest?: (requestId: string, service: string, path: string) => void;
}

/** Options for the static Proxygate.serve() one-liner. Provide keypair OR apiKey. */
export interface ProxygateServeOptions extends ServeOptions {
  /** Gateway URL (default: https://gateway.proxygate.ai). */
  gatewayUrl?: string;
  /** Path to Solana keypair JSON file. Required for wallet-sig auth. */
  keypair?: string;
  /** API key for bearer auth (Phase 49). Alternative to keypair. */
  apiKey?: string;
  /** Services to expose. */
  services: TunnelServiceConfig[];
}
