import assert from "node:assert/strict";
import test from "node:test";
import { DataQuality, DailyStatSource, Prisma, PrismaClient, VehicleStatus } from "./generated/prisma/client";

test("generated Prisma public client exposes expected API without a connection", () => {
  assert.equal(typeof PrismaClient, "function");
  assert.equal(typeof Prisma.Decimal, "function");
  assert.equal(VehicleStatus.ONLINE, "ONLINE");
  assert.equal(DailyStatSource.MODE1, "MODE1");
  assert.equal(DataQuality.EXACT, "EXACT");
});
