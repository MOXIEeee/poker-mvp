# 德州扑克 MVP — 开发方案 spec

> 状态: v1 已上线 ([poker-mvp-liart.vercel.app](https://poker-mvp-liart.vercel.app)) · 持续打磨中
> 最近更新: 2026-07-27
> 范围: 朋友间实时德州扑克 Web 游戏,6 人桌,零成本部署

---

## Problem Statement

**用户的真实痛点**:

和朋友想打德州扑克,但市面产品都有问题:
- 商业平台(WPN / PokerStars / 各种 club)要装客户端、注册、绑卡、邀请码 — **为赌博设计,不是为朋友局设计**
- GitHub 上开源 poker repo **同质化严重**:绝大多数是单机 / 控制台 demo,或者 socket.io 教学项目,没有一个能"几个人开浏览器就开打"的成品
- 移动端体验普遍糟糕,国内/海外朋友混打时延迟差异大

**作者兼 PM 的第二层痛点**(推动技术决策):

- 项目要进作品集 / 求职敲门砖,代码质量、架构清晰度、工程亮点比功能数量重要
- 想上 GitHub 攒 star、吸引贡献者,所以 README/可运行/可演示必须有
- 对 **AI 集成**(荷官 / 解说 / 教练这类)有感觉,这是后续差分化的钩子
- 6 周时间盒

**约束**:

- 全免费层: Vercel + Upstash Redis 免费档 + Pusher 免费档
- 朋友间使用,不需要账号系统、不需要历史战绩、不需要观战
- 移动端必须能玩(iPhone 端一屏能看完一局)

---

## Solution

**一句话**: 用 Next.js 16 + Pusher 实时同步 + Upstash Redis 状态存储 + Vercel 部署,做出"几个人开浏览器就能开打"的多人德州扑克,所有计算在服务端保证筹码守恒,所有 UI 移动/桌面自适应。

**关键能力**:

1. **开一局**: 房主选盲注 / 起始筹码 → 拿到 6 位房间号 → 朋友扫码 / 复制链接加入
2. **打一局**: 实时同步每个玩家行动(fold / check / call / raise / allin),服务端保证规则正确
3. **看结果**: 摊牌后展示赢家 + 牌型,支持玩家选择亮牌 / 弃牌
4. **断线续玩**: 心跳 + 重连,网络抖动不丢状态
5. **手机玩**: 列表式牌桌,所有功能一屏可达
6. **PM 自查**: 18 个埋点事件 + 实时 dashboard,看漏斗 / 操作分布 / 健康度

---

## User Stories

### 旅程: 从开房间到打完一局

1. As a 房主, I want to 创建房间时配置盲注和起始筹码, so that 我能按朋友偏好开局(10/20 经典 vs 50/100 紧张)
2. As a 房主, I want to 拿到一个简短房间号(6 位), so that 朋友能快速加入不用复制完整 URL
3. As a 玩家, I want to 浏览器打开链接就能加入, so that 不用装任何 app
4. As a 玩家, I want to 输入昵称就能坐下, so that 不用注册账号
5. As a 房主, I want to 看到 4/4 时开始一局, so that 凑够人再打
6. As a 玩家, I want to 翻前轮到自己时高亮提示, so that 不会忘记行动
7. As a 玩家, I want to 点 fold / check / call / raise / allin 按钮, so that 操作明确不犹豫
8. As a 玩家, I want to 看到公共牌逐步发出(flop / turn / river), so that 有打牌的真实感
9. As a 玩家, I want to 摊牌后看到赢家牌型, so that 知道为什么赢 / 输
10. As a 玩家, I want to 选择亮牌 / 弃牌(纯展示), so that 输了不丢面子
11. As a 玩家, I want to 100 手后筹码总数不变, so that 平台是公平的不是抽水的

### 旅程: 网络 / 设备边界

12. As a 玩家, I want to 4G 切 WiFi 不掉线, so that 移动时不会断
13. As a 玩家, I want to 关闭浏览器再打开能恢复, so that 误关不会丢局
14. As a 玩家, I want to iPhone Safari 一屏能看完自己的牌, so that 不需要横向滚动
15. As a 玩家, I want to 聊天不被手牌挡住, so that 互动 + 打牌两不误
16. As a 玩家, I want to 别人的聊天不会因为延迟堆积, so that 看到的是实时对话

### 旅程: 多人 / 极端场景

17. As a 玩家, I want to 有人 all-in 后立即结算他的份额, so that 不用等所有人
18. As a 玩家, I want to 0 筹码玩家(已 all-in 输完)不再卡行动, so that 牌局继续
19. As a 玩家, I want to 边池(主池 + 多个侧池)正确分配, so that 多 all-in 时钱不会算错
20. As a 玩家, I want to 弃牌的玩家的盲注也算入主池, so that 死钱不会凭空消失
21. As a 玩家, I want to 房主离开后房间继续, so that 不会因为一个人断线全桌散

### 旅程: PM 视角

22. As a PM, I want to dashboard 看到漏斗每步转化率, so that 知道哪个环节掉人
23. As a PM, I want to 看到玩家操作分布(fold / call / raise 占比), so that 判断游戏节奏
24. As a PM, I want to 看到房间配置偏好分布, so that 调默认配置
25. As a PM, I want to 看到 Pusher 断连和 API 错误率, so that 第一时间发现线上问题
26. As a PM, I want to 看到平均局时长和手数, so that 衡量游戏深度

---

## Implementation Decisions

### 1. 实时同步: Pusher 优先 + 轮询 fallback

- **seam**: `lib/pusher-server.ts` 的 `notifyRoom()`, `lib/pusher-client.ts` 的 `getRoomChannel()`
- **决策**: Pusher 不可用时(缺 env vars / 服务挂)自动降级为 1.5s 轮询,客户端不感知
- **影响**: 本地开发无需 Pusher 凭据也能跑完整流程

### 2. 状态存储: Upstash Redis (REST) + 内存 Map (本地 dev)

- **seam**: `lib/game.ts` 的 `kvGetRoom` / `kvSetRoom`
- **决策**: `IS_REDIS` 标志位自动切换;生产绝对不能 fallback 到内存(否则多实例就完蛋)
- **影响**: 本地开发零配置启动,生产自动用 Redis

### 3. 边池算法: 死钱归主池 + chips=0 隐式 all-in

- **seam**: `lib/game.ts` 的 `calculateSidePots`, `playersNeedAction`
- **决策**:
  - folded 玩家的钱 = "死钱",合并到 main pot,eligible = 所有 active 玩家
  - `playersNeedAction` 过滤 `chips > 0`,0 筹码 = 隐式 all-in
  - raise 严格校验 `raiseDiff > 0 && raiseDiff >= minRaise`
- **影响**: 100 手长局测试(2-6 玩家)chip 守恒,边池单测 41/41 通过

### 4. 牌型评估: 7 选 5 穷举

- **seam**: `lib/hand.ts` 的 `evaluateHand(sevenCards)`
- **决策**: 不优化,21 种组合 × 5 张选法 = 21 选法直接排,代码 < 100 行
- **影响**: 简单可读,出 bug 容易修,7 张牌评估 < 1ms

### 5. Show/Muck: cosmetic toggle, 不阻塞结算

- **seam**: `app/api/rooms/[id]/decide/route.ts`, `toggleReveal` in `game.ts`
- **决策**:
  - showdown() 立即结算(赢家拿钱)
  - 玩家后续可以自由 toggle 亮牌 / 弃牌(纯展示)
  - 不再有阻塞的 showdown_reveal 阶段
- **影响**: 牌局结束立刻进入下一手,不被"等你选"卡住

### 6. 移动端: 列表式牌桌 + 浮动聊天

- **seam**: `app/room/[id]/page.tsx` 的 `MobilePlayerCard` / `MyHandMobile` / 桌面 `PokerTable`
- **决策**:
  - 桌面(≥768px) = 椭圆牌桌;手机(<768px) = 垂直列表
  - 聊天默认关闭(右上浮动按钮触发 slide-up modal),避免挡手牌
  - viewport meta 禁止缩放,iPhone 端一屏能看完
- **影响**: iPhone 12 截图测试通过,所有功能可达

### 7. 埋点架构: 客户端 SDK + 服务端 track + Upstash list

- **seam**:
  - `lib/analytics-client.ts`: 客户端 SDK(批量 / 失败熔断 / 离线缓存)
  - `lib/analytics-server.ts`: 服务端写入(`track()`)
  - `app/api/events/route.ts`: 接收端点
  - `app/api/debug/events/route.ts`: 查询 + 聚合
  - `app/debug/dashboard/page.tsx`: 可视化
- **决策**:
  - 18 个事件分类:漏斗(5)/ 行为(4)/ 健康(5)/ 留存(4)
  - 客户端 5 条 / 5s 批量 flush,失败 3 次熔断 30s
  - localStorage 离线缓存,pagehide 前强 flush
  - 服务端 track() 全包 try/catch,失败静默
  - 写 Upstash list 按天分 key,15 天 TTL 自动过期
- **影响**: PM 打开 `/debug/dashboard` 看到漏斗 / 操作分布 / 房间配置 / 健康度 / 留存

### 8. 跨天数据查询 bug fix

- **seam**: `lib/analytics-server.ts` 的 `queryEvents`
- **决策**: keys 拉「今天 + startMs 那一天」,不是只拉 startMs 那一天
- **影响**: 修了一个"明明有数据但 metrics 返回 0"的隐藏 bug

### 9. 部署流水线: Vercel 自动 build

- **seam**: 仓库根 `package.json`, Vercel project
- **决策**:
  - git push main → Vercel 自动 build + 部署
  - **部署前必须本地 `npm run build` 通过**(TS 严格模式)
  - Vercel env vars: Pusher 4 个 + Upstash 2 个
- **影响**: 1-2 分钟 CI,失败时 fallback 到上一个能 build 的 commit

### 10. 代码质量闸: TypeScript 严格模式 + 多层测试

- **seam**: `tsconfig.json` 的 `strict: true`
- **决策**:
  - TS 严格模式(显式 null check,禁止空字符串索引)
  - 单元测试:边池 41/41,牌型评估,action order
  - 集成测试:100 手长局,all-in 立即结算,showdown 不阻塞
  - E2E:多玩家模拟,断线重连
- **影响**: 4 个 chip-leak bug 在测试期被全部捕获,production 0 已知守恒问题

---

## Testing Decisions

### 测试金字塔

```
        E2E (test-prod / test-reconnect-e2e)
       /                                     \
      /  集成 (test-long-game 100 手)         \
     /  单元 (test-sidepot 41 / test-hand)     \
```

### 已有的测试 seam(优先复用,不新造)

| 测试文件 | 测什么 | seam |
|---|---|---|
| `test-sidepot.mjs` | 8 场景 41 断言(主池/边池/死钱/0 筹码) | `calculateSidePots` 纯函数 |
| `test-hand.mjs` | 10 种牌型 + 边界(7 选 5 穷举正确) | `evaluateHand` 纯函数 |
| `test-long-game.mjs` | 2-6 玩家 × 20 手 chip 守恒 | `processAction` 端到端 |
| `test-allin-settle.mjs` | all-in 立即结算,不等所有人 | `processAction` 端到端 |
| `test-action-order.mjs` | 2-6 玩家行动顺序正确 | `startNewHand` + `processAction` |
| `test-reconnect-e2e.mjs` | 断线重连恢复状态 | `reconnectPlayer` + `updateHeartbeat` |
| `test-prod.mjs` | 生产环境 e2e 烟测 | 整个 API 链 |

### 写新测试的原则

- **只测外部行为,不测实现细节**:测试 `processAction` 输入输出,不测它内部怎么算
- **用现有 seam,不开新洞**:不写新的 test runner,不引入 jest/vitest,保持 `node --test` + `tsx` 就够
- **chip 守恒是黄金标准**:任何 action 路径(尤其边池)必须过 100 手守恒

---

## Out of Scope(明确不做)

| 类别 | 内容 | 理由 |
|---|---|---|
| 账号 | 注册 / 登录 / 头像 | 朋友局不需要,加账号反而增加摩擦 |
| 历史 | 战绩 / 复盘 / 排行榜 | MVP 阶段过度设计,等真实数据再决定 |
| 观战 | 旁观者 | 加带宽 + 复杂度,但 v1 没需求 |
| 货币化 | 充值 / 抽水 | 朋友局,直接违反初衷 |
| 跨平台 | 微信小程序 / App | 浏览器 + PWA 已覆盖;native 是另一个工程量级 |
| 防作弊 | 牌局回放 / IP 验证 | 朋友间没有这个问题;MVP 阶段加无意义 |
| 国际化 | 多语言切换 | 朋友间用中文/英文自由切换,i18n 框架是负担 |
| AI 集成 | 荷官 / 解说 / 教练 | **第二阶段差分化**,基础 MVP 跑通再加 |

---

## Further Notes

### 已知限制

- **6 人上限**: `maxPlayers: 2-6` 硬编码,7+ 没测过
- **断线超时**: heartbeat 30 秒未更新会被踢,房主离开房间会"无主"但状态保留
- **Pusher 免费档限制**: 200k 消息/天,200 并发连接 — 朋友局完全够,产品上线前可能要升级
- **Upstash 免费档限制**: 10k 命令/天,256MB — 朋友局够,生产化要看数据量

### 后续候选(等真实数据决定)

- [ ] **观战模式**: 朋友间有人想看别人打,加 read-only 视图
- [ ] **断线超时回收**: 房主断线 5 分钟自动转给下一位在场玩家
- [ ] **CSV 导出**: dashboard 数据导出给分析
- [ ] **告警 webhook**: 失败率 > 5% / Pusher 断连 > 3 → 飞书通知
- [ ] **AI 荷官 / 解说**: 接入 LLM 讲解每手牌 + 关键决策(差分化钩子)
- [ ] **PWA / 离线**: 提升"添加到主屏"体验,断网时本地缓存最后一手

### 关键文件

- 游戏引擎: `lib/game.ts` (23KB,核心)
- 牌型评估: `lib/hand.ts` (5.6KB,纯函数)
- 房间页: `app/room/[id]/page.tsx` (32KB,客户端)
- Dashboard: `app/debug/dashboard/page.tsx` (20KB,客户端)
- 埋点 SDK: `lib/analytics-client.ts` (4.6KB,客户端)
- 埋点服务: `lib/analytics-server.ts` (12.4KB,服务端)

### 部署信息

- **生产 URL**: https://poker-mvp-liart.vercel.app
- **Dashboard**: https://poker-mvp-liart.vercel.app/debug/dashboard
- **代码仓库**: github.com/MOXIEeee/poker-mvp
- **自动部署**: git push main → Vercel 自动 build(1-2 分钟)
- **环境变量**: Vercel dashboard 配(Pusher 4 个 + Upstash 2 个)

### 下次开工 checklist

- [ ] 本地 `npm run build` 通过(部署前必跑)
- [ ] 边池单测 41/41 + 长局 100 手守恒
- [ ] Vercel dashboard 部署状态确认
- [ ] 浏览器实测移动端 / 桌面端

---

*Spec 维护人: Mavis · 自动从对话历史 + 代码状态生成*
*下一步: 拉几个朋友真实打几局,看 dashboard 真实数据,再决定是否进入第二阶段(AI 集成)*
