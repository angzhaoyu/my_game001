# 微信小游戏上线清单

代码已经具备上线所需的主要边界，但**不能在未配置真实 AppID、HTTPS 域名、证书和生产基础设施时直接发布**。

## 1. 微信平台

- [ ] 在微信公众平台注册小游戏并取得 AppID；
- [ ] 服务端密钥管理中配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`；
- [ ] 将 API HTTPS 域名加入“开发管理 → 开发设置 → 服务器域名 → request 合法域名”；
- [ ] 域名完成所需备案，证书链完整、TLS 1.2+；
- [ ] Cocos 构建配置/ext 配置注入 `https://.../api/v1`，代码和资源中不存在 localhost；
- [ ] 不把 AppSecret、数据库密码、生产 token 打入小游戏包；
- [ ] 设置横屏、包体分包、隐私指引、用户协议、类目与版号/备案等合规项；
- [ ] 检查头像昵称等隐私 API 是否按微信最新规范授权（当前登录不请求头像昵称）。

## 2. 服务端

生产变量至少：

```text
APP_ENV=production
APP_SECRET=<32位以上随机值，由密钥服务注入>
DB_HOST=...
DB_USER=<低权限应用账号>
DB_PASSWORD=<密钥服务注入>
DB_NAME=game_db
WECHAT_APP_ID=...
WECHAT_APP_SECRET=<密钥服务注入>
ENABLE_PASSWORD_AUTH=false
ALLOW_DEMO_SEED=false
ALLOWED_ORIGINS=<如还发布Web版，填精确域名；否则可空>
```

- [ ] 独立任务执行 `python -m app.manage migrate`，成功后再滚动 API；
- [ ] Gunicorn/容器至少两个实例，网关负责 HTTPS、连接上限和超时；
- [ ] 网关对登录、bootstrap、command 分别限流；多实例限流状态放 Redis/网关；
- [ ] MySQL UTC、自动备份、恢复演练、磁盘/连接数/慢查询告警；
- [ ] 每日执行 `python -m app.manage prune-commands --retention-days 7`，清理前确认客户端队列保留策略；
- [ ] 日志脱敏，采集 5xx、p95/p99 延迟、微信登录错误率、版本冲突率、队列积压；
- [ ] `/health/live` 与 `/health/ready` 分别接存活/就绪探针；
- [ ] 灰度发布，保留上一镜像；数据库迁移遵循“先兼容扩展、后删除旧字段”。

## 3. Cocos/客户端

- [ ] 在真实 Cocos Creator 3.8.x 工程完成脚本编译和场景引用；
- [ ] 所有关键节点用编辑器属性绑定，核对 `farm.scene.md` 节点名；
- [ ] 资源路径、大小写和 `.meta` 在 Windows/macOS/CI 一致；
- [ ] `npm run typecheck:core` 通过；
- [ ] 微信开发者工具执行代码质量、包体、性能与真机调试；
- [ ] 冷启动无缓存、旧缓存、token 过期、账号首次创建均可进入游戏；
- [ ] API 错误只显示安全消息，可在客服入口复制 requestId（后续 UI 可补）。

## 4. 弱网/并发验收

使用微信开发者工具网络模拟和真实手机至少验证：

1. 200ms、1s、5s 延迟下连续购买，金币不重复扣；
2. 服务端成功后主动丢弃响应，恢复后相同 commandId 只生效一次；
3. 请求发送前断网，命令保留，重启小游戏后继续；
4. 有待同步命令时禁止继续产生有依赖的新经济操作；
5. 两台设备同时购买/收获，一台触发版本冲突后能刷新，不能双收获；
6. 切后台数小时后以服务端时间结算，修改手机时间不能加速；
7. 401 自动回登录，429/5xx 退避，不出现重试风暴；
8. API 整体不可用时显示只读缓存，不用本地数据覆盖云端。

## 5. 发布与回滚

推荐顺序：备份 → 向后兼容迁移 → 部署 API → 冒烟 → 上传小游戏体验版 → 灰度 → 全量。回滚 API 时必须确认旧版本能读取新 schema；破坏性迁移另一个版本再执行。
