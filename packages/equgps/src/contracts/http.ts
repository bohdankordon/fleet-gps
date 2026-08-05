export type HttpMethod = "GET" | "POST";

export type HttpRequest = {
  method: HttpMethod;
  url: string;
  headers: Readonly<Record<string, string>>;
  formBody?: Readonly<Record<string, string>>;
  timeoutMs: number;
};

export type HttpResponse = {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: unknown;
};

export interface HttpTransport {
  execute(request: HttpRequest): Promise<HttpResponse>;
}
