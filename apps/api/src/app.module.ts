import { Module } from "@nestjs/common";
import { ApiConfigModule } from "./config/api-config.module";
import { EquGpsModule } from "./modules/equgps/equgps.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [ApiConfigModule, EquGpsModule, HealthModule],
})
export class AppModule {}
