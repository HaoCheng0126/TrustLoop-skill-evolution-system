# TrustLoop

[中文说明](./README.zh-CN.md)

![OpenClaw](https://img.shields.io/badge/OpenClaw-Build%20on%20Top-0F172A?style=for-the-badge)
![Review First](https://img.shields.io/badge/Review-First-2563EB?style=for-the-badge)
![Human in the Loop](https://img.shields.io/badge/Human-In%20the%20Loop-059669?style=for-the-badge)
![Rollback Ready](https://img.shields.io/badge/Rollback-Ready-F59E0B?style=for-the-badge)

Most self-improving agent demos optimize for autonomy. TrustLoop optimizes for trust.

TrustLoop helps your agent get better without becoming harder to trust.

It is a review-first skill evolution system for OpenClaw. It captures useful workflows from real work, turns them into managed skill candidates, and lets your team decide what should be kept, revised, published, or rolled back inside clear workspace-only safety boundaries.

Teach your agent how your team works. Let it improve over time. Never give up the final say.

## Why This Resonates

Most teams do not reject self-improving agents because the idea is bad.

They reject them because the moment an agent starts changing itself, three fears show up immediately:

- Will it interrupt real work?
- Will it drift into behavior nobody approved?
- If it learns the wrong thing, can we get back to safety fast?

TrustLoop is built for that reality.

Not for flashy demos. Not for "auto-modify everything and hope for the best." For real teams that want an agent to become more useful every week without becoming less predictable.

## What TrustLoop Gives You

- An agent that learns from proven work instead of one-off guesses
- Fewer repeated instructions for workflows your team already uses
- A review loop that feels collaborative, not confrontational
- A cleaner skill library that improves through patching and merging instead of uncontrolled sprawl
- The confidence to move faster because audit trails and rollback are already part of the system

## Why People Keep Using It

- It respects momentum. Users do real work first, and TrustLoop learns after the task instead of interrupting the middle.
- It respects judgment. People can approve, reject, or say "this is close, tighten the scope" without fighting the system.
- It respects trust. New behavior begins as a candidate, stays visible, and never needs to be accepted on faith.
- It respects real operations. Publish, backup, audit, and rollback belong to one lifecycle instead of scattered manual rituals.

## The Real Difference

TrustLoop is built around a simple promise:

- trust before autonomy
- review before publish
- scoped change instead of silent drift
- rollback before regret

This is the middle path between "never let the agent learn" and "let it rewrite itself in the background."

## Three Modes, One Safety Model

TrustLoop supports three operating modes so different teams can choose their own pace:

- `manual`: creates candidates and waits for explicit human approval before publishing. Best when control matters most.
- `assisted`: auto-approves low-risk updates, but keeps publishing manual. Best when teams want less review busywork without giving up the final gate.
- `autonomous`: auto-publishes low-risk patches and promotes low-risk new skills more aggressively, while medium- and high-risk changes still stay in review.

The important part is that these modes change speed, not the safety philosophy. Risk boundaries still decide what is allowed to move automatically.

## How It Works

1. A user finishes real work in OpenClaw.
2. TrustLoop notices a repeated or corrected workflow that is worth remembering.
3. It creates a managed candidate instead of changing behavior immediately.
4. The user can approve it, revise it, reject it, or publish it when ready.
5. Published skills stay workspace-scoped, auditable, and rollback-friendly.

## Repository Tour

### [`skill-evolver/`](./skill-evolver)

The core skill and policy layer.

- `SKILL.md`: runtime behavior and user-facing commands
- `README.md`: full product and UX walkthrough
- `references/`: lifecycle, risk, and managed-tool rules
- `templates/`: managed skill and candidate record templates

### [`openclaw-skill-manage-managed-plugin/`](./openclaw-skill-manage-managed-plugin)

The companion native plugin path.

It wraps candidate review, publish, rollback, and mode management into a narrower tool surface so the dangerous parts are more reliable and less prompt-dependent.

## Start Here

- Want the product story and user experience? Read [`skill-evolver/README.md`](./skill-evolver/README.md).
- Want the exact behavior contract? Open [`skill-evolver/SKILL.md`](./skill-evolver/SKILL.md).
- Want the native mutation path? Inspect [`openclaw-skill-manage-managed-plugin/src/skill-manage-managed.js`](./openclaw-skill-manage-managed-plugin/src/skill-manage-managed.js).

## Current Status

TrustLoop already has the core v0 pieces:

- managed candidate creation
- review, revision, approval, and rejection flows
- workspace-scoped publish and rollback
- structured audit artifacts
- mode-aware promotion rules
- a companion plugin skeleton for safer lifecycle mutations

## Why The Name "TrustLoop"

The strongest idea in this project is not raw evolution. It is the loop between learning, review, and control.

`TrustLoop` makes that promise clear:

- the system can learn
- the user stays in the loop
- trust is the feature, not a side effect

## What To Improve Next

- Add end-to-end tests for publish, rollback, dedupe, and mode transitions.
- Add a demo workspace or walkthrough artifacts so newcomers can see one full lifecycle in minutes.
- Add a clear installation path so people can try the skill without reverse-engineering repo structure.
- Add a small benchmark or telemetry story for "does this reduce repeated instructions over time?"

## Principle

Let the system learn, but keep the human in control.
