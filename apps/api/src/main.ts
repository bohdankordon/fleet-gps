import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import type { ApiConfig } from "./config/api-config";
import { API_CONFIG } from "./config/api-config.tokens";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api");
  app.enableShutdownHooks(["SIGINT", "SIGTERM"]);
  const config = app.get<ApiConfig>(API_CONFIG);
  await app.listen(config.port, config.host);
}

void bootstrap();
