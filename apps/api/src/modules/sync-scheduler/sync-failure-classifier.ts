import { EquGpsError } from "@taxi-gps/equgps";
import { ApiConfigurationError } from "../../config/api-config";
import { Prisma } from "../../generated/prisma/client";
import { DailyRunsConfigurationError } from "../dashboard/dashboard.types";
import { SyncSchedulerStateError, type SyncFailureCategory } from "./sync-scheduler.types";

export function classifySyncFailure(error: unknown): SyncFailureCategory {
  if (error instanceof EquGpsError) return "equgps";

  if (
    error instanceof ApiConfigurationError ||
    error instanceof DailyRunsConfigurationError ||
    error instanceof SyncSchedulerStateError
  ) {
    return "configuration";
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientValidationError
  ) {
    return "database";
  }

  return "unknown";
}
