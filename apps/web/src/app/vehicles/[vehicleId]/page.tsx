import { notFound } from "next/navigation";
import { VehicleDetailsClient } from "@/components/vehicle-details-client";
import { InitialVehicleDetailsError } from "@/components/initial-vehicle-details-error";
import { fetchVehicleDetails } from "@/lib/vehicle-details/vehicle-details-client";
import { isVehicleDetailsId } from "@/lib/vehicle-details/vehicle-details-contract";
import { VehicleDetailsBackendNotFoundError } from "@/lib/vehicle-details/vehicle-details-errors";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function VehicleDetailsPage({ params }: Readonly<{ params: Promise<{ vehicleId: string }> }>) { const { vehicleId } = await params; if (!isVehicleDetailsId(vehicleId)) notFound(); let data = null; try { data = await fetchVehicleDetails(vehicleId); } catch (error) { if (error instanceof VehicleDetailsBackendNotFoundError) notFound(); } if (data === null) return <InitialVehicleDetailsError />; return <div><VehicleDetailsClient initialData={data} /></div>; }
