# 日常桌面使用与整理习惯问卷

现有项目已改为 **Next.js + OpenNext + Cloudflare Workers + D1**。问卷、管理员后台、计分和 PNG 图表导出保留。当前已完成本地验证与 GitHub 源码上传，线上 D1 已创建并完成初始建表；Worker 尚未部署。

## 1. 首次本地运行

需要 Node.js 22.12 以上（本机使用 Node.js 24）及 npm。命令均在项目根目录执行。

```powershell
npm ci
npm run setup:local
npm run db:migrate:local
npm run build:worker
npm run preview
```

打开 [问卷](http://localhost:3000) 或 [管理员后台](http://localhost:3000/admin)。固定使用 localhost，与 APP_ORIGIN 一致。

- `setup:local` 为本机生成随机管理员密码、scrypt 密码摘要和随机会话密钥，不会覆盖已有配置。登录信息在 `LOCAL-ADMIN.txt`，服务端配置在 `.dev.vars`。两者均已加入 Git 忽略列表。
- `db:migrate:local` 明确使用 `--local`，将 `migrations/0001_initial.sql` 应用于本机 D1。
- `build:worker` 生成 `.open-next/`，`preview` 使用实际 workerd 运行包和本地 D1；不需要登录 Cloudflare。
- 常规本地数据保存在 `.wrangler/state/`，关闭并重启预览不会清空。请勿把这个文件夹提交 GitHub或当作云数据库备份。
- 源码改动后，重新构建再预览。快速开发可用 `npm run dev`，它通过 OpenNext 绑定同一本地 D1；最终兼容性检查以 Workers 预览为准。
- 开发服务和 Workers 预览共用 3000 端口，不要同时启动。Ctrl+C 停止服务。
- 自托管中文字体和问卷原照片已打包，无须原 Word 文件或在线字体服务。

## 2. 数据保存与访问

浏览器提交 → Worker 校验和计分 → D1 保存 → 确认成功后才展示感谢页。

D1 是数据库；GitHub 只保存程序源码。项目通过名为 `DB` 的服务端 binding 访问 D1，不需要把数据库密码或数据库接口暴露给浏览器。没有 Supabase 依赖，也不需要 Supabase 账号。

| 表                     | 保存内容                                                                |
| ---------------------- | ----------------------------------------------------------------------- |
| `survey_responses`     | 随机答卷 ID、UTC 时间、问卷版本、原始回答 JSON、计分 JSON、提交凭证摘要 |
| `admin_sessions`       | 管理员会话令牌摘要、凭证版本和过期时间                                  |
| `admin_login_attempts` | 管理员登录尝试时间窗口及次数                                            |

匿名问卷不记录 IP、姓名或浏览器指纹。公开接口只能提交答卷，后台读取都校验管理员会话。D1 没有本项目对外开放的直接查询接口。

同一提交凭证使用唯一约束和 D1 事务批次去重，网络重试及并发提交只保留首次成功结果。后续重试不会覆盖答案。服务器重新计算分数，不相信浏览器传来的分类。数据库未确认成功时返回错误并保留草稿。

后台按固定序号上界、每页 500 条读取答卷，避免并发新提交造成漏行或重复。当前后台汇总适合毕业设计规模；大型长期调查应进一步改成数据库聚合与分页。

## 3. 管理员与密钥

目前是单研究者账号，没有公开注册、找回邮件或多人账号管理。

- 本机邮箱和随机密码见 `LOCAL-ADMIN.txt`。密码本身只留在这份本地说明中，服务端使用独立随机盐的 scrypt 摘要验证。
- 会话有效期 8 小时。Cookie 为 HttpOnly、SameSite=Strict，APP_ORIGIN 使用 HTTPS 时启用 Secure。
- 退出登录会删除 D1 中对应会话，因此旧 Cookie 无法继续访问。
- 修改邮箱、密码摘要或 SESSION_SECRET 会使原会话失效。
- 每个 15 分钟固定窗口，整个管理员入口最多尝试登录 10 次，包含正确和错误尝试；超限返回 429，等待下一个窗口。计数存在 D1，重启服务不能绕过。

| 配置                         | 本地位置                                   | 正式上线时                          |
| ---------------------------- | ------------------------------------------ | ----------------------------------- |
| `DB`                         | wrangler.jsonc 的本地绑定                  | 已填写账户内真实 D1 数据库 ID       |
| `APP_ORIGIN`                 | wrangler.jsonc，默认 http://localhost:3000 | 改成实际 HTTPS 来源，不带路径       |
| `INTERVIEW_REGISTRATION_URL` | wrangler.jsonc，可留空                     | 独立、自愿登记表的 HTTPS 链接       |
| `ADMIN_EMAIL`                | .dev.vars                                  | Worker 服务端配置或 Secret          |
| `ADMIN_PASSWORD_HASH`        | .dev.vars                                  | Worker Secret                       |
| `SESSION_SECRET`             | .dev.vars                                  | Worker Secret；随机生成至少 32 字节 |

SESSION_SECRET 是给会话令牌计算摘要的服务端密钥，和管理员登录密码用途不同。不能添加 NEXT_PUBLIC_ 前缀，也不能写入网页、GitHub 文件或截图。当前本地密钥仅供本机验证，正式上线应重新生成。

线上 D1 数据库 `desktop-order-survey` 已在 APAC 区域创建，`0001_initial.sql` 已应用到远程数据库。`wrangler.jsonc` 已填入真实数据库 ID，并以 `preview_database_id` 保留原有本地测试库、以 `remote: false` 保持本地开发隔离。远程答卷表目前为空，尚未部署 Worker。

## 4. 本地验证

```powershell
npm run typecheck
npm test
npm run build:worker
npm run test:e2e:worker
```

首次浏览器测试可安装 Chromium：`npx playwright install chromium`。本机已安装 Edge 时：

```powershell
$env:PLAYWRIGHT_EXECUTABLE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:e2e:worker
```

- `npm test`：单元、接口和真实本地 D1 集成测试；D1 不再因缺少云凭证而跳过。
- `test:integration`：只执行 D1 集成测试，包括事务去重、磁盘持久化、505 条分页、权限、过期/撤销会话和真实数据读取。
- `test:e2e:worker`：启动实际 Worker 包，使用新的隔离数据库执行桌面和手机测试。测试服务会自动停止；3000 端口须空闲。
- 原有 UI 测试使用网络替身验证交互和 PNG；新增 `e2e/worker.spec.ts` 通过真实浏览器逐题作答、提交、登录并读取真实本地 D1 数据。
- 自动化测试数据在 `.local-tests/` 独立目录，不会写入正常预览的 `.wrangler/state/`。测试目录和截图均不会上传 GitHub。
- 涉及真实本地密码的浏览器测试关闭 trace，避免密码进入可分享追踪文件。
- 本地测试不等同于云端额度、域名、绑定和生产网络验收；正式发布后仍需现场检查。

也可以执行 `npm exec -- wrangler deploy --dry-run --outdir artifacts/worker-bundle` 检查打包大小。该命令有 **--dry-run**，不会上传或部署；请不要删除这个参数。

## 5. 问卷与统计

- 共 42 题：A01—A05、B01—B30、C01—C06、D01。内容来自两份提供的 Word 文件；提取的文本存于 `docs/` 便于核对。
- 前 41 题需作答才能前进；原问卷 D01 标注“选答”，可空白提交。页面无跳过按钮。B 类题可选 X 表示无法判断。单选约 400ms 自动跳题；“其他”输入与多选手动确认。最后 D01 不自动提交。
- A05 的 F 排他；C02 最多 3 项；C03 仅限 C02 已选选项，回改时清空失效的 C03 回答。服务端再次验证这些条件。
- 同标签页的未提交草稿保存在 `sessionStorage`；这只是草稿，不是数据库。刷新后从第一题进入核对，已有答案保留。成功提交才清除草稿。关闭标签页通常会清除草稿。
- 每次填写生成随机 UUIDv4 凭证，D1 唯一约束及事务 保证相同凭证并发/重试只产生一条答卷。首次成功保存的答案不可被后续重试覆盖；不要清除凭证后重复提交同一份调查。
- 仅 B 题的 1—5 计分，X 与未作答都不作 0 分。均分用未舍入值比较，前端舍入仅用于显示。
- 前四维度：至少 4 道有效题，均分 ≥3.6 且至少 3 道高分（4或5）。
- 动态容错：至少 5 道有效题，两个子方面各至少 2 道有效题；总均分 ≥3.6，每组均分 ≥3.5 且每组至少 2 道高分。
- 低关注：至少 3 道有效题，均分 ≥4.0 且至少 3 道高分；独立判断，不和主要五类直接比较分数。
- 最高分并列标记“并列待复核”，保留全部并列候选；这些候选不强行计入确定的主导或伴随类别。其余已达标类别可保留伴随。
- 资料不足维度的 `evident` 是 null，不能当作 false。可保留已答题均分供复核，但不进入该维度的明显倾向判定或平均分分布。存在不足维度时其他分类标记暂定。
- 倾向主导、明显、伴随占比：该项人数 / **该维度达到最低有效作答标准的人数**。各维度分母可能不同，六类主导占比不要求合计100%；图表与表格标明 n。
- “主导不明确”“含资料不足”“并列待复核”以所有成功提交人数为参照，状态可重叠。
- 时间存储为 UTC，后台按北京时间展示。只有聚合时间分布转为北京时间自然日。

## 6. 导出与使用

管理员后台显示数据总览、秩序倾向分析和 C 题目分析。C01—C06 逐题显示各选项人数及占有效作答人数的百分比；多选题各比例可能合计超过 100%。后台不再显示最新提交、资料状态与复核板块，也不向浏览器返回逐条答卷或自由填写内容。D1 仍保存提交记录供汇总计算。

- PNG：六类人数分布图、占比图、各维度均分分布、C 题选项统计和完整总览均可导出。“可视化图表”模式中，主导、明显和伴随倾向合并为分组点图；六种主导倾向占比、C02、C06 用双点对照图呈现选择与未选择；C03 使用横向棒棒糖图；均分分布及 C01、C04、C05 显示饼图。饼图采用“海盐薄荷”六色方案（#5F8E8E、#80B0AE、#A4D0C8、#C0E0DD、#D5E9E8、#E7F1F1），由深到浅；网页和 PNG 均无饼图描边。导出 PNG 与当前图表形式一致；Canvas 宽度 2400 物理像素（2 倍），含标题、人数、比例、分母和数据快照时间。
- PNG 来源是当前经过管理员接口取得的真实数据快照；如有新增回答，先刷新再导出。
- 不带个人信息的空数据库会显示0，生产代码没有演示答卷。大量长期数据的完整时间分布可能超过浏览器 Canvas 尺寸上限，届时使用独立图表导出；不截断图片内容。

## 7. 后续上线（Worker 尚未部署）

经用户确认后，后续需关联 Cloudflare Workers 与 GitHub 仓库、设置 Secrets 和 HTTPS 来源，然后验收发布地址。当前源码不能作为纯静态站点发布，因为保存、权限和数据读取都需要 Worker。

当前保留 Next.js，使用 OpenNext 适配 Workers；所有统计接口不缓存。没有使用 R2 缓存或外部数据库。此项目也没有把原先 Supabase 的线上历史数据自动导入 D1；当前未连接任何 Supabase 线上项目。

正式选择套餐前，需要检查 [Cloudflare Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)：免费版每次请求 CPU 额度为 10ms（2026-10-24 查阅）。密码安全校验和 Next.js 服务端渲染可能超过这一额度，因此本地验证不能保证完整功能在免费套餐内稳定运行。下一步上线时应实测 CPU 并决定是否需要 Workers Paid，不能仅凭答卷数量估算。当前未购买套餐或产生云端部署。

本地源码根目录是当前版本。上级目录原有 `desktop-order-survey.zip` 是迁移前归档，不包含本次 D1 改动。`.gitignore` 排除了本地管理员凭据、数据库状态、依赖和构建产物。

参考：[OpenNext Cloudflare](https://opennext.js.org/cloudflare/get-started)、[D1 本地开发](https://developers.cloudflare.com/d1/best-practices/local-development/)。
