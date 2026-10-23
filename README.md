# 视频标注

内部使用的 PhysFixBench / Physion-300 标注页。入口：https://chengye629.github.io/physfix-annotator/

页面只保留视频、问题卡片和三个提交按钮。每条视频的预标注自动填入，每张卡片只有时间戳、当前视频的物理问题描述、修改后状态描述。可以添加、删除或修改卡片，也可以原样通过。

点击卡片空白处、卡片标题或「播放片段」会跳到对应片段并播放，到结束时间暂停；输入框和文本框用于编辑，不触发跳转。时间戳支持 `1.0–3.5`、`00:01–00:03.5` 或单点 `2.0`。单点播放前 0.5 秒至后 0.75 秒，范围限制在视频内。逐帧按钮按 30 fps 步进。

三个提交结果：

- `pass`：通过。保留卡片修改，或者直接提交预标注。
- `reject_no_clear_issue`：拒绝，没有明确、无争议的物理问题。
- `reject_poor_quality`：拒绝，整体质量太差、物理问题过多。

通过只校验三个字段是否完整、时间是否有效，以及视频是否成功加载。两种拒绝不要求修改卡片或填写额外理由，仍保留卡片文字以供回看。每次提交后自动切到下一条未提交的视频。

编辑自动保存到浏览器，填写标注人后可以提交和导出 JSON。多人各自导出，负责人在「汇总」导入；重复导出按标注人、视频、时间与修订号去重。两种拒绝分别保留，只有人数达标且全部通过的记录才进入一致通过集；各人的卡片原文都保留。

使用同一个 localStorage 键 `physfix.workspace.v1`，导出格式为 schema v2；兼容导入 schema v1 个人备份。旧的明确有问题映射为通过，旧的无明显问题映射为无明确问题拒绝；旧的不确定、无法播放记录保留原判断和备注，恢复为待复核草稿，不自动归入新的拒绝原因。第一次升级会尽可能在 `physfix.workspace.v1.before-cards` 留存原本机数据。已有人工编辑不会被预标注覆盖。

视频优先使用本站 300 条原画镜像，逐文件匹配上游 SHA-256，无重编码或画质变化；当前视频可连续播放后再预载下一条，最多缓存 3 条、40 MiB。保留 HF 原站备用线路与 gzip 启动索引。

本地运行（Node.js 22+，网站无第三方运行依赖）：

```sh
npm start
npm test
```

推送 main 后由 GitHub Pages 发布，根目录 `.nojekyll`。任务链接支持 `?group=1` 到 `?group=6`、`?sample=T1_01334`。

数据来自 [PhysFixBench](https://github.com/SiyuanMaCS/PhysFixBench)（源提交 fcef4a429c9061fa36db64f3213b8fbc37b121bf），视频来自 [HuggingFriends/PhysFixBench](https://huggingface.co/datasets/HuggingFriends/PhysFixBench/tree/main/videos)，交互最初参考 [MLLM-as-Embodied-World-Judge-Annotation](https://github.com/SiyuanMaCS/MLLM-as-Embodied-World-Judge-Annotation)。原始 300 行 JSONL 保持不变。上游视频源自 Physion-Eval，遵循 Custom Research Use Only License，仅用于非商业研究与评测；公开镜像不改变上游许可。


## 参考 PhyGround 的工作流补充

参考 [PhyGround human_eval](https://github.com/NU-World-Model-Embodied-AI/PhyGround/tree/main/evals/human_eval) 的任务状态、批次进度、覆盖率和分歧复核设计，独立实现了静态版本。其 [app.py](https://github.com/NU-World-Model-Embodied-AI/PhyGround/blob/main/evals/human_eval/app.py)、[db.py](https://github.com/NU-World-Model-Embodied-AI/PhyGround/blob/main/evals/human_eval/db.py)、[分组评分页](https://github.com/NU-World-Model-Embodied-AI/PhyGround/blob/main/evals/human_eval/templates/rate_compare.html) 面向 Flask、SQLite 和多视频量表评分；本网站继续使用三字段修复卡片与三种提交结果。

- 未编辑的预标注与人工编辑后的草稿分开；可筛选草稿、通过、两类拒绝或全部未提交任务。
- 每组显示本机提交进度，可继续第一条未完成任务，或复制分组链接分配给同事。显式分组链接优先于浏览器之前打开的其他分组，单样本链接优先定位该样本。
- 保存失败时保留当前视频，允许导出内存中的备份，不自动跳下一条。
- 汇总以本次导入的个人备份为依据，展示独立标注人进度，以及全部 300 条的覆盖、待补标和分歧；这些不是团队实时在线统计。汇总导入仍保留在当前页面会话，刷新后需重新导入原始 JSON。
- 可筛选待补标、分歧、一致通过或一致拒绝。点击视频编号进入自己的预标注复核，其他人的文字不会自动覆盖本机卡片。
- 全部汇总与一致通过导出增加 `coverage`、`annotators`。`review_queue` 导出列出未标注、人数不足、存在分歧的记录，包含缺少人数、是否需仲裁与已参与者 ID，不包含他人的问题描述。

这些功能位于 `workflow.js`，保留原个人 JSON schema v2 与 v1 导入兼容性。网页继续无需账户、服务器数据库或额外服务，个人结果仍通过 JSON 集中回收。
