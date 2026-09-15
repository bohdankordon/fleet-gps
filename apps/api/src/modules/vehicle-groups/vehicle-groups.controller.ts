import { Body, Controller, Delete, Get, HttpCode, HttpException, Param, Patch, Post, Put, Req } from "@nestjs/common";
import { normalizeUuid } from "../../common/uuid.validation";
import { buildUserActor } from "../audit";
import { AdminOnly } from "../auth/auth.decorators";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { VehicleGroupsError, VehicleGroupsService } from "./vehicle-groups.service";
import type { VehicleGroupDetail, VehicleGroupManagedVehicle, VehicleGroupSummary } from "./vehicle-groups.types";

function groupId(value: string): string { const id = normalizeUuid(value); if (!id) throw new VehicleGroupsError("NOT_FOUND"); return id; }
function actor(request: AuthenticatedRequest) { return buildUserActor(request.auth!.id, request.auth!.login); }
function groupError(error: unknown): never {
  if (!(error instanceof VehicleGroupsError)) throw error;
  const status = error.code === "NOT_FOUND" ? 404 : 400;
  throw new HttpException({ statusCode: status, error: error.code }, status);
}

@Controller("admin/vehicle-groups")
@AdminOnly()
export class VehicleGroupsController {
  public constructor(private readonly groups: VehicleGroupsService) {}

  @Get()
  public list(): Promise<readonly VehicleGroupSummary[]> { return this.groups.list(); }

  @Get("vehicles")
  public listVehicles(): Promise<readonly VehicleGroupManagedVehicle[]> { return this.groups.listVehiclesForAdmin(); }

  @Get(":groupId")
  public async detail(@Param("groupId") id: string): Promise<VehicleGroupDetail> { try { return await this.groups.detail(groupId(id)); } catch (error) { return groupError(error); } }

  @Post()
  public async create(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<VehicleGroupDetail> { try { return await this.groups.create(actor(request), body); } catch (error) { return groupError(error); } }

  @Patch(":groupId")
  public async rename(@Req() request: AuthenticatedRequest, @Param("groupId") id: string, @Body() body: unknown): Promise<VehicleGroupDetail> { try { return await this.groups.rename(actor(request), groupId(id), body); } catch (error) { return groupError(error); } }

  @Put(":groupId/vehicles")
  public async replaceVehicles(@Req() request: AuthenticatedRequest, @Param("groupId") id: string, @Body() body: unknown): Promise<VehicleGroupDetail> { try { return await this.groups.replaceVehicles(actor(request), groupId(id), body); } catch (error) { return groupError(error); } }

  @Delete(":groupId")
  @HttpCode(204)
  public async delete(@Req() request: AuthenticatedRequest, @Param("groupId") id: string): Promise<void> { try { await this.groups.delete(actor(request), groupId(id)); } catch (error) { return groupError(error); } }
}
