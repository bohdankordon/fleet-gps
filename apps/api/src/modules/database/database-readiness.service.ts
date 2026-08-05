import { Injectable } from "@nestjs/common";
import { DatabaseService } from "./database.service";
export type DatabaseReadinessResult = { status: "ready" } | { status: "unavailable" };
@Injectable()
export class DatabaseReadinessService {
  public constructor(private readonly database: DatabaseService) {}
  public async check(): Promise<DatabaseReadinessResult> { try { await this.database.ping(); return { status: "ready" }; } catch { return { status: "unavailable" }; } }
}
