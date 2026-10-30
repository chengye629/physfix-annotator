# 视频标注

入口：https://chengye629.github.io/physfix-annotator/

标注守则：https://chengye629.github.io/physfix-annotator/guide.html

备用入口：https://physfix-annotator-chengye629.goldenstoat259.chatgpt.site/ 。与原站共用后台和分工；浏览器本机存储按域名隔离，旧内容尚未同步时，应在原站导出 JSON 后在备用入口导入。不要清理原站浏览器数据。

606 条任务：Physion 300、RoboJudge 115、PhyGround 91、VideoPhy2 100。9 人分工保持不变，按名单固定为前三人各 68 条，其余各 67 条。

## 姓名与权限

| 姓名 | 英文示例 | 任务数 | 角色 |
| --- | --- | --- | --- |
| 叶程 | Ye Cheng / Cheng Ye | 68 | 管理员 |
| 马思远 | Ma Siyuan / Siyuan Ma | 68 | 管理员 |
| 高晗晴 | Gao Hanqing / Hanqing Gao | 68 | 成员 |
| 罗景午 | Luo Jingwu / Jingwu Luo | 67 | 成员 |
| 杨陈策 | Yang Chence / Chence Yang | 67 | 成员 |
| 陈广宇 | Chen Guangyu / Guangyu Chen | 67 | 成员 |
| 林炬乙 | Lin Juyi / Juyi Lin | 67 | 管理员 |
| 刘皓天 | Liu Haotian / Haotian Liu | 67 | 成员 |
| Shihua | Shihua / Shi Hua | 67 | 成员 |

统一入口填写姓名，不分个人链接。拼音支持大小写、空格、连写和常见姓名顺序。陈广宇曾误写为陈广宁；旧中文、旧拼音仅作为兼容别名，仍回到第 6 份任务。已有登记改名或提权均保留 claim ID、标注人 ID、会话及任务位。这里沿用内部团队的姓名识别，不增设密码。

## 标注与提交

预标注自动填入三字段卡片：时间戳、当前物理问题、应修改后的状态。点击卡片或播放片段跳到对应时段并播放，到结束时间暂停；编辑框不触发播放。可添加、删除、修改卡片。

四个按钮：

- **直接通过**：视频适合物理修复，原卡片准确，无需修改。
- **修改后通过**：视频适合修复，已改正预标注的幻觉、描述、定位或增删卡片。
- **拒绝：没有明确、无争议的物理问题**：模棱两可的全部拒绝。
- **拒绝：整体质量太差，物理问题过多**：包括原视频本身异常加速、减速的情况。

通过会校验卡片三字段、时间戳和视频时长；两类拒绝不要求改卡片或补充理由，保留原文字供回看。提交后切到下一条未提交任务。

存储继续使用 schema v2、verdict=pass 表示通过；approval_type=direct/modified 区分两种通过，approval_source=button/comparison 区分新按钮与历史比对。统计、筛选、导出均显示两种通过，但两类通过在一致性投票中仍同属通过。

旧通过在进入、导入或首次同步时，与同一 record_id 的原始预标注比较，增加分类元数据；不重写卡片，不更改提交状态、修订号、提交时间或播放证据。前后空白与等价时间格式不算内容修改。

## 自动保存与后台

本机 localStorage 键 physfix.workspace.v1、个人档案、原 record_id 和九人分配计划均保留。升级会先尽量保留原始本机快照，再逐条上传。首次进入新版时自动补传本机已有内容，之后草稿和提交自动同步到后台 D1。

顶部“已同步”表示当前内容已上传；断网保留本机内容并提示重试，恢复联网可补传。新设备输入同一姓名后读取云端记录。若两个设备存在不同人工内容，会显示版本对照并等待选择；同步使用版本条件更新，原始上传和冲突内容保留在 annotation_history，避免旧设备静默覆盖新内容。

个人导出 JSON 仍可独立备份。管理员“管理”可下载全员标注；“汇总”可从后台读取或导入多人 JSON。后台保存姓名登记、卡片、播放证据及版本历史，不需要每条提交生成 GitHub commit，也不在公开仓库写入访问令牌。

## 管理员样例与守则

所有成员均可点“管理员标注情况”，查看叶程、马思远、林炬乙已同步的提交和分类统计，按人、结果筛选，播放视频，对照原始卡片。这个界面只读，不改变自己的任务、卡片或观看证据。

从标注页点“标注守则”，文档会读取马思远、林炬乙已同步的真实记录，并列出原始预标注与最终卡片，可下载为独立 HTML 或打印成 PDF。两位尚未上传的内容无法从他人浏览器读取；空状态明确说明需要本人在原浏览器打开新版补传，不用编造案例替代。

守则要求完整观看、只保留明显客观且无争议的问题；模棱两可的全部拒绝；原视频异常加减速按质量差拒绝。最终保留约 200–300 条、参考通过率低于 50% 是整体筛选预期，每条仍独立判断。

## 播放筛选与数据

播放记录来自实际 played 区间并集；只打开、预加载或拖到末尾不算看完。每次提交冻结 submitted_watch，汇总筛除未播放、未看完或缺少日志的提交，原始记录仍保留。容差最多 0.15 秒且不超过片长 2%。播放日志不能证明人的注意力。

离线筛选：

~~~sh
node scripts/filter-playback.mjs --out screened-results alice.json bob.json
~~~

输出目录应为空或不存在。qualified/ 包含合格个人备份；excluded.json 保存筛除原因和原标注；report.json 保存统计，不修改输入。

视频优先原画 GitHub Pages 镜像：前 300 条在本站，新增 306 条在 [physfix-annotator-media](https://github.com/chengye629/physfix-annotator-media)，逐文件匹配上游 SHA-256，无转码。保留 HF 固定版本备用线路；预载最多 3 条、40 MiB。

数据来源：[PhysFixBench](https://github.com/SiyuanMaCS/PhysFixBench)、[HuggingFriends/PhysFixBench](https://huggingface.co/datasets/HuggingFriends/PhysFixBench/tree/main/videos)。GitHub 数据版本 31d3ca543b1a586d48dd9e646c82f70dde63a746，HF 视频版本 b1c24dfbe30229941d192abc52b99c6fd2d28c81。四份原始 JSONL 保留，合并索引包含 606 条、783 张卡片，来源与视频映射见 data/。各数据源许可不变。

交互参考 [MLLM Annotation](https://github.com/SiyuanMaCS/MLLM-as-Embodied-World-Judge-Annotation) 与 [PhyGround human_eval](https://github.com/NU-World-Model-Embodied-AI/PhyGround/tree/main/evals/human_eval) 的状态、覆盖和复核流程，网站实现独立维护。

## 开发与发布

前端是无第三方运行依赖的 ES modules；Node.js 22+：

~~~sh
npm start
npm test
~~~

前端推送 main 后由 GitHub Pages 发布。后台源码在 backend/registry/，实际独立部署的源目录由 .openai/hosting.json 关联到原 Sites 项目；接口地址见 registry-config.js。数据库通过 Drizzle 追加迁移，旧迁移、已有登记和九人计划不变。
