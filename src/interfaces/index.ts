// src/interfaces/index.ts

export interface SwaggerData {
  info: any;
  servers: any[];
  endpoints: SwaggerEndpoint[];
}

export interface SwaggerEndpoint {
  method: string;
  path: string;
  summary: string;
  tags: string[];
  parameters?: any[];
  requestBody?: any;
}

export interface ProcessedApiEndpoint {
  method: string;
  full_path: string;
  summary: string;
  request_body: string | null;
  request_headers: string | null;
}

export interface GeminiRequest {
  endpoint: SwaggerEndpoint;
  pathDetails: any;
  definitions?: any;
}

export interface UserData {
  user_id: string;
  name: string;
  email: string;
  phone?: string;
}
