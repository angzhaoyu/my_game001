# 架构与数据流

## 1. 分层与依赖

```text
Cocos UI (farm/ui, login)
        ↓ 只发语义命令
GameRoot / GameSyncService
        ↓
HttpClient (wx.request / XHR)
        ↓ HTTPS
Flask API adapters
        ↓
AuthService / GameService
        ↓
GameEngine (纯规则) ← server catalog
        ↓
MySQLRepository / transaction
        ↓
MySQL 8
```

后端依赖只能向内：`api -> services -> domain`，`repositories` 实现持久化边界。领域层不 import Flask/PyMySQL。前端 UI 不直接发 HTTP，也不决定价格/奖励。

## 2. 为什么不再“整包保存”

旧流程允许客户端提交 `{gold, inventory, plots}`，任何被修改的客户端都可以上传任意金币；两个慢请求还可能后到的旧数据覆盖先到的新数据。

新流程只接受语义命令，例如：

```json
{
  "commandId": "550e8400-e29b-41d4-a716-446655440000",
  "expectedVersion": 18,
  "type": "buy_item",
  "payload": { "itemId": "seed_wheat", "quantity": 1 }
}
```

后端在事务中锁玩家状态，读取服务端目录，校验价格/金币，更新金币和背包，版本加一，记录命令结果。客户端不能提交价格或最终金币。

## 3. 网络延迟与响应丢失

### 3.1 幂等

客户端在发送前持久化 `commandId`。如果服务端已经提交但响应丢失，重发相同 ID；`processed_commands` 保证不再执行第二次，并返回当前权威快照与原操作确认信息。这样其他设备已继续操作时也不会把客户端回退到旧快照。

### 3.2 串行队列

同一客户端写命令按顺序执行，后一个命令使用前一个响应的新 `stateVersion`。队列最多 50 条，防止长期离线积压无界增长。

### 3.3 乐观并发控制

不同设备同时操作时，后端比较 `expectedVersion`。旧版本返回 `409 VERSION_CONFLICT`；客户端重新 bootstrap，再用同一 `commandId` 重试。若业务前提已不成立（例如物品已在另一台设备卖掉），返回明确业务错误。

### 3.4 重试范围

- GET：可重试；
- 游戏 command POST：有幂等 ID，可重试；
- 普通登录/注册 POST：默认不自动重试，避免没有幂等键的重复副作用；
- 0/408/429/5xx：指数退避；普通 4xx 不重试。

## 4. 时间与离线成长

- 服务端时间是唯一奖励时间；客户端时间只做视觉进度预览。
- bootstrap/command 会按 UTC 和服务端 `last_simulated_at_ms` 推进作物、水分、肥力。
- 单次最多补算 30 天，防止异常旧记录拖垮请求。
- 快照含 `serverTimeMs`；客户端计算时钟偏移，降低设备时钟错误造成的显示偏差。

## 5. 数据一致性

一次游戏命令在同一 MySQL 事务中修改：

- `player_states`（金币/经验/版本）；
- `player_inventory`；
- `farm_plots`；
- `processed_commands`。

`SELECT ... FOR UPDATE` 串行化同一玩家的并发写。跨玩家互不锁定。

## 6. 缓存策略

客户端保存最新服务端快照用于弱网首屏，但缓存是**只读投影**：

- 后端不可达时不开放经济写操作；
- 不把本地模拟结果整包上传；
- 重新联网后以后端快照覆盖展示模型；
- 只有持久化命令队列会重放。

## 7. 扩展建议

当前单体按边界拆分，适合早期上线。增长后可逐步增加：

1. Redis 分布式限流、热点目录缓存和短期锁；
2. 配置中心/后台，将 catalog 发布为有版本的只读快照；
3. Outbox 表 + 消息队列处理日志、任务、排行榜，不要在金币事务里直接调用外部服务；
4. 玩家分片/读写分离，但权威写仍按玩家串行；
5. OpenTelemetry 指标与链路，使用 requestId/commandId 定位问题。
