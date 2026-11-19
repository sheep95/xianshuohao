# API 文档 · 阶段 2

后端默认地址 `http://127.0.0.1:8000`，交互文档 `/docs`，完整结构 `/openapi.json`。前端 `http://127.0.0.1:3000/api/...` 转发到同一个后端。请在整个操作期间使用同一个域名，不混用 localhost 与 127.0.0.1，否则浏览器 Cookie 不通用。

## 认证、并发与错误

- 无需注册。首次创建或加入时写入 HttpOnly Cookie，数据库只保存凭证摘要。不要从前端读取或手动伪造 Cookie。
- 所有 POST 请求填写 `X-CSRF-Protection: 1`。浏览器使用同域请求，跨域调试需 `credentials: include`。
- 生成、确认换条和定稿必须提供 `Idempotency-Key`：8–80 位字母、数字、下划线或连字符。每次新操作换新编号；失败重试复用原请求体和原编号。
- 同编号同请求不会重复执行，并返回房间当前状态；同编号不同请求返回 409。创建房间没有幂等协议，前端需禁止连点并避免自动重试创建。
- 生成和定稿携带 `expected_revision`；认领和替换携带 `expected_version`。409 表示需要刷新或确认，不应无限自动重试。
- 业务错误：`{"detail":{"code":"stale_rule","message":"条文已更换，请阅读新版本后再操作"}}`。请求结构错误为 FastAPI 标准 422 错误数组。
- 常见状态：403 权限/来源/CSRF；404 房间或规则不存在；409 状态或版本冲突；422 输入不合格；429 限流（Retry-After: 60）；503 数据库暂不可用。错误响应不包含数据库凭证。

## 接口表

| 方法 / 路径 | 权限与效果 |
| --- | --- |
| GET /health | 服务存活，返回 status=ok、stage=6；不实时检测数据库或模型 |
| GET /api/rule-library | 公开；行为选项、场景默认项，不包含内部 real_friction |
| GET /api/examples | 公开；9 套静态示例，与前端生成数据同源 |
| POST /api/rooms | 创建房间及创建者身份，返回 201 |
| GET /api/rooms/{code} | 公开；非成员不返回认领昵称，定稿后包含 snapshot |
| POST /api/rooms/{code}/join | 匿名加入；同一身份重复加入不增加人数；定稿后不接受新成员 |
| POST /api/rooms/{code}/generate | 仅创建者；模型约束改写或模板回退生成 5 条；同房间只生成一次 |
| POST /api/rules/{id}/claim | 本房间成员；认领当前版本，重复认领不重复计数 |
| POST /api/rules/{id}/swap | 成员可预览；已认领条目只有创建者可确认替换 |
| POST /api/rooms/{code}/finalize | 仅创建者；5 条均有人认领后生成不可变快照 |

## 创建与加入

`POST /api/rooms`：

```json
{
  "space_type": "shared_home",
  "group_name": "四楼小屋",
  "nickname": "同住同伴",
  "selections": [
    {"friction_key": "night_sound", "level_id": "quiet_2300"}
  ]
}
```

space_type 可选 shared_home / short_stay / club_room，分别对应一周 / 三天 / 一学期（120 天）。group_name 默认“临时空间”，nickname 可省略并自动生成。名称去除首尾空格，拒绝控制字符和 HTML 尖括号。

selections 为 0–5 个不同摩擦，各选择一个适用水位；缺少的项目由场景默认值补齐。选择项可带 `custom_execution_hint`（最多 60 字的单行文字；留空使用默认退路）。响应中的 `execution_hint` 是最终采用的退路。自定义退路不传给模型，定稿时随条文保存。只换说法时保留退路，更改行为水位时使用新水位的默认退路，并在确认前展示。

响应包括 code、status=setup、revision=1、viewer（当前匿名成员及 is_owner）、participant_count、selections、rules=[]、snapshot=null。房间码为随机 10 位字符，不是管理密码。

`POST /api/rooms/{code}/join` 请求为 `{"nickname":"同行同伴"}` 或 `{}`。同名不会共享身份。最多 50 位成员，同一身份可加入多个房间。

## 生成、认领与替换

`POST /api/rooms/{code}/generate`，附 Idempotency-Key：

