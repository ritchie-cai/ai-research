# Agent 产品研究：以「灵思」校准 CoBuilder

日期：2026-10-17。状态：第一轮公开资料研究；尚未对第三方产品和 CoBuilder 进行同任务实测。

## 研究边界

灵思是一款小型蜂窝联网设备。用户按键录音，内容上传后由 CoBuilder 外部的云端服务自动归类；人工分类的优先级高于自动分类。用户预期可在 App 或 Web 页面查看、编辑内容。

本轮研究评价 CoBuilder 的产品创建、智能体和工作流生成、设备侧开发、实机运行与修复。App、Web、云端服务的开发不属于当前 CoBuilder 能力，不纳入评测。云端只作为约定的外部接口和结果观察面；无需先假设它已经实现。

这里有两种不同的 Agent：CoBuilder 是帮助开发者构建灵思的开发 Agent；它生成的归类逻辑是灵思运行时使用的 Agent 或工作流。两者分别评分，避免把生成质量与运行质量混为一谈。

## 灵思验收任务

| 验证项 | 可观察的通过条件 | 典型失败 |
|---|---|---|
| 产品定义 | 明确蜂窝模组、按键、麦克风、录音状态、上传协议与设备身份；列出待确认假设 | 把设备默认为 Wi-Fi 或手机中转 |
| 设备侧 | 目标板上完成按键录音、上传、服务端确认；弱网时重试且不重复创建记录 | 只在沙箱编译通过，实机无法录音或上传 |
| 分类工作流 | 新录音触发转写与自动归类；保留原文和分类依据；无法确定时给出可纠正结果 | 工作流节点完整，实际数据上分类不稳定 |
| 人工优先 | 人工分类后，重试、重新转写或模型升级均不覆盖人工结果 | 后台任务把人工编辑改回模型分类 |
| 可验证性 | 每条记录能追溯设备事件、上传确认、工作流运行、分类版本和最终状态 | Agent 声称完成，却没有运行证据 |
| 迭代 | 修改分类规则后只更新受影响的工作流，并重跑相关样例 | 修改一个要求导致已有功能回退 |

需要准备四类测试录音：明确主题、多个可能主题、无法归类、用户已人工改类。设备测试另加弱网、断电、重复上传和按键误触发。首轮指标建议分开记录：设备链路成功率、工作流运行成功率、分类质量、人工分类保持率、实机修复轮数及总耗时。质量阈值应由团队根据真实用户任务确定。

## 代表产品及值得学习的机制

