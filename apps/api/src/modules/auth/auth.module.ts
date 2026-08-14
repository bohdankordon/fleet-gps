import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "../database/database.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthenticationGuard } from "./authentication.guard";
import { PermissionGuard } from "./permission.guard";
import { AdminUsersController } from "./admin-users.controller";
import { ADMIN_USER_SECURITY, AdminUsersService, DEFAULT_ADMIN_USER_SECURITY } from "./admin-users.service";
import { AuditModule } from "../audit";
import { LoginRateLimiter } from "./login-rate-limiter";

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [AuthController, AdminUsersController],
  providers: [AuthService, LoginRateLimiter, AdminUsersService, { provide: ADMIN_USER_SECURITY, useValue: DEFAULT_ADMIN_USER_SECURITY }, { provide: APP_GUARD, useClass: AuthenticationGuard }, { provide: APP_GUARD, useClass: PermissionGuard }],
  exports: [AuthService],
})
export class AuthModule {}
