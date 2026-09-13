import type { RemoteCatalog } from '../network/Contracts';
import { applyCropCatalog } from '../../farm/config/CropConfig';
import { applyItemCatalog, applyFertilizerCatalog, applyMedicineCatalog } from '../../farm/config/ItemConfig';
import { applyLandRules, applyGrowthDisplay } from '../../farm/config/LandConfig';
import { applyWeatherConfig } from '../../farm/config/WeatherConfig';

let appliedVersion = '';

export function applyRemoteCatalog(catalog: RemoteCatalog | undefined): void {
  if (!catalog || !catalog.version || catalog.version === appliedVersion) return;
  applyItemCatalog(catalog.items, catalog.shopItems);
  applyCropCatalog(catalog.crops);
  applyFertilizerCatalog(catalog.fertilizers);
  applyMedicineCatalog(catalog.medicines);
  applyLandRules(catalog.land);
  applyGrowthDisplay(catalog.growth);
  applyWeatherConfig({ definitions: catalog.weather?.definitions, seasons: catalog.seasons });
  appliedVersion = catalog.version;
}
