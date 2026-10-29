# 视频标注

内部使用的 PhysFixBench 完整数据标注页，共 606 条（Physion 300、RoboJudge 115、PhyGround 91、VideoPhy2 100）。入口：https://chengye629.github.io/physfix-annotator/

页面只保留视频、问题卡片和三个提交按钮。每条视频的预标注自动填入，每张卡片只有时间戳、当前视频的物理问题描述、修改后状态描述。可以添加、删除或修改卡片，也可以原样通过。

点击卡片空白处、卡片标题或「播放片段」会跳到对应片段并播放，到结束时间暂停；输入框和文本框用于编辑，不触发跳转。时间戳支持 `1.0–3.5`、`00:01–00:03.5` 或单点 `2.0`。单点播放前 0.5 秒至后 0.75 秒，范围限制在视频内。逐帧按钮按 30 fps 步进。

三个提交结果：

- `pass`：通过。保留卡片修改，或者直接提交预标注。
- `reject_no_clear_issue`：拒绝，没有明确、无争议的物理问题。
- `reject_poor_quality`：拒绝，整体质量太差、物理问题过多。

通过只校验三个字段是否完整、时间是否有效，以及视频是否成功加载。两种拒绝不要求修改卡片或填写额外理由，仍保留卡片文字以供回看。每次提交后自动切到下一条未提交的视频。

编辑自动保存到浏览器，填写标注人后可以提交和导出 JSON。多人各自导出，负责人在「汇总」导入；重复导出按标注人、视频、时间与修订号去重。两种拒绝分别保留，只有人数达标且全部通过的记录才进入一致通过集；各人的卡片原文都保留。

使用同一个 localStorage 键 `physfix.workspace.v1`，导出格式为 schema v2、dataset=`physfixbench-batch1`；兼容导入旧 `physfixbench-physion300` 的 schema v1/v2 个人备份。记录仍以原始 record_id 识别，已有人工编辑与播放记录保留。旧的明确有问题映射为通过，旧的无明显问题映射为无明确问题拒绝；旧的不确定、无法播放记录保留原判断和备注，恢复为待复核草稿，不自动归入新的拒绝原因。第一次升级会尽可能在 `physfix.workspace.v1.before-cards` 留存原本机数据。已有人工编辑不会被预标注覆盖。

