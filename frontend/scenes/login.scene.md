# login 场景契约

```text
Canvas  [挂载 LoginMain.ts]
└─ Camera
```

当前登录 UI 由 `LoginMain` 在运行时创建：

- 微信小游戏环境：启动后调用 `wx.login`，把一次性 code 发送到 `/api/v1/auth/wechat`；
- Cocos/Web 本地预览：显示账号/密码/大区，用于后端联调；生产后端关闭密码接口；
- 成功后只保存短期 access token 与非敏感用户摘要，切换到 `farm` 场景；
- 微信 AppSecret 不得存在该场景、脚本、ext 配置或小游戏包中。

若后续由 UI 同学改成编辑器场景/Prefab，请保持 `LoginMain` 只调用 `core/auth/AuthApi`，不要在 UI 组件中直接使用 `wx.request`。
