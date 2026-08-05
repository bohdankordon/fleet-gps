import { Global, Module } from "@nestjs/common";
import { parseApiConfig } from "./api-config";
import { API_CONFIG } from "./api-config.tokens";
@Global()
@Module({ providers: [{ provide: API_CONFIG, useFactory: () => parseApiConfig(process.env) }], exports: [API_CONFIG] })
export class ApiConfigModule {}
