/**
 * core/game/RemoteCatalog.ts —— 把服务端下发的 catalog 灌进客户端的 CSV 配置表。
 *
 * 表（`resources/datas/*.csv`）只提供「离线也能显示」的静态定义，服务端 catalog 一到就覆盖；
 * 扣费、奖励、成长合法性始终由服务端命令结果决定，这里不参与任何经济计算。
 */
import type { RemoteCatalog } from '../network/Contracts';
import { applyCropCatalog } from '../../farm/config/CropConfig';
import { applyItemCatalog } from '../../farm/config/ItemConfig';
import { applyLandRules, applyQualityGrades } from '../../farm/config/LandConfig';
import { applyWeatherConfig } from '../../farm/config/WeatherConfig';
import { applyFertilizerCatalog } from '../../farm/config/FertilizerConfig';
import { applyMedicineCatalog } from '../../farm/config/MedicineConfig';

let appliedVersion = '';

export function applyRemoteCatalog(catalog: RemoteCatalog | undefined): void {
  if (!catalog || !catalog.version || catalog.version === appliedVersion) return;
  applyItemCatalog(catalog.items, catalog.shopItems);
  applyCropCatalog(catalog.crops);
  applyFertilizerCatalog(catalog.fertilizers);
  applyMedicineCatalog(catalog.medicines);
  applyLandRules(catalog.land, catalog.growth);
  applyQualityGrades(catalog.qualityGrades);
  applyWeatherConfig({ definitions: catalog.weather?.definitions, seasons: catalog.seasons });
  appliedVersion = catalog.version;
}
