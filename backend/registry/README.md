# 任务登记与标注后台

前端：https://chengye629.github.io/physfix-annotator/

固定九人、606 条任务和原分配计划保持不变。管理员为叶程、马思远、林炬乙。陈广宇的正确拼音为 Chen Guangyu / Guangyu Chen；误写的陈广宁与旧拼音保留为兼容别名。改名、提权不重新分配任务、不更换已有身份或会话。

数据库 DB 现有 registrations 保留。新增 annotations 存每位标注人的最新记录；annotation_history 按内容去重保存上传原文及冲突版本。客户端先读取云端；更新要求匹配 server version，重复上传幂等，冲突不覆盖。原始预标注以 worker/baselines.js 固定，用于历史通过分类。

接口：
- POST /api/claim，GET /api/lease：原有统一姓名入口和登记。
- GET /api/annotations：读取本人全部记录。
- POST /api/annotations/sync：每次最多 20 条，body 上限 2 MiB；以 base_version 条件更新。
- GET /api/examples：已登记成员读取管理员已提交样例和统计，支持姓名、结果与分页。
- GET /api/admin/annotations：管理员分页读取全员标注。
- GET /api/admin/claims，POST /api/admin/release、/api/admin/reassign：保留管理操作。

所有标注读写均由当前登记会话限定标注人。成员无权读取全员记录；样例不返回会话令牌。仍采用内部姓名识别，不引入密码或正式账号体系。

运行 npm test、npm run build；scripts/build.mjs 将名单、比较逻辑和 606 条原始卡片编入独立 Worker。db/schema.ts 为结构声明；0001 为追加迁移，仅新增标注和历史表。已应用的 0000 和原 journal 项不可修改。

前端首次进入补传旧内容；backend 只添加 approval_type、approval_source 分类元数据，保留上传原文，不更改卡片、状态、修订号、时间或播放记录。
