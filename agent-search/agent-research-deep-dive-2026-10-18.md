# Agent 产品与技术研究：用「灵思」校准 CoBuilder

**更新日期：2026-10-18。** 依据公开的一手产品资料、工程文章、论文及访谈；尚未登录第三方产品进行同题实测，也未取得 CoBuilder 的运行轨迹或目标板卡。文中“启发”“建议”“假设”属于分析，不等于已验证的 CoBuilder 事实。2026 年材料优先，2025 年访谈保留为产品早期选择的历史参照。

## 0. 研究问题与边界

用户的原始诉求是三件事：研究行业最有代表性的 Agent 产品及其产品思想；读重点论文、博客、播客并形成自己的判断；调查用户群、规模和营收。目的不是做同赛道竞品表，而是理解 Agent 如何把模糊意图变成可验证的成果，进而改善面向智能硬件开发者的 CoBuilder。

已知产品现状由用户提供：CoBuilder V1 能创建产品，但智能体及工作流生成效果未达期望；嵌入式开发依赖串口，沙箱生成代码在本地板卡上的效果较差。**CoBuilder 目前不支持 App、Web、云端开发**。因此下面只评价产品创建、Agent/工作流构建、嵌入式开发与实机验证；App/Web/云端作为灵思产品的既定外部系统或接口，不列为 CoBuilder 当前交付项。公开[Tuya CoBuilder 页面](https://www.tuya.com/cobuilder)的宣传口径与这一内部现状不同，本报告采用用户给出的实际边界。

贯穿案例「灵思」：很小的蜂窝联网设备，用户按键录音；上传到云端整理和自动分类；用户从 App/Web 查看、编辑，**人工分类始终高于自动分类**。尚未指定蜂窝模组、主控、音频编码、接口协议、ASR 服务、分类标签体系；这些在测试时应标成“待定输入”，不能让生成器私自定为 Wi-Fi、手机中转或某一特定硬件。

## 1. 核心判断

1. **Agent 产品的交付对象正在从“回答/配置/代码”变成“在真实环境里发生的可验收状态变化”。** [n8n Assistant](https://blog.n8n.io/introducing-n8n-assistant/)明确把运行、逐节点看日志、修复、重跑放进工作流搭建；[Replit 的评估方法](https://replit.com/blog/evaluating-and-improving-agent-at-scale)检查真实产品的交互；[Anthropic 的评估文章](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)把 Agent 的陈述与环境最终状态分开。CoBuilder 若只展示“已生成”，用户无法判断灵思是否真能录音、上传和保持人工改类。
2. **工作流与 Agent 是两种控制权配置，不是先进/落后的层级。** [n8n 的解释](https://blog.n8n.io/introducing-n8n-agents/)是“工作流主导，Agent 是其中一步”或“Agent 主导，把工作流当工具”；[Dify 的近期说明](https://www.dify.ai/de/blog/ai-agent-or-workflow-how-to-choose-the-right-approach)也强调固定步骤用工作流，依上下文选择下一步才用 Agent。灵思上传重试、幂等、人工优先级应是确定性状态规则；内容归类可用模型；只有动态诊断和例外处置需要更开放的 Agent。
3. **执行环境是能力的一部分。** [Cursor 的云端 Agent 复盘](https://cursor.com/blog/cloud-agent-lessons)发现环境不完整会隐性降低结果质量；[SWE-agent](https://arxiv.org/abs/2405.15793)指出 Agent 可操作的计算机接口影响表现。对于 CoBuilder，目标板、SDK、模组 AT/PPP 状态、串口、烧录和日志都应能进入执行与反馈闭环。沙箱编译成功只说明一个较浅的阶段通过。
4. **多加一层复杂 harness 不保证提分。** 2026 年 10 月的预印本[《What Does a Harness Buy? Tokens, Mostly》](https://arxiv.org/abs/2610.04433)在固定模型的 SWE-bench Verified 比较中发现，两个 harness 的通过率差距可能落在统计噪声内，成本却可相差约三倍。它只覆盖编码基准，不代表 IoT 硬件场景。对 CoBuilder 的操作性结论是：先测清失败来自需求、环境、工具、模型还是验证，再决定是否增加编排层。
5. **市场数字支持“需求已验证”，不支持拿披露数据直接排名产品好坏。** 不同来源混用注册用户、周活、安装机器、项目数、网站访问量、ARR 和年化运行率。下面逐项标注口径；公司总营收不能记到单个 Agent 产品名下。
6. **2026 年的 Muse 提醒我们：Agent 的持续性会改变整个产品界面。** [Muse 团队的设计复盘](https://introducing.muse.ai/)描述一个长期会话、后台任务、目标视图、活动记录和可编辑记忆，同时为关键动作保留明确的接受/拒绝控件。CoBuilder 不是个人生活助手，但灵思开发任务同样跨越多次生成、实机测试和人工修改，需要一个可恢复、可审查的工作空间。

## 2. 代表产品：真正值得拆解的交互与技术机制

选择标准：广泛使用或具有清晰的行业示范机制；覆盖开发 Agent、工作流/Agent 搭建器、通用任务 Agent、从需求到成品的应用生成器、Agent 质量闭环。下表是**公开资料桌面分析**，并非相同任务的效果排名。

| 产品 | 服务的人和“委托单位” | 关键产品思路与可观察机制 | 灵思场景下值得借鉴/保留的疑问 |
|---|---|---|---|
| [Claude Code](https://claude.com/product/claude-code) | 专业开发者委托一个真实项目中的编码/调试任务 | 以本地终端、IDE 和既有工具链为 Agent 操作面；[团队访谈](https://www.latent.space/p/claude-code)强调可组合的文本接口和小而可理解的原语 | 嵌入式 Agent 可能应先用开发者已有本地环境工作。疑问：如何安全、稳定地发现串口与板卡状态？ |
| [Cursor Cloud Agents](https://cursor.com/blog/cloud-agent-lessons) | 工程团队委托较长、可并行的软件任务 | 独立 VM、持久运行、环境重建、与人共享可检查的过程；其工程文章说 Agent 循环、机器和会话状态可解耦，并用持久工作流承受中断 | 把“真实开发环境”纳入产品，而非看作后台细节。灵思需对照沙箱与本地的 SDK/板卡/串口差异；内部 Temporal 动作量不是用户量 |
| [Codex / Agents API](https://developers.openai.com/api/docs/guides/agents-api/architecture) | 开发者/知识工作者委托项目任务 | 官方文档将 **harness（模型与工具循环）—环境（执行命令/文件）—应用层（任务与事件）**明确分开；[自有环境](https://developers.openai.com/api/docs/guides/agents-api/environments/self-hosted)可由本地或远端执行器承接 | 架构借鉴是让 CoBuilder 的规划/状态管理与有串口的执行器分离。是否采用这一实现形式仍需 PoC；不意味着直接依赖某家 API |
| [GitHub Copilot](https://www.microsoft.com/en-us/investor/events/fy-2026/earnings-fy-2026-q4) | GitHub 上的开发者及企业工程团队 | 把 AI 嵌进开发者已有的代码、PR 与组织治理工作流；以大规模分发和原有工作台取胜 | CoBuilder 也应让生成结果进入现有产品、固件、工作流的审查面，而非把自然语言会话当唯一资产。此行的机制概括为分析推论 |
| [Devin](https://cognition.com/blog/testing-development) | 工程团队委托可端到端验证的开发任务 | 在云端运行应用、用浏览器操作和截图/断言检验改动，必要时让人接管测试环境；以可审阅的运行证据交付 | 把“完成”定义到可复验的结果。对灵思，设备侧要有实机证据；不能直接把 Cognition 公司规模当作 Devin 单品规模 |
| [Replit Agent 4](https://replit.com/blog/introducing-agent-4-built-for-creativity) | 开发者、业务人员、非专业开发者从想法制作可运行应用 | Replit 控制项目、文件、运行、预览和发布环境；Agent 可拆任务并行；[其评估体系](https://replit.com/blog/evaluating-and-improving-agent-at-scale)从真实 PRD 出发，检查最终应用交互 | CoBuilder 的评测样本应是完整硬件产品需求，评分落在运行结果；App/Web 不在 CoBuilder 当前任务内 |
| [Lovable](https://lovable.dev/blog/how-lovable-agents-work-together) | 创业者、设计师、业务人员和开发者制作应用 | 会话到构建需确认；其技术文章把不可变事件轨迹、模型看到的上下文投影、Agent 收件箱和激活执行分开，支持长任务与多 Agent 协作 | CoBuilder 可把“用户要求、产物版本、试验观察、修复决定”作为持久事件，避免下一轮修复忘记板卡约束；复杂架构是否必要需按任务规模评估 |
| [n8n Assistant / Agents](https://blog.n8n.io/introducing-n8n-assistant/) | 自动化构建者及业务技术团队 | 自然语言规划、生成可手工编辑的原生节点图、请求凭证、运行、逐节点看输入/输出/错误、修复重跑；[Agents](https://blog.n8n.io/introducing-n8n-agents/)与原有 workflow 双向组合 | 这是 CoBuilder 工作流生成最直接的参照：产物可编辑，且有带真实/样例数据的执行与修复循环；凭证和激活保留确认点 |
| [Dify Agent / Workflow](https://dify.ai/blog/a-new-chapter-for-dify-agent) | 开发者、业务团队构建可运营的 AI 应用 | 新 Agent 可独立存在并复用于工作流；工作流与 Agent 拥有不同控制权，支持通过对话逐步塑形和复用 | 把“灵思内容归类”做成可单独测试、版本化、可嵌入流程的能力，别每次生成一个不可维护的大图 |
| [Manus](https://manus.im/blog/manus-sandbox) | 一般用户/团队委托研究、文件和网页操作等任务 | 每项任务拥有隔离的云端计算机，文件/网络/浏览器构成可持续的外部状态；[工程复盘](https://manus.im/uk/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)强调上下文、工具输出和错误轨迹如何进入下一步 | 借鉴“任务资产与错误可追溯”，但沙箱不能替代有蜂窝模组的真实设备环境 |
| [Muse / Meta，2026-09](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) | 普通消费者委托跨应用的长期个人事务 | 专属持久 VM 与浏览器、长期记忆、后台任务和主动提醒；[设计文章](https://introducing.muse.ai/)说明目标页、活动记录、记忆编辑以及不可逆动作的确定性确认控件 | 借鉴“任务跨会话持续、过程可见、关键状态可直接编辑”。它是个人 Agent，并非智能硬件开发产品；不能把其 VM 当作解决串口问题的现成方案 |
| [LangSmith Engine](https://www.langchain.com/blog/introducing-langsmith-engine) | 已上线 Agent 的研发/运营团队 | 聚类失败 trace，关联代码提出修复、评估器、回归样例；从生产失败形成下一次可执行测试 | CoBuilder V1 工作流效果差时，最有用的不是又生成一版，而是积累“失败 → 根因 → 对应回归样例”的产品机制 |

**跨产品的产品思想。** 第一层是“用户委托一个目标”，第二层是“Agent 得到足够且正确的工具/环境”，第三层是“交付原生、可审阅的产物”，第四层是“用执行结果检验，再修复”。n8n 强在可编辑工作流及节点证据，Cursor/Codex/Claude Code 强在开发执行面，Replit/Lovable 强在从需求到运行成品，LangSmith 强在长期质量循环。CoBuilder 的差异点不必是更大的 Agent，而可能是把硬件开发专有的真实反馈接入这四层。此段是研究综合推论。

## 3. 论文、工程博客与访谈：主要观点及我的思考

### 3.1 建议优先读的论文

| 资料 | 论文回答的问题 | 对 CoBuilder/灵思的判断及限制 |
|---|---|---|
| [ReAct](https://arxiv.org/abs/2210.03629) | 为什么把推理和工具行动交错，而非一次性生成答案 | Agent 要根据编译、烧录、串口、网络和工作流执行观察改变下一步。不能把私有的“思考文本”当验证证据，证据应来自工具与环境 |
| [Reflexion](https://arxiv.org/abs/2303.11366) | 外部反馈如何经语言反思改善后续尝试 | “修复”须使用真实失败反馈；只让模型自我批评，容易看起来聪明却没改最终状态 |
| [SWE-agent](https://arxiv.org/abs/2405.15793) | Agent 可用的命令/文件接口如何影响任务表现 | 为板卡选择、SDK 检查、烧录、串口采集、蜂窝诊断设计窄而清楚的操作工具，比只给一个通用沙箱有希望；论文研究软件工程，不证明设备上会有同样提升 |
| [SWE-bench](https://arxiv.org/abs/2310.06770) | 怎样用真实仓库问题和测试验证代码 Agent | 生成固件也要有外部判定。SWE-bench 是已有仓库修 bug，不覆盖从零定义产品、音频硬件和蜂窝链路，不能照搬其分数 |
| [τ²-Bench](https://arxiv.org/abs/2506.07982) | 当人和 Agent 同时改变环境时，如何测协作任务 | 灵思用户人工改类后，后台重新转写/归类也在改变同一记录；应测最终值与事件顺序，而不是只测单次分类答案 |
| [Harness Engineering](https://arxiv.org/abs/2609.00006) | 11 个代码 Agent 的运行时由哪些部件组成 | 可作为设计清单：循环、模型接入、工具、上下文、安全/权限、编排、扩展。但它是代码系统源代码调查，不是 IoT 架构标准 |
| [What Does a Harness Buy? Tokens, Mostly](https://arxiv.org/abs/2610.04433) | 固定模型后，换 harness 提升多大、成本如何 | 给架构热情降温：在该编码基准里，某些 harness 的胜率差距难与随机波动区分，成本差异更明显。CoBuilder 应做对照实验和多次运行；这篇预印本不否定 IoT 专用工具的价值 |

### 3.2 2026 年工程文章与实证研究：优先读这些新实践

以下优先选**产品机制和工程约束**，而非只追模型榜单。同一家公司不同文章也代表不同层级：产品界面、Agent runtime、权限、设备原型、规模化基础设施。

| 2026 年资料 | 主要观点 | 对 CoBuilder/灵思的推论与边界 |
|---|---|---|
| [Meta：How We Designed Muse，09 月](https://introducing.muse.ai/) · [Muse 发布说明](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) | Agent 持续在后台做事时，要把目标、进度、活动记录、记忆和权限变成可见界面；购买、发邮件等关键动作要有确定性控件。其专属 VM 与独立 Sentinel 审核代理是 Meta 自述架构 | CoBuilder 可以把“灵思规格、工作流、固件、板卡状态、失败记录”做成持续的项目状态，而不是一段不断变长的聊天；烧录和部署等关键操作展示具体影响范围。Muse 的生活任务场景与 CoBuilder 不同，不能照搬其主动提醒频率 |
| [Anthropic：Scaling Managed Agents，04-08](https://www.anthropic.com/engineering/managed-agents) | 将 append-only session、Agent harness、sandbox 分成可独立替换的组件；模型变强后，旧 harness 的补丁可能失效或变成负担 | CoBuilder 若接本地串口执行器，应让用户意图与任务状态留在持久层，让执行器可重连/更换；但 V1 可用较简单实现，不必复制云服务的全部弹性基础设施 |
| [Anthropic：Agentic coding and persistent returns to expertise，06-16](https://www.anthropic.com/research/claude-code-expertise) | 对约 40 万次 Claude Code 交互会话的研究发现：典型会话中，人做约 70% 的规划决策，Claude 做约 80% 的执行决策；任务领域经验与成功率相关。其“成功”依据会话证据判断，研究未观察实际部署后的结果 | CoBuilder 应让熟悉硬件与场景的人明确模组、功耗、按键交互和验收标准，再让 Agent 执行与诊断。面向新兴开发者，可把这些决策做成可选的规格引导；不能把“会话中验证成功”当成目标板可用 |
| [Anthropic：Claude Code Auto Mode，03-25](https://www.anthropic.com/engineering/claude-code-auto-mode) | 频繁确认导致审批疲劳；其方案分别检查外部输入与待执行动作，用风险分类减少普通操作中断，并公开讨论误判 | 对 CoBuilder，读文档、生成、编译可连续执行；刷写板卡、改变线上工作流等应依据目标板、环境和影响范围决策。模型分类器自身也会漏判，不能替代边界清晰的设备权限 |
| [Claude Code：动态工作流，06-02](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code) | 对复杂高价值任务，可临时生成专用 harness/子任务编排；作者也明确提醒额外 token 成本 | 诊断“弱网、录音丢帧、串口报错”可尝试专用诊断流程；正常分类链路不需要默认多 Agent。与本文固定模型的 harness 论文形成可检验张力：按灵思任务测净收益 |
| [OpenAI：Codex as a Platform，08-19](https://developers.openai.com/blog/codex-as-a-platform) | 同一 Agent 循环可进入 CLI、IDE 或领域专用产品界面；应用拥有上下文、工具、运行边界和审批体验 | CoBuilder 的优势应放在硬件开发界面与真实设备工具，而不是再做通用聊天框；可以复用通用 harness，领域能力留在产品层。这是架构参照，不是接入建议 |
| [OpenAI：Introducing the Agents API，09-10](https://openai.com/index/introducing-the-agents-api/) | 将长时间运行的 Agent harness、云端沙箱、文件与中间结果持久化作为托管能力提供，说明“对话生成”与“可恢复的执行环境”是不同产品层 | 对 CoBuilder，可借其任务状态、工具事件、可恢复产物的抽象；但云端沙箱本身不拥有本地串口和实机反馈，设备侧仍需受控执行入口 |
| [OpenAI：Rethinking Skills and Prompts，09-11](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) | 模型升级后，冗长技能描述、通用“每次都读全部文档”、过度限定的任务脚本可能拖慢或误导 Agent；应按任务加载上下文并定义完成标准 | 若 CoBuilder 的工作流效果差，不宜只累加更长 prompt。比较精简约束、按需模组资料、明确验收任务后的结果；这篇文章是 Codex 团队在特定模型上的经验，不应直接泛化为所有模型 |
| [OpenAI：语音 LED 硬件原型，09-23](https://developers.openai.com/blog/bringing-my-led-display-to-life) | Codex 帮作者识别接线、调试 ESP32 控制器、将常驻服务移到 Raspberry Pi；作者亲自处理物理连接与异常反馈 | 这是最贴近 CoBuilder 的 2026 案例：Agent 能跨软件和硬件推进原型，但人的物理操作与真实反馈仍在闭环内。它没有证明任意蜂窝设备、量产固件或 App/云端全链路可自动完成 |
| [Anthropic：Redesigning Source Control，10-13](https://www.anthropic.com/engineering/redesigning-source-control) · [OpenAI：Maintaining Software，10-14](https://developers.openai.com/blog/maintaining-software-with-the-gpt-6-family) | Agent 生成量上升后，代码合并、CI、维护和审查成为新瓶颈；OpenAI 的内部案例强调从多种系统取证后提交小的可审阅改动 | 对 CoBuilder 的远期提醒是固件/工作流变更必须有版本、影响范围和回归证据。Anthropic 的每天数万次合并是其内部特殊规模，不是 CoBuilder V1 要建设同级源码系统的理由 |

这组 2026 资料提出一个更准确的产品问题：**CoBuilder 要为“开发智能硬件的持续任务”设计什么状态与操作界面？** 对灵思，用户需要随时知道哪些东西已经生成、哪些在目标板上验证、哪些只是模型猜测；用户改动分类规则或硬件选择之后，Agent 应能从正确版本继续。Muse 的目标/活动/权限 UI、Anthropic 的 session-harness-sandbox 分离、OpenAI 的领域界面观点分别从体验、运行时和嵌入方式支持这个判断。这仍需 CoBuilder 实测。

另一个值得用实验检验的张力是：Claude Code 的动态工作流主张按复杂任务增加编排，OpenAI 的新提示实践提醒旧脚手架可能拖累更强模型。我的判断是先以灵思同题失败轨迹分组——需求缺失、工作流逻辑、SDK/串口环境、实机网络——然后只在确有收益的组加入专用工具或编排。不能把所有低成功率都归因于“Agent 不够自主”。

### 补充：经典方法与其他工程复盘

| 资料 | 主要观点 | 我的思考 |
|---|---|---|
| [Anthropic：Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) | 固定工作流、路由、评估优化、Agent 等是不同模式；从能解决问题的简单模式起步 | 灵思运行时先把按键录音、上传、幂等和人工优先编码成确定规则；让模型处理语义分类；只有异常诊断等开放任务才让 Agent 选择步骤 |
| [Anthropic：Demystifying Evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | 区分 task/trial/trace/outcome，用代码、模型、人三类 grader，多次运行 | CoBuilder 的“工作流图生成”与“运行后的最终分类状态”需分开评分；同一需求要重复试验，防止被偶然成功误导 |
| [Anthropic：Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | 上下文有限；应按需载入可靠信息，让长期任务可恢复 | 嵌入式上下文应精确到目标模组、SDK 版本、引脚、串口日志和外部接口契约。缺失时问清或标注假设，不要用大段通用文档填补 |
| [Anthropic：Harness Design for Long-running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) | 长任务要分阶段、记录结构化进度和可继续工作的产物 | 产品定义、固件、工作流、实机试验宜有稳定的中间状态；用户中断后也能从最近的真实证据继续 |
| [Cursor：Cloud Agent Lessons](https://cursor.com/blog/cloud-agent-lessons) | 云端环境完整性、持久执行、状态解耦决定 Agent 实际能做什么 | “本地效果更好”先做环境差异诊断，再谈换模型；但 Cursor 的通用 VM 经验不等于其已解决串口和蜂窝板卡接入 |
| [Manus：Context Engineering](https://manus.im/uk/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) | 稳定提示前缀、外部文件记忆、可恢复压缩；不要抹去错误观察 | 对 CoBuilder，保留失败日志、尝试过的修复和最终结果；复用上下文时只加载与当前板卡/工作流有关的证据。其缓存经验来自 Manus 的系统，不宜机械照搬 |
| [Lovable：Agents Work Together](https://lovable.dev/blog/how-lovable-agents-work-together) | 事件轨迹、模型上下文、Agent 收件箱、激活信号分离 | 生成链路长时，持久的“事实/状态”比无限聊天记录更重要；但 V1 未必需要复制其多 Agent 架构 |
| [Replit：Evaluating and Improving Agent](https://replit.com/blog/evaluating-and-improving-agent-at-scale) | 从真实 PRD 与自然语言测试计划评价最终应用，持续把失败变成改进数据 | 灵思 benchmark 要从一句真实需求到设备和工作流的观察结果。单测通过、图画完整、回答流利都只是中间指标 |
| [LangSmith Engine / IssueBench](https://www.langchain.com/blog/introducing-langsmith-engine) · [评测说明](https://www.langchain.com/blog/issuebench-how-we-evaluate-engine) | 把重复失败聚合为问题，并用已知正负样例评估问题发现能力 | CoBuilder 应把用户修正、失败运行、板卡日志归入原因类别；同时防止“故障分类 Agent”自己误报，所以分类器也要有 ground truth |

### 3.3 访谈/播客：2026 年产品决策与 2025 年历史参照

| 访谈 | 可核对的主张 | 给 CoBuilder 的启发 |
|---|---|---|
| [Alexandr Wang × David Senra：Creating Muse，2026-10-11](https://www.davidsenra.com/episode/alexandr-wang) | 访谈讲 Muse 约七个月的产品打磨、Meta 为何选择个人 Agent、产品需要统一的设计观点，以及 Agent 信任如何建立；[节目页](https://podcasts.apple.com/gb/podcast/creating-muse-the-fastest-growing-ai-product-since/id1836497887?i=1000795226761)提供具体章节。Wang 的[访谈转录](https://podscripts.co/podcasts/david-senra/creating-muse-the-fastest-growing-ai-product-since-chatgpt-alexandr-wang-meta)还描述把百余项目标行为逐项变成评估与改进清单，这是他的自述 | 灵思 benchmark 不应只有一个“工作流生成成功率”，应列出按键录音、蜂窝上传、失败恢复、自动分类、人工优先等具体行为门槛。Muse 的消费者产品论不直接证明 CoBuilder 的架构选择；要把“打磨”翻译成同题评估与真实用户观察 |
| [Cursor 创始人 Michael Truell × Lenny's Podcast，2025-05](https://www.lennysnewsletter.com/p/the-rise-of-cursor-michael-truell) | 从 CAD 转向代码；在开发者已有工作台建立体验，针对补全等特定任务做专用模型，强调内部高频使用 | 先找到高频且可感知的产品时刻：例如开发者看到代码已烧入目标板、按键录音上传成功。宏大平台叙事不能代替这个时刻。访谈是创始人观点，不能当独立效果评估 |
| [Claude Code 团队 Boris Cherny / Cat Wu × Latent Space，2025-05](https://www.latent.space/p/claude-code) | 终端和文本输入输出作为可组合接口；选择简单、可理解、可扩展的原语 | 串口、固件工具链、日志诊断可能先做成高质量原语，再让 CoBuilder 组合；避免一开始把所有开发阶段封进黑箱 |
| [n8n 创始人 Jan Oberhauser × Sequoia Training Data](https://sequoiacap.com/podcast/training-data-jan-oberhauser) | n8n 从连接应用的自动化层发展到 AI 自动化；开放集成与社区推动覆盖广度 | CoBuilder 的“平台能力通过自然语言操作”需要稳定的工具接口和权限边界；访谈包含商业叙事，具体规模以下面的官方披露为准 |

**值得保留的争论。** “更多自主性”可以让用户更少设计节点，但会削弱可预测性；“更多可视化工作流”提高审查性，却可能让复杂异常分支难维护。灵思是一个恰当的切分样本：固定的录音/上传/覆盖规则可强约束，分类判断允许概率性，诊断流程允许 Agent 探索。这样 Agent 的自由度随任务不确定性增加，而不是对整条链路一刀切。

### 3.4 从这些资料抽出的 Agent 技术骨架

一个能完成开发任务的 Agent 系统，至少可拆成下面几层。这里是用于分析 CoBuilder 的**架构框架**，不是声称任何一家产品都按此实现：

```text
用户目标与约束
      ↓
任务状态/计划 ─→ 上下文选择 ─→ 模型决定下一动作 ─→ 工具执行 ─→ 环境观察
      ↑                                                         │
      └────────────── 评估结果/错误归因/人工修正 ←───────────────┘

横向能力：持久化事件与产物版本、权限/凭证、成本与超时控制、可审阅证据
```

| 层 | 为什么必需 | 灵思中最容易露出的缺口 |
|---|---|---|
| 目标与约束 | 模型要知道“成功”与不可侵犯规则 | 蜂窝被默认成 Wi-Fi；人工优先只写在描述里，没有测试断言 |
| 上下文选择 | 全量对话无法代替目标板、SDK 和当前产物版本 | 加载泛化示例却遗漏模组手册、串口错误、真实接口规格 |
| 工具与环境 | Agent 只能根据可调用工具获得反馈；本地/云端能力不同 | 沙箱能编译但不能烧录、采串口、观察蜂窝注册 |
| 状态与恢复 | 长任务需要知道做过什么、哪里失败、哪些产物已被人改动 | 每次重试重新生成大图，覆盖人工编辑或丢失旧的失败证据 |
| 评估与修复 | “执行过”不等于“达到最终状态” | 分类节点跑完但最终记录错；修复后没有重跑弱网/人工改类用例 |
| 权限与交接 | 真实设备和线上工作流的改动有副作用 | 烧错板卡、改动已有部署，用户不知道 Agent 实际执行了什么 |

[Anthropic 的 Agent 模式文章](https://www.anthropic.com/engineering/building-effective-agents)提供循环与编排的基本划分；[Manus 的上下文工程文章](https://manus.im/uk/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)解释长循环里上下文、文件与错误轨迹的作用；[Cursor 的云端架构复盘](https://cursor.com/blog/cloud-agent-lessons)解释执行环境和持久任务；[Lovable 的事件系统文章](https://lovable.dev/blog/how-lovable-agents-work-together)解释历史与模型上下文为何要分开；[OpenAI 官方架构文档](https://developers.openai.com/api/docs/guides/agents-api/architecture)清楚区分 harness、执行环境与应用层。共同指向的不是某个固定框架，而是 **目标、动作、观察、状态和验收之间的闭环**。

## 4. 用户群、用户量、营收：可核实的公开口径

**读法：**“用户”可能是累计注册、活跃、付费或企业账户；“安装机器”“项目”“访问量”并非人。ARR 是经常性收入年化值，revenue run-rate 是按当前速度推算的年化收入，均非上一财年实际确认营收。以下数字均按**披露日期**写，不推断 2026-10 的实时值。“未披露”表示本轮未找到可靠的**单品可比数据**，不能填零或估算。

| 产品/公司 | 主要用户群 | 已核实的规模数据 | 已核实的商业数据及限制 |
|---|---|---|---|
| [GitHub Copilot / Microsoft，2026-07](https://www.microsoft.com/en-us/investor/events/fy-2026/earnings-fy-2026-q4) | 开发者、企业研发 | Copilot **5,000 万用户**；财报口径未说明其中周活或付费人数 | 说 Copilot 收入环比增长超过 60%，**无单独收入绝对额**；GitHub 2.25 亿用户不可算 Copilot 用户 |
| [Codex / OpenAI，2026-06](https://openai.com/index/codex-for-knowledge-work/) | 开发者为主，也有知识工作者 | **超过 500 万周活**；约 20% 为知识工作者 | 未找到 Codex 单品收入披露 |
| [Claude Code / Anthropic，2026-02](https://www.anthropic.com/news/anthropic-raises-30-billion-series-g-funding-380-billion-post-money-valuation) | 个人开发者、工程组织 | 周活较 2026 年初翻倍，但**未给绝对人数** | Claude Code 年化收入运行率 **超过 25 亿美元**；其中企业使用贡献超过一半收入。不是全年已实现营收 |
| [Cursor，2025-11](https://cursor.com/blog/series-d) | 个人开发者、研发团队 | 官方说“数百万开发者”，未给精确总量、月活、付费人数 | 官方披露**超过 10 亿美元年化收入**；[媒体 2026-03 报道](https://www.bloomberg.com/news/articles/2026-03-02/cursor-recurring-revenue-doubles-in-three-months-to-2-billion)超过 20 亿美元，系匿名来源，另列为低一档证据，不替换官方值 |
| [Cognition / Devin，2026-09](https://cognition.com/blog/1b-run-rate) | 企业软件工程团队 | Devin 可比用户/付费席位数未披露 | Cognition **公司**年化收入运行率达 10 亿美元，旗下还有其他业务，不能写成 Devin 单品营收 |
| [Replit / Agent 4，2026-03](https://replit.com/blog/replit-raises-400-million-dollars) | 学生、非开发者、企业内部构建者、开发者 | **Replit 平台超过 5,000 万用户**，不是 Agent 4 活跃用户 | 公司称**预计** 2026 年底达到 10 亿美元年化收入运行率；预测不是当期业绩，更不是 Agent 4 单品 |
| [Lovable，2025-11/2026-08](https://lovable.dev/blog/one-year-of-lovable) · [2026-08 披露](https://lovable.dev/blog/series-c) | 创业者、业务人员、设计师和开发者 | 累计 **超过 6,000 万项目**；其所建应用每月 **超过 9 亿访问**，均不是独立用户数 | 2025-11 官方披露 **2 亿美元 ARR**；本轮未找到可核实的更晚官方 ARR |
| [Manus，2025-12](https://www.manus.im/blog/manus-100m-arr) | 一般用户、专业人员和团队 | 官方说“数百万用户”，未给精确、活跃或付费口径；生成 8,000 万台虚拟计算机不是用户量 | **1 亿美元 ARR**；含使用量等在内的总收入年化运行率 **超过 1.25 亿美元**，两个口径不可相加 |
| [Muse / Meta，2026-09](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) | 美国首发的个人 Agent 用户，跨应用处理长期个人事务 | [Wang 在 2026-10 访谈中自述](https://podscripts.co/podcasts/david-senra/creating-muse-the-fastest-growing-ai-product-since-chatgpt-alexandr-wang-meta)已达“数百万”量级，但拒绝给精确数字；未公开可比的 MAU、留存或付费人数，访谈自述不能当独立审计 | 官方说明基础使用免费、另有订阅；未找到 Muse 单品收入披露。不能把 Meta 总用户或 Muse 模型 API 用户算作 Muse Agent 用户 |
| [n8n / Assistant，2025 及 2026-09](https://blog.n8n.io/series-b/) · [Assistant 发布](https://blog.n8n.io/introducing-n8n-assistant/) | 自动化构建者、工程/业务技术团队 | 2025 年披露 **20 万以上用户、3,000 多家企业**；Assistant 2026-09 发布后未单独披露用户量 | 未找到可核实的产品收入绝对额 |
| [Dify，2026-03](https://dify.ai/blog/dify-raises-30m-tomorrow-s-organizations-will-be-built-by-people-and-agents) | AI 应用开发者、团队、企业 | 运行于 **140 万以上机器**，涉及 **2,000 多团队、280 家企业**；机器数不是独立用户 | 未找到可核实的营收披露；融资 3,000 万美元不属于营收 |
| [LangSmith Engine](https://www.langchain.com/blog/introducing-langsmith-engine) | 运营已上线 Agent 的工程团队 | 本轮未找到 Engine 单品可比用户数据 | 未找到 Engine 单品营收披露；LangChain 公司的融资/估值不能替代 |

这些数据可以用来识别**分发与付费模式**：Copilot/Cursor/Claude Code 是既有开发任务的高频入口；Replit/Lovable 从“能创建可运行软件”的结果价值获得更宽用户群；n8n/Dify 通过可视化、集成和治理进入团队；Manus 卖通用任务委托；LangSmith 卖上线后的质量循环。这是对产品定位的解释，不是由营收数字直接推导的因果结论。

## 5. 把“灵思”拆成两个 Agent、三个边界

**两个 Agent。** 外层是 CoBuilder 开发 Agent：理解需求 → 形成产品及设备约束 → 生成工作流/固件 → 编译/运行 → 根据证据修复。内层是灵思运行时的“自动整理能力”：设备把录音可靠交给既定云端接口，外部云端转写和自动分类，人工编辑最后决策优先。内层可先是**工作流 + 分类模型**，不必默认是开放式多 Agent。

**三个边界。** (a) CoBuilder 与开发环境：目标板、模组、SDK、烧录器、串口、调试权限；(b) 设备固件与外部云端：设备身份、录音数据、事件 ID、上传确认、重试；(c) 自动分类与人工编辑：谁拥有最终分类、版本和覆盖规则。边界 (b)(c) 要有接口契约和验收观察，但当前不要求 CoBuilder 开发云端或 App/Web。

```text
开发期：需求 → 产品规格/未决问题 → 固件与工作流产物 → 编译/样例运行 → 实机操作 → 证据 → 修复/复验
运行期：按键 → 录音 → 蜂窝连接/上传 → 外部云端受理 → 转写/自动分类 → 最终分类规则 → App/Web 查看编辑
                                                              ↑                   ↑
                                                     现有外部服务/接口       人工分类优先
```

这里的蜂窝链路不是简单“调用 HTTP”。以 [Espressif esp_modem 文档](https://docs.espressif.com/projects/esp-protocols/esp_modem/docs/latest/README.html)为例，模组有 AT 命令与 PPP 数据模式、UART 抽象和网络事件。不同硬件方案还会涉及 SIM、APN、注册、掉线、功耗和复连。这个例子只是说明设备 Agent 所需观察类型，**不代表灵思必须使用 ESP 系列**。[esptool 的远程串口文档](https://docs.espressif.com/projects/esptool/en/release-v4/esp32/esptool/remote-serial-ports.html)说明远程串口技术可行，同时记录了网络延迟影响自动复位，提示“远程设备实验台”仍需处理物理与时序约束。

### 5.1 把人工优先变成状态不变量

建议在**外部运行时接口契约**中定义：`auto_category`、`auto_model_version`、`manual_category`、`manual_revision`、`effective_category`、`updated_at`。最终显示规则可写成 `effective_category = manual_category ?? auto_category`；自动重试/重分类只能改自动字段，不能清空或覆盖人工字段。若允许“取消人工分类”，也必须是用户明确的独立事件。CoBuilder 生成的分类工作流应符合这个契约，并用“人工已改类 → 转写重试 → 模型升级重新分类 → 最终仍是人工类”的时序样例检验。此处是**建议的契约**，不声称现有云端已经如此实现。

并发时还要验证原子性：人工改类与自动重分类几乎同时发生，最终分类仍由已提交的人工修订决定。仅在 App/Web 展示层做覆盖会留下后台状态被改写的风险；不变量应由持久化与接口处理规则保证。CoBuilder 可以生成并验证契约测试，外部服务由其实际负责团队实现。

### 5.2 验收分层，避免“已完成”的错觉

| 层级 | 灵思的可观察证据 | 失败归因的初步方向 |
|---|---|
| L0 需求理解 | 记录蜂窝、按键录音、人工优先；标出未指定模组/音频协议 | 需求解析/提问策略 |
| L1 结构产物 | 产品定义、节点图、固件文件、接口契约能被人审阅与修改 | 规划与产物表示 |
| L2 静态执行 | 目标 SDK 下编译、工作流样例数据跑通 | SDK/工具调用/节点配置 |
| L3 物理执行 | 实机按键、录音、蜂窝注册/连接、上传、服务端确认日志 | 板卡/串口/模组/网络环境与固件逻辑 |
| L4 业务最终状态 | 录音记录可追踪、分类正确或合理待定、人工类不被覆盖 | 分类模型、状态规则、接口契约 |
| L5 恢复与维护 | 弱网/断电/重复上传/重新分类后仍满足预期，修改后回归通过 | 幂等、持久化、错误恢复、版本管理 |

若没有目标硬件和外部服务，CoBuilder 仍可报告 L0–L2 的进展；应明确记录 L3–L5 为“未验证”。这是信任设计，不是一次任务失败。

## 6. 给 CoBuilder V1 的可验证改进假设

按对当前痛点的贴近程度排序；它们是产品实验建议，不是已证实根因。

1. **先让工作流生成形成 n8n 式闭环。** 输入一句真实需求后，生成可编辑节点图及每个节点的输入/输出契约；用 4 类录音样例执行；在同一界面显示错误节点、实际输入输出、修复理由与重跑差异。第一版范围可只覆盖分类工作流，不扩到 App/Web/云端建设。关键观测：首次可用率、修复轮数、用户手改节点比例、最终分类质量。
2. **再补“硬件能力探测 + 本地执行”窄通路。** Agent 在生成前拿到目标板、模组、SDK 版本、串口是否可用；编译、烧录、串口采集、蜂窝诊断作为明确工具。可比较云端沙箱、用户本地执行器、集中式板卡实验台三种方案的成本与成功率。[OpenAI 官方文档](https://developers.openai.com/api/docs/guides/agents-api/environments/self-hosted)给出了 harness 与自有执行环境分离的现成架构例子；这里只借鉴分界，不等于 CoBuilder 应采用其 API。
3. **把外部接口契约与状态不变量作为生成约束。** 蜂窝上传必须有记录 ID、确认与重试语义；分类必须有人工覆盖规则。生成前检查缺少的决定，避免擅自假设硬件/网络方案；生成后用可执行断言验证不变量。
4. **从失败轨迹建立质量飞轮。** 保留原始需求、产物版本、节点日志、编译/串口日志、用户修改和最终状态；按“需求不明/工具失败/环境缺失/代码错误/分类错误/覆盖错误/验证缺失”聚合。每个高频问题转成一条回归任务。可参考 [LangSmith Engine](https://www.langchain.com/blog/introducing-langsmith-engine)，但 V1 可先用人工聚类，不必一开始构建自动根因 Agent。
5. **权限和人工接管点贴近真实风险。** 连接凭证、烧录真实板卡、改变已运行的工作流、部署到生产平台应展示具体将执行的动作和受影响对象。普通的生成、编译、沙箱测试则尽可能连续执行，减少中断。产品目标是让用户看见进展与证据。

### 6.1 一组足以区分架构路线的实验

在同一目标板、同一 SDK、同一外部接口模拟器和相同模型预算下，比较 A：当前 CoBuilder；B：加结构化约束和样例评估；C：B + 本地串口执行器。每组运行至少多次，保留全轨迹。测试集建议包含：正常按键录音；蜂窝不可注册；上传中断后重试；重复确认；短/空音频；多主题录音；分类置信低；人工已改类后自动重跑。评分分别看 L0–L5，通过率之外记录首个有效结果耗时、人工介入次数、模型/工具成本、失败节点与修复成功率。

**决策逻辑。** 若 B 明显提升工作流质量而 C 只改善实机相关指标，应分别投资“约束/评估”与“设备执行面”；若 C 使大量原先“模型不会写固件”的问题消失，则先补环境与工具；若三组都因产品规格缺失失败，就改善需求澄清。需要真实轨迹才能判定，不宜从外部产品的成功直接推论 CoBuilder 根因。

### 6.2 用同一任务建立真正的产品体感

公开资料能解释厂商意图，不能替代手感。后续若能登录这些产品，可把灵思拆成**能力相当的片段**，不要求每家完成完整 IoT 产品：

| 实测对象 | 交给它的同题片段 | 记录的产品体验 |
|---|---|---|
| n8n Assistant、Dify | 给定外部接口模拟器与 4 条录音/改类事件，生成可运行的分类工作流 | 首轮是否追问标签规则；图是否可手改；节点输入输出与错误能否看见；改类不变量是否通过 |
| Claude Code、Cursor、Codex | 在给定板卡 SDK 的小仓库完成“按键录音 → 蜂窝上传”的设备侧代码 | 是否发现真实环境约束；能否编译、接串口、读日志并修复；缺实机时是否准确说明证据等级 |
| Replit、Lovable | 用等价的“录音上传与人工分类优先”需求构建可交互软件原型 | 从需求到第一次可点击成果的时间；需求修改后是否保持已有行为；可否检查与回滚产物。此项仅学习产品 UX，不算 CoBuilder 的 App/Web 竞品测试 |
| Manus、Devin | 委托“定位一条上传失败轨迹并给出可复验修复” | 长任务中进度与证据是否持续可见；何时请求人接管；修复后是否有运行证明 |

每次实测固定原始需求与样例，记录屏幕/产物/日志、首次成功耗时、人工介入次数和修复后的最终状态；尤其记录用户“信任增加或下降”的具体时刻。这样才能把“感觉更好”拆成可用于 CoBuilder 决策的机制。当前报告没有这些一手体验，不能把表中待测问题写成结论。

### 6.3 需回收的最小真实证据

一轮 CoBuilder 构建灵思的**原始提示、系统记录的待确认事项、生成的工作流和固件、目标板/模组/SDK、编译与串口日志、4 条分类样例、人工认定“效果不好”的具体节点**。用这组材料即可先做失败归因，不要求团队先建设 App/Web/云端。若云端接口尚未存在，可用固定的接口模拟器完成开发期验收，再把跨系统运行留作后续阶段。

## 7. 尚未解决的关键问题

- “能创建产品”在当前 CoBuilder 里具体交付到哪一层：产品模型、节点图、固件、目标板烧录、真实运行？公开页面不能替代内部路径的实测。
- 灵思计划用的主控/蜂窝模组、麦克风和录音编码、音频时长/大小、功耗目标是什么？它们会决定是否能在现有板卡/SDK 上验证。
- 分类工作流目前是 CoBuilder 生成、运行，还是只生成配置后交给外部服务？无论哪种，都需要能观察输入、输出和状态覆盖规则。
- 人工优先是否为现有云端持久化逻辑的一部分？如果尚无，应先写接口契约；不能只在提示词里要求模型“尊重人工”。
- “本地效果更好”是在相同模型、相同 SDK、相同板卡、相同任务下观察的吗？如果不是，先建对照基线。
- 公开资料中未看到能被核实为“自然语言全自动完成任意主控固件、蜂窝硬件、App/Web/云端与生产部署”的通用产品。这是**证据边界**，不是“市场上绝对没有”的结论，也不应成为 CoBuilder 当前目标。

## 8. 研究方法与可信度说明

产品机制尽量取官方产品文档/工程文章；商业数字取公司或投资者披露，并标明日期和口径；论文取原文摘要或正文；播客取节目页/文字摘要。厂商自述可描述其**设计意图与披露数据**，不代表独立第三方实测。论文基准若与 IoT 从零建造和实机执行不同，只借其方法论。报告没有第三方产品登录后的手感记录，也没有 CoBuilder 内部数据，因此最终产品优先级仍是**待实验验证的假设**。后续真正形成“深体感”的关键，是让同一名硬件开发者、同一灵思任务分别经过产品生成、节点修复、固件烧录、实机错误恢复，并完整记录其每个接管时刻。
