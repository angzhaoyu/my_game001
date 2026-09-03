import type { RemoteCatalog } from '../network/Contracts';
import { applyCropCatalog } from '../../farm/config/CropConfig';
import { applyItemCatalog } from '../../farm/config/ItemConfig';
import { applyLandRules } from '../../farm/config/LandConfig';
import { applyWeatherConfig } from '../../farm/config/WeatherConfig';

let appliedVersion = '';

export function applyRemoteCatalog(catalog: RemoteCatalog | undefined): void {
  if (!catalog || !catalog.version || catalog.version === appliedVersion) return;
  applyItemCatalog(catalog.items, catalog.shopItems);
  applyCropCatalog(catalog.crops);
  applyLandRules(catalog.land, catalog.shopItems);
  applyWeatherConfig(catalog.weather);
  appliedVersion = catalog.version;
}
