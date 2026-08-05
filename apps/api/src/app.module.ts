import { Module } from "@nestjs/common";
import { ApiConfigModule } from "./config/api-config.module";
import { EquGpsModule } from "./modules/equgps/equgps.module";
import { DatabaseModule } from "./modules/database/database.module";
import { HealthModule } from "./modules/health/health.module";
import { FleetModule } from "./modules/fleet/fleet.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";

@Module({
  imports: [ApiConfigModule, EquGpsModule, DatabaseModule, HealthModule, FleetModule, DashboardModule],
})
export class AppModule {}