```json
{"expected_revision": 1, "confirm_suggestions": true}
```

有补充建议时必须确认。成功后 status=draft，rules 含 5 条，source 为 template 或 llm，version=1，status=pending。配置完整后整份五条只发一次模型请求，总预算 3 秒，无自动重试。模型仅可改写幽默标题，正文 action 与 execution_hint 必须与确认水位逐字相等。结构错误或请求失败整份回退，单条非法只回退该条，响应仍为成功保存的五条草案。未配置 key/model 时不联网。

权限、状态、版本、建议确认和幂等检查均在模型调用前进行。成功回执（含回退草案）的相同请求重试只读取已存房间，不再次调用模型；并发请求沿用事务锁串行处理。换条始终使用模板并将该条 source 改为 template。内部 real_friction 不存入条文，不返回前端；原始提供商错误、密钥和请求详情不返回客户端。3 秒是模型预算，不含数据库锁等待、服务冷启动与用户网络。

`POST /api/rules/{id}/claim`：

```json
{"expected_version": 1}
```

成功返回整个最新 RoomView，对应规则变为 claimed。claim_count 是该条认领人数；participant_count 是实际匿名成员数，两者不可混用。一个人可以认领全部规则。成员看到 claims 昵称列表，非成员只看到数量。“已通过”表示有人愿意执行，不代表所有人一致同意。

`POST /api/rules/{id}/swap` 先预览：

```json
{"expected_version": 1, "mode": "preview"}
```

默认只换幽默表达，保留动作。可额外传当前摩擦的 target_level_id 来预览不同水位；服务不会自行把水位当作“更轻”而切换。响应提供 old_action、new_action、boundary_changed、claims_to_clear、requires_owner 和候选 text / execution_hint，预览不改数据库状态。

确认应用时携带新的 Idempotency-Key：

```json
{"expected_version": 1, "expected_claim_count": 0, "mode": "apply", "confirmed": true}
```

如果预览指定了 target_level_id，确认时须携带相同值。替换后 version 增加，状态为 debating，原认领清空；已有人认领时需要创建者权限。旧版本的认领或替换返回 409。

阶段 2.6 前端同时发送预览的 `claims_to_clear` 为 `expected_claim_count`。服务端在原有房间事务锁内检查人数，变化则返回 409 `claims_changed`，不清空任何认领；用户必须重新预览和确认。字段可省略以兼容旧调用方，新的网页始终发送。网络错误重试保留同一幂等编号；重新预览后若人数变化，使用新的编号。

## 定稿与公开读取

`POST /api/rooms/{code}/finalize` 携带 Idempotency-Key：

```json
{"expected_revision": 7}
```

revision 必须使用最新响应值，示例数字不是固定值。要求 5 条规则的当前版本均有人认领。成功返回 status=finalized 和 snapshot，包含空间、群名、时长、参与人数、5 条文与接口、宣誓句、生效时间和到期时间。通过日期使用北京时间，时间戳以 UTC 表示。

定稿后不接受认领、换条或新成员加入。再次使用同一个定稿编号和原请求体是安全重试；不重新计时。公开 GET 可读取原 snapshot，昵称不进入快照。最终网页卡片、图片导出和分享交互在阶段 5 实现。

## 五步手动验收

1. 打开 `/docs`，展开 POST /api/rooms → Try it out，填写 X-CSRF-Protection 为 1，用上面的创建示例执行，记下 code。
2. 展开 generate，填 code、X-CSRF-Protection=1、Idempotency-Key=demo-generate-01 和最新 revision，确认补充建议，看到 5 条 rules。
3. 对每条 rule.id 执行 claim，填写 expected_version=1。每次会返回最新房间，记下最后一次 revision。
4. 执行 finalize，填写该 revision 和新编号 demo-finalize-01，看到 finalized 与 snapshot。
5. 在无痕窗口调用 GET /api/rooms/{code}，看到相同快照且不含认领昵称。

也可运行项目根目录的 `backend/.venv/Scripts/python.exe scripts/smoke_api.py` 自动验收。脚本会创建一个明确标注的持久化示例房间，输出房间接口链接与最终卡路径；配置模型后会在生成环节发起一次真实模型请求。