| 产品 | 主要用户与产品思路 | 对 CoBuilder 的启发 |
|---|---|---|
| [n8n Assistant](https://blog.n8n.io/introducing-n8n-assistant/) | 面向自动化搭建者；自然语言生成原生可编辑工作流，执行、读节点日志、修复后重跑 | 灵思工作流应形成“生成→测试数据运行→定位失败→修复→重跑”的闭环；人工可直接编辑产物 |
| [Dify](https://dify.ai/blog/dify-raises-30m-tomorrow-s-organizations-will-be-built-by-people-and-agents) | 开发者及业务团队用可视化方式构建、部署、运营 Agent 工作流；强调可复用与治理 | 把归类能力作为有版本、可单独测试的组件；区分固定流程与需模型判断的步骤 |
| [Claude Code](https://claude.com/product/claude-code) | 开发者在本地终端和 IDE 内让 Agent 使用现有工具链 | 实机与本地 SDK、串口、日志环境可能是固件 Agent 能力的一部分；保留人工接管点 |
| [Cursor Cloud Agents](https://cursor.com/blog/cloud-agent-lessons) | 工程团队把长任务交给云端独立环境；产出可检查的代码及验证证据 | 开发环境完整性、持久执行、运行证据会直接影响输出质量；设备实验环境要设计成产品能力 |
| [Codex](https://openai.com/index/introducing-the-codex-app/) | 开发者并行安排编码任务，隔离工作目录并审阅修改 | 复杂任务可以拆分，但产物必须能审阅、合并和回滚；模型、执行环境与界面应解耦 |
| [Devin](https://cognition.com/blog/testing-development) | 工程团队委托较长的软件任务；在虚拟机中端到端验证并提供结果 | 交付标准要包含运行证明；设备侧需要与云端 Agent 可交互的真实测试环境 |
| [Replit Agent](https://replit.com/blog/evaluating-and-improving-agent-at-scale) | 从自然语言需求生成并运行软件，面向开发者和非专业开发者 | 从用户需求到可运行产物的评估必须检查实际行为；不能只检查生成的代码或配置 |

这些产品的公开资料足以分析产品设计，但不能代替亲测。下一轮应使用同一组任务，记录首次成功时间、所需人工介入、错误诊断质量及交付证据。通用编码产品只承担灵思任务中的固件或工作流片段，不把它们无法开发 IoT 全链路解释为产品缺陷。

## 必读研究与工程文章

| 资料 | 主要观点 | 对灵思的具体推论 |
|---|---|---|
| [ReAct](https://arxiv.org/abs/2210.03629) | 推理与行动交替，通过环境反馈更新计划 | CoBuilder 要读取编译、烧录、串口和工作流运行结果，再决定下一步 |
| [SWE-agent](https://arxiv.org/abs/2405.15793) | Agent 可用的计算机接口会显著影响软件工程表现 | 应设计清晰的设备操作工具：选择板型、烧录、采集日志、重启与诊断 |
| [Anthropic：Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | 固定流程、路由、评估优化及开放式 Agent 各有适用任务；从简单可组合模式起步 | 录音上传和人工优先级适合确定性规则；含义模糊的归类可以调用模型；生成后的评估与修复形成循环 |
| [Anthropic：Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Agent 的上下文是有限资源，工具结果、文件和历史需按需载入 | 固件生成要精确加载目标模组、SDK 版本、引脚、协议和已有项目状态，避免大量泛化文档淹没关键约束 |
| [Anthropic：Demystifying Evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | 同时看执行轨迹和环境最终状态；代码、模型、人工评价各有作用 | 归类评分要看持久化分类是否正确、人工改类是否保留，而非 Agent 的“已完成”回复 |
| [Replit：Closing the Loop](https://replit.com/blog/evaluating-and-improving-agent-at-scale) | 面向从零生成产品的 Agent，评价对象是可运行的最终产物 | 灵思评测应从自然语言需求开始，最终到实机及现有服务的可观察结果 |
| [Cursor：Cloud Agent Lessons](https://cursor.com/blog/cloud-agent-lessons) | 远程 Agent 的环境完整性、可恢复运行和自愈能力会限制成果质量 | 沙箱代码不如本地的现象，应先检查 SDK、板卡、串口、日志和网络等环境差异 |
| [τ²-Bench](https://arxiv.org/abs/2506.07982) | 用户和 Agent 都能改变共享环境时，要评价协作和最终状态 | 灵思的人工改类是共享状态变更；随后自动流程必须尊重它 |

综合这些资料，我的当前假设是：CoBuilder 的主要瓶颈可能在 **执行环境、产物约束与验证闭环**。这仍需用灵思的真实运行轨迹验证；单凭公开资料不能判断模型能力、工作流设计和工具接口各自贡献多少失败。

## 用户规模与商业化：仅列可核实的公开口径

不同公司披露的“用户”“安装机器”“年化收入运行率”不可直接横比；运行率也不等于已经确认的全年营收。

| 产品或公司 | 最新找到的公开口径 | 解释与限制 |
|---|---|---|
| [GitHub Copilot / Microsoft](https://www.microsoft.com/en-us/investor/events/fy-2026/earnings-fy-2026-q4) | 2026 年 7 月称 GitHub Copilot 有 5,000 万用户 | 未在该口径中给出活跃或付费用户数；未单独披露 Copilot 营收 |
| [Codex / OpenAI](https://openai.com/index/codex-for-knowledge-work/) | 2026 年 6 月称每周活跃用户超过 500 万 | 未单独披露 Codex 营收 |
| [Claude Code / Anthropic](https://www.anthropic.com/news/anthropic-raises-30-billion-series-g-funding-380-billion-post-money-valuation) | 2026 年 2 月称年化收入运行率超过 25 亿美元；周活用户较年初翻倍 | 未给出周活绝对人数；运行率不是全年已实现营收 |
| [Cursor](https://www.cursor.com/en/blog/series-c) | 2025 年 6 月官方披露 ARR 超过 5 亿美元，覆盖半数以上 Fortune 500 企业 | 这不是 2026 年的当前值；官方资料未在此披露活跃人数 |
| [Cognition / Devin](https://cognition.com/blog/1b-run-rate) | 2026 年 9 月 Cognition 称公司年化收入运行率达 10 亿美元 | 公司包含其他产品，不能记为 Devin 单品营收；未公开可比用户数 |
| [Replit](https://replit.com/blog/replit-raises-400-million-dollars) | 2026 年 3 月称平台超过 5,000 万用户；预计 2026 年底达到 10 亿美元年化收入运行率 | 用户是 Replit 平台口径，收入数字是预测；都不能直接记为 Agent 4 的数据 |
| [n8n](https://blog.n8n.io/series-b/) | 2025 年官方披露 20 万以上用户、3,000 多家企业 | 未披露可比营收；用户数字需要更新核验 |
| [Dify](https://dify.ai/blog/dify-raises-30m-tomorrow-s-organizations-will-be-built-by-people-and-agents) | 2026 年 3 月称运行于 140 万台以上机器，涉及 2,000 多团队和 280 家企业 | 安装机器数不是独立用户数；未披露营收 |

## 对 CoBuilder 的首轮产品假设

1. **把“可运行”定义为有证据的状态。** 产品定义、工作流图和固件代码是中间产物；实机日志、上传确认、工作流执行结果和分类最终状态才构成交付证据。
2. **让工作流生成器使用测试样例。** n8n Assistant 的关键改进是生成后直接运行、读错误、修复再运行。灵思可用带标准答案的录音及人工改类事件作回归样例。
3. **把人工分类写入状态规则。** 建议为每条记录保存 `auto_category`、`manual_category`、分类来源与版本，展示时由明确规则选择最终分类。模型重跑时保留人工值。
4. **为设备侧提供真实操作面。** 固件 Agent 至少需要知道目标模组和工具链，并能得到编译、烧录、串口及网络日志。远程设备实验台或本地执行器可作为候选方案，需比较维护成本和成功率。
5. **明确每次修改的影响范围。** 更换蜂窝模组、录音参数或分类规则时，先列出受影响的设备产物和工作流，再执行、验证、留下版本记录。

以上都是待验证假设。下一轮最有价值的材料是 CoBuilder 对灵思的一次完整生成轨迹：原始提示词、工作流产物、目标硬件、运行日志和人工认为失败的具体样例。通过这份轨迹，可以区分需求缺失、工具能力不足、环境不足、模型推理失误和评估缺位。
