import { http } from '../network/HttpClient';
import type { GameCommandType, GameSnapshot } from '../network/Contracts';

export class GameApi {
  bootstrap(): Promise<GameSnapshot> {
    return http.get<GameSnapshot>('/game/bootstrap');
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
