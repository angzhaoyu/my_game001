# HTTP API v1

Base URL：`https://<domain>/api/v1`。请求/响应 JSON，写游戏接口需 `Authorization: Bearer <accessToken>`。

## 通用响应

成功：

```json
{ "success": true, "requestId": "...", "data": {} }
```

失败：

```json
{
  "success": false,
  "requestId": "...",
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "游戏状态已在其他设备更新，正在重新同步",
    "retryable": true,
    "details": { "currentVersion": 19 }
  }
}
```

客户端反馈问题时应带 `requestId`；写操作还应带 `commandId`。不要记录 token、密码或微信 code。

## 公共与鉴权

### `GET /public/config`

返回登录所需大区及目录版本，不返回完整经济配置。

### `POST /auth/wechat`

```json
{ "code": "wx.login 返回的一次性 code" }
```

后端通过 `jscode2session` 换取 openid，创建/查询玩家，返回短期 access token。禁止客户端提交 openid。

### `POST /auth/password/login`

```json
{ "username": "test", "password": "test12345", "region": "大区一 · 电信" }
```

仅本地联调；生产关闭后返回 404 类业务错误。

### `POST /auth/password/register`

仅本地联调。账号 3-16 位，密码 8-64 位。

## 游戏

### `GET /game/bootstrap`

返回：

- `serverTimeMs`：服务端时间；
- `stateVersion`：并发版本；
- `profile`：金币、等级、经验、体力；
- `inventory`：服务端背包；
- `plots`：24 块地；
- `lastTick`：服务端最后结算时间；
- `catalog`：有版本的物品/商店/作物/土地/天气配置。

### `POST /game/commands`

```json
{
  "commandId": "cmd-unique-for-this-action",
  "expectedVersion": 18,
  "type": "water",
  "payload": { "plotId": 1 }
}
```

`commandId` 8-64 位，只允许字母、数字、`-`、`_`。同一玩家重复 ID 不会再次执行；响应包含当前权威快照和原操作确认信息。

| `type` | payload | 服务端校验 |
|---|---|---|
| `buy_item` | `itemId`, `quantity?` | 在售、价格、金币 |
| `sell_item` | `itemId`, `quantity?` | 目录、持有数量、回收价 |
| `develop_plot` | `plotId` | 等级、状态、金币 |
| `plant` | `plotId`, `cropId` | 解锁、空地、种子 |
| `water` | `plotId` | 已开发、服务端冷却 |
| `fertilize` | `plotId`, `itemId` | 已开发、化肥类型与数量 |
| `harvest` | `plotId` | 服务端结算后确实成熟 |
| `shovel` | `plotId` | 已开发且存在作物；铲除后不返还种子 |

`quantity` 必须为 1-99。成功返回更新后的完整玩家快照（通常不重复 catalog）、`message`、`commandId`。

## 健康检查

- `GET /health/live`：进程存活；
- `GET /health/ready`：MySQL 可用。

## 常见错误

| code | HTTP | 处理 |
|---|---:|---|
| `UNAUTHORIZED` | 401 | 清会话并重新 `wx.login` |
| `VERSION_CONFLICT` | 409 | bootstrap 后以相同 commandId 重试 |
| `INSUFFICIENT_COINS` / `INSUFFICIENT_ITEM` | 400 | 展示业务提示，不重试 |
| `ACTION_TOO_FAST` | 429 | 短暂退避，可重试同 commandId |
| `NETWORK_ERROR`（客户端生成） | 0 | 保留命令，网络恢复后重试 |
| `INTERNAL_ERROR` | 500 | 同 commandId 退避重试并上报 requestId |
