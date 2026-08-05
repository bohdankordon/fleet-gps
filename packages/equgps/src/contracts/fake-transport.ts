import type { HttpRequest, HttpResponse, HttpTransport } from "./http";

export class FakeHttpTransport implements HttpTransport {
  public readonly requests: HttpRequest[] = [];

  public constructor(private readonly responder: (request: HttpRequest) => Promise<HttpResponse>) {}

  public async execute(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    return this.responder(request);
  }
}
