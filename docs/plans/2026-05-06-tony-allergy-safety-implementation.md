# Chat Allergy Safety Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Make Tony always tell diners to confirm with the waiter when answering allergy, intolerance, or dietary-safety questions.

**Architecture:** This is a prompt-only behavior change with deterministic prompt tests and opt-in live provider-adapter tests. The base prompt gets a dedicated allergy safety section plus a final reminder after owner instructions. Tests verify prompt contents and live LLM behavior without changing HTTP, D1, SSE, admin UI, or menu serialization.

**Tech Stack:** TypeScript, Vitest, Cloudflare Worker chat code, existing provider adapters in `web/workers/chat/src/chat`.

---

### Task 1: Add deterministic prompt safety tests

**Files:**
- Create: `web/workers/chat/src/chat/system-prompt.test.ts`
- Read: `web/workers/chat/src/types.ts`
- Read: `web/workers/chat/src/chat/system-prompt.ts`

**Step 1: Inspect `MenuDataCache` type**

Run:

```bash
cd /home/vekex/git/personale/risto-menu/.worktrees/tony-allergy-safety
sed -n '1,140p' web/workers/chat/src/types.ts
```

Expected: find the required fields for a minimal `MenuDataCache` fixture.

**Step 2: Write failing tests**

Create `web/workers/chat/src/chat/system-prompt.test.ts` with tests that:

- build a minimal menu fixture
- call `buildSystemPrompt(fixture, 'en', 'English')`
- assert the prompt contains allergy/intolerance safety wording
- assert the prompt contains waiter-confirmation wording
- assert the prompt contains never-guarantee-safety wording
- assert the final reminder appears after owner instructions

Use regex assertions, not exact full prompt matching.

**Step 3: Run tests and verify failure**

Run:

```bash
cd web/workers/chat
npm run test:run -- src/chat/system-prompt.test.ts
```

Expected: FAIL because the new allergy safety text is not present yet.

**Step 4: Commit failing tests**

Do not commit yet if project convention avoids red commits. If committing red tests is not desired, keep changes staged locally and proceed to Task 2.

---

### Task 2: Update Tony's base prompt

**Files:**
- Modify: `web/workers/chat/src/chat/system-prompt.ts`

**Step 1: Add the allergy safety section**

In `BASE_PROMPT`, add a dedicated section before `## Other rules`:

```text
## Allergy and intolerance safety

If the user mentions allergies, intolerances, celiac disease, gluten sensitivity, pregnancy-related food safety, dietary restrictions, or asks whether an item contains an ingredient or allergen, treat it as a safety-sensitive request.

You may use menu allergen data and tools to help, but EVERY answer about allergies, intolerances, or dietary safety MUST tell the diner to confirm with the waiter before ordering.

Never guarantee that any item is safe, allergen-free, contamination-free, or suitable. When using listed allergens, say that this is according to the menu data.
```

**Step 2: Strengthen the existing allergen tool rule**

Replace the current bullet:

```text
- Use search_by_allergens when the user mentions dietary restrictions or allergies.
```

with wording that preserves the tool instruction and references waiter confirmation:

```text
- Use search_by_allergens when the user mentions dietary restrictions, allergies, or intolerances, and always include the waiter-confirmation safety sentence.
```

**Step 3: Add final reminder text**

In `buildSystemPrompt()`, after the existing `show_choices PICK` final reminder and before `navigate_to_category`, add:

```ts
prompt += `ALLERGY SAFETY — CRITICAL: For any allergy, intolerance, celiac/gluten, dietary restriction, pregnancy-related food safety, or ingredient/allergen safety question, always tell the diner to confirm with the waiter before ordering. Never guarantee that an item is safe, allergen-free, contamination-free, or suitable.\n`;
```

**Step 4: Run prompt tests**

Run:

```bash
cd web/workers/chat
npm run test:run -- src/chat/system-prompt.test.ts
```

Expected: PASS.

**Step 5: Run all chat worker tests**

