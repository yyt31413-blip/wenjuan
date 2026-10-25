# 日常桌面使用与整理习惯问卷

问卷前端采用 React + Vite，接口采用 Cloudflare Pages Functions，数据写入既有的 Cloudflare D1 数据库。管理员后台提供汇总统计和 PNG 图表导出。答卷和管理员密钥均不进入 GitHub 仓库。

## 本地运行

需要 Node.js 22.12 以上。安装依赖后依次执行 npm run setup:local、npm run db:migrate:local、npm run build、npm run preview。问卷地址为 http://localhost:3000/，后台地址为 http://localhost:3000/admin。本地管理员信息在 LOCAL-ADMIN.txt，服务端设置在 .dev.vars；两者均被 Git 忽略。本地 D1 与云端 D1 隔离。

## Cloudflare Pages 自动部署

使用 Git 集成创建新 Pages 项目，连接 yyt31413-blip/wenjuan 的 main 分支。仓库根目录 /，构建命令 npm run build，输出目录 dist。现有 wenjuan-pages-test-31413 是连通性测试的 Direct Upload 项目，不能改为 Git 集成。

wrangler.jsonc 定义 Pages 项目名称、既有 D1 数据库的 DB 绑定和正式 APP_ORIGIN。在 Pages 的 Variables and Secrets 配置 ADMIN_EMAIL、ADMIN_PASSWORD_HASH、SESSION_SECRET，从本机被 Git 忽略的 .prod-secrets 读取。正式管理员登录信息在 PROD-ADMIN.txt。域名变更时同步更改 APP_ORIGIN。

Pages Functions 接口位于 functions/api/，负责提交答卷、管理员登录、退出和汇总读取。静态页面由 dist/ 提供，_routes.json 使 Functions 仅接管 /api/*。浏览器不能直接访问 D1，提交由服务端验证、计分和保存；管理员会话保存在 D1。

## 验证与功能

运行 npm run typecheck、npm test、npm run build。本地 Pages 服务运行后，可以用 playwright.pages.config.ts 和 e2e/worker.spec.ts 验证逐题填写、提交、登录、汇总、重复提交和退出。测试使用 .local-tests/ 下的隔离 D1，避免污染日常数据。

问卷共 42 题（A01—A05、B01—B30、C01—C06、D01），D01 选答。后台展示总览、秩序倾向和 C 题分析，支持图表切换及 PNG 导出；不展示逐条原始答卷、自由填写内容或 Excel/CSV 导出。

旧的 Next.js + OpenNext Worker 版本及 wrangler.worker.jsonc 暂留供回退。现有 desktop-order-survey.yyt31413.workers.dev 不会因 Pages 部署自动删除。Pages 和 Worker 读取同一正式 D1；切换期间只向用户发放一个问卷网址。

参考：https://developers.cloudflare.com/pages/configuration/git-integration/ 、https://developers.cloudflare.com/pages/functions/bindings/ 、https://developers.cloudflare.com/pages/functions/routing/ 。