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
}

/** Options for creating a tunnel client. */
export interface TunnelOptions {
  gatewayUrl: string;
  walletAddress: string;
  secretKey: Uint8Array;
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
