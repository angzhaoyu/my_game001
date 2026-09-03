import { http } from '../network/HttpClient';
import type { GameCommandType, GameSnapshot } from '../network/Contracts';

export class GameApi {
  /** includeCatalog=false 时服务端不重复下发目录，用于轮询刷新。 */
  bootstrap(includeCatalog = true): Promise<GameSnapshot> {
    return http.get<GameSnapshot>(
      '/game/bootstrap',
      includeCatalog ? undefined : { params: { catalog: '0' } },
    );
  }

  command(
    commandId: string,
    expectedVersion: number,
    type: GameCommandType,
    payload: Record<string, unknown>,
  ): Promise<GameSnapshot> {
    return http.post<GameSnapshot>(
      '/game/commands',
      { commandId, expectedVersion, type, payload },
      { idempotent: true },
    );
  }
}

export const gameApi = new GameApi();
