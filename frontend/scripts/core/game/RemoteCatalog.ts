import type { RemoteCatalog } from '../network/Contracts';
import { applyCropCatalog } from '../../farm/config/CropConfig';
import { applyItemCatalog } from '../../farm/config/ItemConfig';
import { applyLandRules } from '../../farm/config/LandConfig';
import { applyWeatherConfig } from '../../farm/config/WeatherConfig';
import { applyFertilizerCatalog } from '../../farm/config/FertilizerConfig';
import { applyPesticideCatalog } from '../../farm/config/PesticideConfig';

let appliedVersion = '';

export function applyRemoteCatalog(catalog: RemoteCatalog | undefined): void {
  if (!catalog || !catalog.version || catalog.version === appliedVersion) return;
  applyItemCatalog(catalog.items, catalog.shopItems);
  applyCropCatalog(catalog.crops);
  applyFertilizerCatalog(catalog.fertilizers);
  // 兼容旧数据：medicines → pesticides
  applyPesticideCatalog(catalog.pesticides || catalog.medicines);
  applyLandRules(catalog.land);
  applyWeatherConfig({ definitions: catalog.weather?.definitions, seasons: catalog.seasons });
  appliedVersion = catalog.version;
}