视频优先使用 GitHub Pages 原画镜像：原 300 条仍在本站，新增 306 条在 [physfix-annotator-media](https://github.com/chengye629/physfix-annotator-media)（避免完整约 1.40 GB 的原视频超过单个 Pages 站点 1 GB 限制）。全部逐文件匹配上游 SHA-256，无重编码或画质变化；当前视频可连续播放后再预载下一条，最多缓存 3 条、40 MiB。保留 HF 原站备用线路与 gzip 启动索引。

本地运行（Node.js 22+，网站无第三方运行依赖）：

```sh
npm start
npm test
```

推送 main 后由 GitHub Pages 发布，根目录 `.nojekyll`。所有成员统一使用网站根地址，填写姓名后由共享登记服务领取任务。原始完整索引及前 300 条顺序保持不变，管理员可查看全部视频和分组。

数据来自 [PhysFixBench](https://github.com/SiyuanMaCS/PhysFixBench)（完整数据源提交 31d3ca543b1a586d48dd9e646c82f70dde63a746），视频来自 [HuggingFriends/PhysFixBench](https://huggingface.co/datasets/HuggingFriends/PhysFixBench/tree/main/videos)，交互最初参考 [MLLM-as-Embodied-World-Judge-Annotation](https://github.com/SiyuanMaCS/MLLM-as-Embodied-World-Judge-Annotation)。四份上游 JSONL 原样保留；完整索引按 Physion → RoboJudge → PhyGround → VideoPhy2 合并，只追加经核对的视频文件名 `video_file`。数据清单和版本见 `data/dataset-manifest.json`。视频分别遵循 Physion-Eval、RoboJudge、PhyGround、VideoPhy2 各来源数据集许可，仅用于非商业研究与评测；公开镜像不改变上游许可。


## 参考 PhyGround 的工作流补充

参考 [PhyGround human_eval](https://github.com/NU-World-Model-Embodied-AI/PhyGround/tree/main/evals/human_eval) 的任务状态、批次进度、覆盖率和分歧复核设计，独立实现了静态版本。其 [app.py](https://github.com/NU-World-Model-Embodied-AI/PhyGround/blob/main/evals/human_eval/app.py)、[db.py](https://github.com/NU-World-Model-Embodied-AI/PhyGround/blob/main/evals/human_eval/db.py)、[分组评分页](https://github.com/NU-World-Model-Embodied-AI/PhyGround/blob/main/evals/human_eval/templates/rate_compare.html) 面向 Flask、SQLite 和多视频量表评分；本网站继续使用三字段修复卡片与三种提交结果。

- 未编辑的预标注与人工编辑后的草稿分开；可筛选草稿、通过、两类拒绝或全部未提交任务。
- 每组显示本机提交进度，可继续第一条未完成任务，或复制分组链接分配给同事。显式分组链接优先于浏览器之前打开的其他分组，单样本链接优先定位该样本。
- 保存失败时保留当前视频，允许导出内存中的备份，不自动跳下一条。
- 汇总以本次导入的个人备份为依据，展示独立标注人进度，以及全部 606 条的覆盖、待补标和分歧；这些不是团队实时在线统计。汇总导入仍保留在当前页面会话，刷新后需重新导入原始 JSON。
- 可筛选待补标、分歧、一致通过或一致拒绝。点击视频编号进入自己的预标注复核，其他人的文字不会自动覆盖本机卡片。
- 全部汇总与一致通过导出增加 `coverage`、`annotators`。`review_queue` 导出列出未标注、人数不足、存在分歧的记录，包含缺少人数、是否需仲裁与已参与者 ID，不包含他人的问题描述。

这些功能位于 `workflow.js`，保留原个人 JSON schema v2 与 v1 导入兼容性。标注结果仍保存在本机，通过 JSON 集中回收；共享后端只登记姓名、任务领取与管理信息。

## 播放记录筛选

页面自动记录每个视频实际播放过的时间范围、播放次数和播放时间；预加载、只打开任务、拖动进度条、逐帧跳转都不能替代实际播放。播放器显示「未播放 / 已观看百分比 / 已看完」。重播部分不会重复累计，分段观看可以累计覆盖全片，刷新、重载或切换线路后保留已有记录。

三种提交结果保持不变。点击提交时冻结一份 `submitted_watch`，汇总只计算**提交前已完整播放**的记录；提交后补看必须再次提交，才会更新这份证据。判断使用实际播放区间的并集，允许最多 0.15 秒且不超过片长 2% 的帧边界误差，不以“当前进度到了结尾”判定。播放日志只能验证浏览器播放行为，不能证明人的注意力。

「汇总」导入后自动筛除未播放、未看完、缺少播放日志的提交，再计算人数、覆盖率、分歧和一致通过。先按标注人和视频取最新修订，再筛选，防止较早的合格记录盖过较新的不合格提交。个人原始备份仍保留全部内容；「导出播放筛除记录」包含筛除原因和原标注，便于核查。旧版本 JSON 没有日志，归入“缺少播放日志”，不会假定已看完；需要回到对应任务观看并重新提交。

也可离线运行同一筛选逻辑，不需要后端或额外安装：

```sh
node scripts/filter-playback.mjs --out screened-results alice.json bob.json
```

输出目录需为新目录或空目录。`qualified/` 保留筛选后可导入网页汇总的各人 JSON（草稿仍保留，但不算投票）；`excluded.json` 保存被筛除的提交及原因；`report.json` 保存数量统计。脚本不修改输入文件。

## 完整数据版本

当前 GitHub 文本版本为 `31d3ca543b1a586d48dd9e646c82f70dde63a746`，Hugging Face 视频版本为 `b1c24dfbe30229941d192abc52b99c6fd2d28c81`。606 条记录包含 783 张预标注卡片；RoboJudge 文件名使用来源前缀及完整目录名，PhyGround 同一场景的不同生成器使用各自对应视频，避免短编号碰撞。HF 备用线路固定到上述版本，来源清单与视频映射可审计。

新增三个来源保留上游 agent 草稿性质；自动填入卡片不代表人工通过。仍按原来的三个结果提交，观看完整性筛选与离线脚本均覆盖全部 606 条。

## 填写姓名后进入

打开网站先填写姓名，点击「进入标注」后显示任务和视频。再次打开会预填上次的姓名，仍需确认进入。顶部姓名固定显示，使用「切换」返回入口；同一浏览器下不同姓名的进度分别保存，重新进入原姓名可继续原进度。旧版本未填写姓名但已有编辑的进度，在首次填写姓名时保留。

个人导出的 JSON 文件名包含姓名和时间，例如 `physfix_张三_2026-10-28T10-30-00-000Z.json`；内容中的 `annotator.name` 与该标注人一致。导入旧个人备份仍保留备份中的姓名与标注人 ID。切换前若保存失败，会停止切换并提供导出当前进度入口，避免串人或覆盖。

## 九人统一入口与管理员

所有人访问同一个地址：https://chengye629.github.io/physfix-annotator/ ，填写中文姓名或完整英文拼音，自动进入预设任务。606 条按名单固定分为 3 份 68 条、6 份 67 条，各份均包含四种来源，无重复、无遗漏。任务不受进入顺序影响。

| 姓名 | 支持的英文写法示例 | 任务数 |
| --- | --- | --- |
| 叶程 | Ye Cheng / Cheng Ye | 68 |
| 马思远 | Ma Siyuan / Siyuan Ma | 68 |
| 高晗晴 | Gao Hanqing / Hanqing Gao | 68 |
| 罗景午 | Luo Jingwu / Jingwu Luo | 67 |
| 杨陈策 | Yang Chence / Chence Yang | 67 |
| 陈广宁 | Chen Guangning / Guangning Chen | 67 |
| 林炬乙 | Lin Juyi / Juyi Lin | 67 |
| 刘皓天 | Liu Haotian / Haotian Liu | 67 |
| Shihua | Shihua / Shi Hua | 67 |

英文不区分大小写，可连写、分开或加连字符。同一人的所有写法统一为表中姓名，进入后恢复同一份任务；本机旧拼音姓名的进度会合并到对应中文姓名，导出文件和内容使用统一姓名。Shihua 沿用提供的英文名，未推测其中文名。名单及别名维护在 participants.js，后端使用同一份名单。

叶程、马思远进入后自动显示「管理」「汇总」，可查看全体预设人员、进入情况、重置登记或转交任务，并可查看全部 606 条。普通成员只显示自己的任务。内部按姓名识别，不设密码或正式账号认证；名单外人员需管理员显式转交后才能进入。

提交前核对当前领取记录；任务如有调整，本机进度保留并返回入口。文件名带姓名、任务编号和时间，备份保留任务计划、领取记录 ID 和所有本机历史标注；不包含管理会话令牌。六人、七人旧计划和旧个人 JSON 仍可导入，原编辑不会因人数调整而删除；旧登记保留，重新进入时尽量沿用原标注人 ID。

后端只保存登记及任务管理信息，不保存标注卡片、播放记录或 JSON 结果；换设备需导入个人备份。后端源码在 backend/registry/，部署绑定见其中 .openai/hosting.json，前端接口地址见 registry-config.js。
