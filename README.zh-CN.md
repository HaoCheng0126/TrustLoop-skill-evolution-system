# TrustLoop

[English](./README.md)

![OpenClaw](https://img.shields.io/badge/OpenClaw-构建于其上-0F172A?style=for-the-badge)
![审核优先](https://img.shields.io/badge/审核优先-2563EB?style=for-the-badge)
![人在回路中](https://img.shields.io/badge/人在回路中-059669?style=for-the-badge)
![支持回滚](https://img.shields.io/badge/支持回滚-F59E0B?style=for-the-badge)

很多“会自我进化的 agent”演示，强调的是自治。

TrustLoop 更强调的是信任。

TrustLoop 想解决的不是“agent 会不会学习”，而是“agent 越学越多之后，用户还敢不敢继续放心用它”。

它是一套面向 OpenClaw 的“审核优先”技能进化系统：从真实工作里识别可复用流程，把它们沉淀成可审查的 managed skill candidate，再让团队决定什么该保留、什么该修改、什么该发布、什么该回滚，而且所有改动都被限制在清晰的工作区安全边界内。

教会 agent 你们团队真正有效的做法。让它持续变好。最终决定权始终留在人手里。

## 为什么这件事会打动人

多数团队并不是不想要会学习的 agent。

他们真正担心的是，一旦 agent 开始“自己变”，问题也会立刻出现：

- 会不会打断正在发生的工作？
- 会不会慢慢漂移成没人批准过的行为？
- 如果它学错了，能不能很快退回安全状态？

TrustLoop 就是为这个现实而设计的。

不是为了炫技演示，不是为了“先自动改了再说”，而是为了让真实团队能在不失去掌控感的前提下，放心让 agent 一周比一周更有用。

## TrustLoop 真正带来的价值

- 让 agent 学习已经被证明有效的工作流，而不是一时的猜测
- 减少团队对同类流程的重复指令和重复返工
- 把“学习”变成可审查、可协作的流程，而不是黑盒改动
- 让技能库通过 patch 和 merge 持续变好，而不是越积越乱
- 把审计和回滚提前做进系统里，让团队更敢放心提速

## 为什么用户会愿意长期用下去

- 它尊重工作节奏。先做真实工作，任务结束后再学习，不在中途打断用户。
- 它尊重人的判断。用户可以批准、拒绝，或者直接说“方向对，但范围收窄一点”。
- 它尊重信任成本。新行为先从 candidate 开始，始终可见，而不是要求用户盲目信任。
- 它尊重真实协作。发布、备份、审计、回滚属于同一条生命周期，不是分散在各处的手工动作。

## 它真正不同的地方

TrustLoop 的核心承诺其实很简单：

- 先建立信任，再谈自治
- 先审查，再发布
- 先收边界，再放能力
- 先支持回滚，再让用户放心尝试

它不是“完全不让 agent 学习”和“放任 agent 在后台自己改自己”之间的妥协，而是一条更适合真实团队落地的中间路线。

## 三种模式，但同一套安全原则

TrustLoop 支持三种运行模式，让不同团队按自己的节奏来：

- `manual`：只创建 candidate，发布前必须有人明确批准。适合最看重可控性的场景。
- `assisted`：低风险更新可以自动批准，但发布仍然需要人工确认。适合想减少重复审查、但不想放掉最终把关的团队。
- `autonomous`：低风险 patch 会更积极地自动发布，低风险新技能也能更快晋升，但中高风险改动仍然会留在 review 里。

关键点是，这三种模式改变的是速度，不是安全哲学。真正决定什么能自动前进的，依然是风险边界。

## Skill 和 Plugin 是一起设计的

TrustLoop 不是单独一个 skill，它还有一条可选的原生 plugin 路径。

- 只从 ClawHub 安装 skill，它也能以 standalone 方式正常工作。
- 从 ClawHub 安装 plugin，OpenClaw 可以一起加载它内置的 TrustLoop skill 和原生 managed-skill 工具。
- 如果两者都在，同一套工作流仍然成立，只是 plugin 路径会让生命周期操作更安全、更稳定。

这意味着用户不会被卡住：

- 只装 skill，也能先产生价值
- 再装 plugin，可以升级完整体验
- 插件没装，不应该破坏产品承诺

## 它是怎么工作的

1. 用户先在 OpenClaw 里正常完成真实任务。
2. TrustLoop 发现某个流程重复出现、被纠正过，或者已经稳定到值得沉淀。
3. 它先生成 candidate，而不是直接改写行为。
4. 用户可以批准、提修改建议、拒绝，或者在合适的时候发布。
5. 已发布技能仍然是工作区限定、可审计、可回滚的。

## 仓库里分别是什么

### [`skill-evolver/`](./skill-evolver)

这是核心 skill 和规则层。

- `SKILL.md`：运行时行为和用户可触发命令
- `README.md` / `README.zh-CN.md`：完整产品说明和体验设计
- `references/`：生命周期、风险边界、原生工具规则
- `templates/`：managed skill 与 candidate 的模板

### [`openclaw-skill-manage-managed-plugin/`](./openclaw-skill-manage-managed-plugin)

这是配套的原生插件路径。

它把 candidate 审查、发布、回滚、模式管理这些关键动作收口成一个更窄的工具接口，让高风险部分更可靠，也更少依赖 prompt orchestration。

## 建议从哪里开始看

- 想先理解产品价值和用户体验：看 [`skill-evolver/README.zh-CN.md`](./skill-evolver/README.zh-CN.md)
- 想直接看技能行为约束：看 [`skill-evolver/SKILL.md`](./skill-evolver/SKILL.md)
- 想看原生工具侧怎么落地：看 [`openclaw-skill-manage-managed-plugin/src/skill-manage-managed.js`](./openclaw-skill-manage-managed-plugin/src/skill-manage-managed.js)

## 当前已经具备什么

TrustLoop 现在已经有一套可运行的 v0 基础能力：

- managed candidate 创建
- 审查、修改建议、批准、拒绝流程
- 工作区限定的发布与回滚
- 结构化审计记录
- 按模式执行的晋升规则
- 一个用于高可靠生命周期操作的配套插件骨架

## 为什么我建议这个名字叫 TrustLoop

这个项目最核心的卖点，不是“它会进化”。

而是“它会在学习、审查、控制之间形成一个可被信任的闭环”。

`TrustLoop` 这个名字比较准确地抓住了这件事：

- 系统可以学习
- 用户始终在回路里
- 信任本身就是产品特性，而不是副作用

## 接下来最值得继续优化的地方

- 给 publish、rollback、dedupe、mode transition 补上端到端测试。
- 做一个 demo workspace 或完整 walkthrough，让新人几分钟内看懂整条生命周期。
- 补一份更明确的安装/接入说明，降低首次试用门槛。
- 增加“效果证明”层，比如它是否真的减少了重复指令、提升了复用率。

## 一句话原则

让系统持续学习，但始终把控制权交给用户。
