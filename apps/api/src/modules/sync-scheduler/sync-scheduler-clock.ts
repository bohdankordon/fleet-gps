import { Injectable } from "@nestjs/common";

export interface Clock {
  now(): Date;
}

@Injectable()
export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}
