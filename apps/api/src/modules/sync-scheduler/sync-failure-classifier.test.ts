import assert from "node:assert/strict";
import test from "node:test";
import { EquGpsNetworkError } from "@taxi-gps/equgps";
import { ApiConfigurationError } from "../../config/api-config";
import { Prisma } from "../../generated/prisma/client";
import { DailyRunsConfigurationError } from "../dashboard/dashboard.types";
import { classifySyncFailure } from "./sync-failure-classifier";
import { SyncSchedulerStateError } from "./sync-scheduler.types";

test("classifies real eQuGPS and configuration errors", () => {
  assert.equal(classifySyncFailure(new EquGpsNetworkError()), "equgps");
  assert.equal(classifySyncFailure(new ApiConfigurationError(["PORT"])), "configuration");
  assert.equal(classifySyncFailure(new DailyRunsConfigurationError()), "configuration");
  assert.equal(classifySyncFailure(new SyncSchedulerStateError()), "configuration");
});

test("classifies all public generated Prisma runtime errors as database failures", () => {
  const errors = [
    new Prisma.PrismaClientKnownRequestError("safe", { code: "P0001", clientVersion: "7.9.1" }),
    new Prisma.PrismaClientUnknownRequestError("safe", { clientVersion: "7.9.1" }),
    new Prisma.PrismaClientRustPanicError("safe", "7.9.1"),
    new Prisma.PrismaClientInitializationError("safe", "7.9.1"),
    new Prisma.PrismaClientValidationError("safe", { clientVersion: "7.9.1" }),
  ];

  for (const error of errors) assert.equal(classifySyncFailure(error), "database");
});

test("does not classify untrusted values by names, codes, or messages", () => {
  class PrismaClientKnownRequestError extends Error {}

  const unknownValues: readonly unknown[] = [
    new Error("EquGpsError"),
    "failure",
    42,
    null,
    undefined,
    { name: "EquGpsError" },
    { code: "P0001" },
    new PrismaClientKnownRequestError("safe"),
  ];

  for (const value of unknownValues) assert.equal(classifySyncFailure(value), "unknown");
});

test("does not read message getters or mutate unknown error objects", () => {
  let messageReads = 0;
  const error = {
    marker: "unchanged",
    get message(): string {
      messageReads += 1;
      throw new Error("must not read message");
    },
  };
  const before = { marker: error.marker };

  assert.equal(classifySyncFailure(error), "unknown");
  assert.equal(messageReads, 0);
  assert.deepEqual(error.marker, before.marker);
});