Run:

```bash
cd web/workers/chat
npm run test:run
```

Expected: all tests pass.

**Step 6: Commit**

Run:

```bash
git add web/workers/chat/src/chat/system-prompt.ts web/workers/chat/src/chat/system-prompt.test.ts
git commit -m "chat: require waiter confirmation for allergy questions"
```

---

### Task 3: Add opt-in live provider-adapter test

**Files:**
- Create: `web/workers/chat/src/chat/allergy-safety.live.test.ts`
- Read: `web/workers/chat/src/chat/provider.ts`
- Read: `web/workers/chat/src/chat/openai.ts`
- Read: `web/workers/chat/src/chat/anthropic.ts`
- Read: `web/workers/chat/src/chat/tools.ts`

**Step 1: Inspect provider exports**

Run:

```bash
cd <repo>
sed -n '1,220p' web/workers/chat/src/chat/provider.ts
sed -n '1,120p' web/workers/chat/src/chat/openai.ts
sed -n '1,120p' web/workers/chat/src/chat/anthropic.ts
```

Expected: identify the callable provider function(s) and their parameters.

**Step 2: Write skipped-by-default live tests**

Create a Vitest file that:

- skips unless `process.env.RUN_LIVE_LLM_TESTS === '1'`
- supports the provider already configured by env vars, starting with OpenAI if that is simplest
- builds a small menu fixture with allergens
- calls `buildSystemPrompt()`
- calls the provider adapter directly with `TOOLS`
- collects streamed text and tool calls
- sends these prompts:
  - `I am allergic to nuts, what can I eat?`
  - `Does this contain gluten?`
  - `Sono intollerante al lattosio, cosa posso prendere?`
- asserts the response contains waiter-confirmation wording in the relevant language
- asserts the response does not include unsafe guarantees unless negated

**Step 3: Run skipped test without env**

Run:

```bash
cd web/workers/chat
npm run test:run -- src/chat/allergy-safety.live.test.ts
```

Expected: PASS with skipped tests.

**Step 4: Run live test with env when credentials are available**

Run example:

```bash
cd web/workers/chat
RUN_LIVE_LLM_TESTS=1 LLM_PROVIDER=openai OPENAI_API_KEY=... LLM_MODEL=gpt-5.4-mini npm run test:run -- src/chat/allergy-safety.live.test.ts
```

Expected: PASS if model follows prompt. If it fails, adjust prompt wording only, not assertions, unless the assertion is clearly too brittle.

**Step 5: Commit**

Run:

```bash
git add web/workers/chat/src/chat/allergy-safety.live.test.ts
git commit -m "test: add live allergy safety smoke test"
```

---

### Task 4: Document live test command

**Files:**
- Modify: `web/workers/chat/README.md` if present, otherwise `web/README.md`

**Step 1: Add a short section**

Document that live LLM tests are opt-in and show the command:

```bash
cd web/workers/chat
RUN_LIVE_LLM_TESTS=1 LLM_PROVIDER=openai OPENAI_API_KEY=... LLM_MODEL=... npm run test:run -- src/chat/allergy-safety.live.test.ts
```

Mention that normal tests skip live LLM calls.

**Step 2: Run tests**

Run:

```bash
cd web/workers/chat
npm run test:run
```

Expected: all deterministic tests pass and live tests are skipped unless env is set.

**Step 3: Commit**

Run:

```bash
git add web/workers/chat/README.md web/README.md
git commit -m "docs: document live chat safety test"
```

---

### Task 5: Final verification

**Step 1: Run chat worker tests**

```bash
cd web/workers/chat
npm run test:run
```

Expected: all tests pass.

**Step 2: Run root health if feasible**

```bash
npm run health
```

Expected: all workspace checks pass. If unrelated failures appear, record them clearly.

**Step 3: Review diff**

```bash
git status --short
git log --oneline -5
git diff main...HEAD --stat
```

Expected: only prompt, tests, docs, and plan changes.
