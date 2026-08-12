import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "../database/database.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthenticationGuard } from "./authentication.guard";
import { PermissionGuard } from "./permission.guard";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthenticationGuard }, { provide: APP_GUARD, useClass: PermissionGuard }],
  exports: [AuthService],
})
export class AuthModule {}
