---
name: generate-process-map
description: >-
  Generate valid workflow JSON (nodes and edges), compatible with @xyflow/react v12.
  Use when creating process maps, building conversation flows, generating workflow JSON,
  or when the user mentions workflow nodes, sections, transitions, or
  instruction graphs.
---

# Generating Process Map for React Flow

This skill documents how to produce valid `{ nodes, edges }` JSON that 
React Flow (backed by `@xyflow/react` v12) can render and persist.
The JSON is stored in a database and passed directly as `initialNodes` / `initialEdges`
to React Flow.

## Core Concepts

The workflow is a directed graph of **sections** containing **content nodes**
(question, speech, answer), connected across sections by **transition** nodes.
Actions and conditions are *data on transition nodes*, not separate node types.

There are exactly **5 registered node types**: `section`, `transition`,
`question`, `speech`, `answer`.

### Branching: Prefer Conditional Transitions Over Answer Nodes

When a workflow needs to branch based on a caller's response, **always prefer
using a `transition` node with `transitionType: "conditional"` over `answer`
nodes**. Conditional transitions provide labeled enum-based branches that each
connect to a distinct section, making the flow explicit and maintainable.
Within a single section, use **one** branching strategy — never both.

**Use conditional transitions when:**
- Routing the caller down different paths based on their response
- The set of possible outcomes is known (e.g. "Medical" vs "Admin")
- You need each branch to lead to a separate section

**Only use `answer` nodes when:**
- You need to match a specific response pattern *within* the same section
  without leaving it (e.g. displaying a sub-prompt inline)
- The branching does not require crossing section boundaries

---

## Node Schema

Every node must include these @xyflow/react fields:

```json
{
  "id": "string",
  "type": "section | transition | question | speech | answer",
  "position": { "x": 0, "y": 0 },
  "data": { }
}
```

Optional fields depending on context:

| Field | When Used |
|-------|-----------|
| `parentId` | Content nodes nested inside a section |
| `extent` | Always `"parent"` when `parentId` is set |
| `zIndex` | `-1` for section nodes (so children render above) |
| `style` | `{ "width": N, "height": N }` for section nodes (see Section Sizing) |

### Section Sizing

Section `style.width` and `style.height` must be large enough to contain all
child nodes. Calculate based on the number of content nodes (questions, speech,
answers) inside the section:

- **Width**: `600` (fixed default — increase if child labels are very long).
- **Height**: `80 + (N × 160)` where `N` is the number of content nodes.
  - `80` accounts for the section header and top padding.
  - `160` per node covers the node height (~88px) plus vertical spacing (~72px).
  - Minimum height: `300`.

Examples:

| Content nodes | Height |
|---------------|--------|
| 1 | 300 (minimum) |
| 2 | 400 |
| 3 | 560 |
| 4 | 720 |

Child node positions inside the section should be spaced vertically to match:
- First child: `{ "x": 50, "y": 50 }`
- Each subsequent child: increment `y` by `160`
  (e.g. second at `y: 210`, third at `y: 370`)

### Section Layout

Place `section_start` at the top of the canvas (e.g. `{ "x": 100, "y": 0 }`).
All subsequent sections flow **below** it. Calculate each section's `y`
position by stacking vertically with spacing for the transition node between
them:

```
next_section_y = previous_section_y + previous_section_height + 200
```

The `200` gap leaves room for the transition node (~50px) plus comfortable
visual spacing. When a conditional transition fans out to multiple sections,
spread them horizontally (increment `x` by `700` per branch) at the same `y`.

### ID Conventions

- Start section: `"section_start"`
- Start question: `"question_start"`
- All others: `"${type}_${timestamp}"` (e.g. `"section_1713000000000"`)
- These two IDs are protected from deletion and must not be reused.

---

## Node Types in Detail

### `section`

Container for content nodes. Renders as a resizable box. Size the section
to fit its children (see Section Sizing above).

```json
{
  "id": "section_start",
  "type": "section",
  "position": { "x": 100, "y": 100 },
  "zIndex": -1,
  "style": { "width": 600, "height": 400 },
  "data": {
    "label": "Answer script",
    "guardrails": "",
    "knowledge": ""
  }
}
```

In this example, `height: 400` fits ~2 content nodes. Adjust per the formula.

| data field | type | required | description |
|------------|------|----------|-------------|
| `label` | string | yes | Display name (default `"New Section"`) |
| `guardrails` | string | no | Behavioral constraints for this section |
| `knowledge` | string | no | Domain knowledge scoped to this section |

Handles: target=Top, source=Bottom (bottom not user-connectable).

Rules:
- At most **one** transition node per section (enforced by UI).
- Section source handle has `isConnectable={false}`; edges from sections are
  created programmatically, not by dragging.

### `question`

Asks the caller a question and collects their response.

```json
{
  "id": "question_start",
  "type": "question",
  "position": { "x": 50, "y": 50 },
  "data": {
    "label": "How can I help you today?",
    "parent": "section_start",
    "rules": "",
    "intent": "",
    "required_info": "",
    "example_prompts": "",
    "example_answers": "",
    "example_summaries": "",
    "use_ai_intent": false,
    "auto_confirm": false
  },
  "parentId": "section_start",
  "extent": "parent"
}
```

| data field | type | required | description |
|------------|------|----------|-------------|
| `label` | string | yes | The question text |
| `parent` | string | yes | ID of parent node (section or prior content node) |
| `rules` | string | no | Constraints on how to ask / accept answers |
| `intent` | string | no | What information to extract (used with `use_ai_intent`) |
| `required_info` | string | no | Specific info the agent must collect |
| `example_prompts` | string | no | Example ways to ask the question |
| `example_answers` | string | no | Example valid answers |
| `example_summaries` | string | no | Example confirmation summaries |
| `use_ai_intent` | boolean | no | Let AI decide how to phrase the question |
| `auto_confirm` | boolean | no | Re-confirm the answer with the caller |

Handles: target=Top, source=Bottom.

### `speech`

Agent speaks a message to the caller (no response expected).

```json
{
  "id": "speech_1713000000001",
  "type": "speech",
  "position": { "x": 50, "y": 150 },
  "data": {
    "label": "Please hold whilst we redirect your call",
    "parent": "section_start"
  },
  "parentId": "section_start",
  "extent": "parent"
}
```

| data field | type | required | description |
|------------|------|----------|-------------|
| `label` | string | yes | Text the agent will speak |
| `parent` | string | yes | ID of parent node |

Handles: target=Top, source=Bottom.

### `answer` (not preferred for branching — see above)

Represents a specific caller response. **Avoid using answer nodes for
branching logic**; use conditional transitions instead. Answer nodes should
only be used for inline response matching within a section where no
cross-section routing is needed. Do not combine answer nodes with a
conditional transition in the same section.

```json
{
  "id": "answer_1713000000002",
  "type": "answer",
  "position": { "x": 50, "y": 250 },
  "data": {
    "label": "Yes, I need help with appointments",
    "parent": "question_start",
    "intent": "",
    "rules": ""
  },
  "parentId": "section_start",
  "extent": "parent"
}
```

| data field | type | required | description |
|------------|------|----------|-------------|
| `label` | string | yes | The answer value / condition text |
| `parent` | string | yes | ID of parent node |
| `intent` | string | no | Semantic intent to match |
| `rules` | string | no | Rules for matching this answer |

Handles: target=Top, source=Bottom.

### `transition`

Controls flow between sections. Can be a simple link, a conditional branch,
or an action trigger. Transition nodes sit **outside** sections (no `parentId`
on the React Flow node itself) but track their section via `data.parentId`.

```json
{
  "id": "transition_1713000000003",
  "type": "transition",
  "position": { "x": 120, "y": 550 },
  "data": {
    "parentId": "section_start",
    "transitionType": "next_section",
    "actionType": null,
    "actionData": {},
    "conditions": []
  }
}
```

| data field | type | required | description |
|------------|------|----------|-------------|
| `parentId` | string | yes | The section this transition belongs to |
| `transitionType` | string/null | yes | `null`, `"next_section"`, `"conditional"`, or `"action"` |
| `actionType` | string/null | conditional | Required when `transitionType === "action"` |
| `actionData` | object | conditional | Action-specific config (see Action Types) |
| `conditions` | array | conditional | Required for conditional transitions and conditional actions |

#### Transition Handles

| transitionType | Source Handle |
|----------------|--------------|
| `next_section` | Bottom |
| `action` (non-conditional) | Bottom |
| `action` (conditional) | Right, one per enum value ID |
| `conditional` | Right, one per enum value ID |

All transitions always have a target handle at Top.

#### Conditions Format

```json
{
  "conditions": [
    {
      "id": "cond_1713000000004",
      "description": "What is the patient's age?",
      "enumValues": [
        {
          "id": "enum_1713000000005",
          "value": "18",
          "operator": ">="
        }
      ]
    }
  ]
}
```

- `id`: unique string, prefix with `cond_`
- `description`: information to extract (optional for action-based conditionals)
- `enumValues[].id`: unique string, prefix with `enum_` — used as the
  `sourceHandle` on edges
- `enumValues[].value`: display label
- `enumValues[].operator`: only present when the action has
  `conditional_comparison: true` (e.g. `calculate_age`). One of:
  `==`, `!=`, `>`, `<`, `>=`, `<=`

---

## Action Types Reference

Actions are configured on transition nodes where `transitionType === "action"`.
Set `data.actionType` to one of the keys below and populate `data.actionData`.

| actionType | Title | link_next_section | conditional | actionData fields |
|------------|-------|-------------------|-------------|-------------------|
| `redirect` | Redirect the call to a human | false | false | `{ message: "phone number" }` |
| `send_sms` | Send SMS | true | false | `{ message: "sms body" }` |
| `label_call` | Label call | true | false | `{ message: "label text" }` |
| `skip_form_fill` | Skip form fill | true | false | `{}` |
| `email_transcript` | Email transcript | true | false | `{ to: "email" }` |
| `calculate_age` | Calculate age | false | true (comparison) | `{}` |
| `evaluate_issue_for_pharmacy` | Eligible for pharmacy first? | false | true | `{}` |
| `pds_lookup` | Patient lookup | false | true | `{ odsCode: "code" }` |
| `list_hero_appointments` | List appointments | true | false | `{}` |
| `list_hero_bookable_slots` | List bookable slots | true | false | `{ appointmentTypes, locations, practitioners, reusePreviousFilters }` |
| `book_hero_appointment` | Book appointment | false | true | `{}` |
| `cancel_hero_appointment` | Cancel appointment | false | true | `{}` |
| `reschedule_hero_appointment` | Reschedule appointment | false | true | `{}` |

**Flags explained:**
- `link_next_section: true` — the transition gets a bottom source handle and
  should link to a follow-up section via a `smoothstep` edge.
- `conditional: true` — the transition uses right-side source handles, one per
  enum value. Each connects to a different section.

### Default Conditional Enum Values

Some conditional actions auto-populate `enumValues`:

| actionType | Default enums |
|------------|---------------|
| `evaluate_issue_for_pharmacy` | `["Yes", "No", "Sex not provided"]` |
| `pds_lookup` | `["Patient found", "Patient not found"]` |
| `book_hero_appointment` | `["Appointment booked", "Slot not available"]` |
| `cancel_hero_appointment` | `["Appointment cancelled", "Appointment cannot be cancelled"]` |
| `reschedule_hero_appointment` | `["Appointment rescheduled", "Slot not available", "Appointment cannot be rescheduled"]` |
| `calculate_age` | No default enums; user defines them. Uses `operator` field. |

---

## Edge Schema

```json
{
  "id": "source_id-target_id",
  "source": "source_node_id",
  "target": "target_node_id",
  "type": "smoothstep",
  "sourceHandle": null,
  "label": null
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique string, convention: `"${source}-${target}"` |
| `source` | yes | Source node ID |
| `target` | yes | Target node ID |
| `type` | yes | `"smoothstep"` for programmatic edges, `"default"` for user-drawn |
| `sourceHandle` | no | Set to an `enumValues[].id` for conditional branches |
| `label` | no | Human-readable label; set from enum value (or `"Operator Value"` for comparison actions) |

### Edge Type Behavior

- **`smoothstep`**: Created programmatically (section→transition,
  transition→section, parent→child). Not selectable/deletable by clicking.
- **`default`**: Created by user drag-connect. Selectable and deletable via
  Delete key.

When generating JSON programmatically, use `"smoothstep"` for all edges.

### Connection Rules

1. Nodes inside a section cannot connect to nodes in a *different* section.
2. **Exception**: A `transition` node (source) can connect to a `section` node
   (target) — this is the only way to cross section boundaries.
3. No edge is created between a section and its first child content node; the
   child simply has `parentId` set.
4. Edges between content nodes within a section use `smoothstep` and connect
   source (bottom handle) → target (top handle).
5. **Each source handle on a transition node must have exactly one outgoing
   edge.** A given `sourceHandle` value (e.g. an `enumValues[].id`, or the
   bottom handle for `next_section`/`action`) may appear on at most one edge.
   Do not create multiple edges from the same handle.

---

## Minimal Valid Workflow

Every workflow must have at least a start section and start question:

```json
{
  "nodes": [
    {
      "id": "section_start",
      "type": "section",
      "position": { "x": 100, "y": 100 },
      "zIndex": -1,
      "style": { "width": 600, "height": 400 },
      "data": { "label": "Answer script" }
    },
    {
      "id": "question_start",
      "type": "question",
      "position": { "x": 50, "y": 50 },
      "data": {
        "label": "How can I help you today?",
        "parent": "section_start"
      },
      "parentId": "section_start",
      "extent": "parent"
    }
  ],
  "edges": []
}
```

---

## Complete Example: Multi-Section Workflow

A workflow with multiple questions, answer branches and a redirect action:

```json
{
  "nodes": [{"id":"section_start","type":"section","position":{"x":-180.383572288531,"y":-1372.9134262327912},"zIndex":-1,"style":{"width":600,"height":400},"data":{"label":"Answer script"},"measured":{"width":452,"height":300},"selected":false,"dragging":false,"width":451.55188892275646,"height":300,"resizing":false},{"id":"question_start","type":"question","position":{"x":79.83214377118128,"y":90.00870916692497},"data":{"label":"Hello, you've reached ABC Medical. Are you calling on behalf of yourself or someone else?","parent":"section_start","rules":"","intent":"","required_info":"","example_prompts":"","example_answers":"","example_summaries":"","use_ai_intent":false,"auto_confirm":false},"parentId":"section_start","extent":"parent","measured":{"width":324,"height":136},"selected":false,"dragging":false},{"id":"transition_1770655026831","type":"transition","position":{"x":-65.87676768730417,"y":-973.2434258457812},"data":{"parentId":"section_start","transitionType":"conditional","conditions":[{"id":"cond_1770655028841","description":"Calling for","enumValues":[{"id":"enum_1770655040831","value":"Myself"},{"id":"enum_1770655043870","value":"Someone else"}]}]},"measured":{"width":223,"height":45},"selected":false,"dragging":false},{"id":"section_1770655049668","type":"section","position":{"x":142.8247883888822,"y":-821.8943440215485},"data":{"label":"Section for Someone else"},"zIndex":-1,"style":{"width":600,"height":400},"measured":{"width":400,"height":300},"selected":false,"dragging":false,"width":400,"height":300,"resizing":false},{"id":"speech_1770655061506","type":"speech","position":{"x":47.50720215290852,"y":83.15931920664775},"data":{"parent":"section_1770655049668","label":"I believe a member of our reception team may be better suited to assisting you."},"parentId":"section_1770655049668","extent":"parent","measured":{"width":324,"height":136},"selected":false,"dragging":false},{"id":"transition_1770655073358","type":"transition","position":{"x":208.88102948079518,"y":-454.7372951801482},"data":{"parentId":"section_1770655049668","transitionType":"action","actionType":"redirect","actionData":{"message":"+447123456789"}},"measured":{"width":271,"height":45},"selected":false,"dragging":false},{"id":"section_1770655088700","type":"section","position":{"x":165.15266162354413,"y":-351.04935191611304},"data":{"label":"Redirect message"},"zIndex":-1,"style":{"width":600,"height":400},"measured":{"width":400,"height":300},"selected":false,"dragging":false,"width":400,"height":300,"resizing":false},{"id":"speech_1770655088701","type":"speech","position":{"x":39.27542549584507,"y":83.24618096288013},"data":{"label":"Please hold whilst we redirect your call","parent":"section_1770655088700"},"parentId":"section_1770655088700","extent":"parent","measured":{"width":324,"height":112},"selected":false,"dragging":false},{"id":"section_1770655114462","type":"section","position":{"x":-916.2805960282412,"y":-876.4713893919527},"data":{"label":"Section for Myself","guardrails":"","knowledge":""},"zIndex":-1,"style":{"width":600,"height":400},"measured":{"width":400,"height":519},"selected":false,"dragging":false,"width":400,"height":519,"resizing":false},{"id":"question_1770655155164","type":"question","position":{"x":18.8279666094611,"y":43.860166952694215},"data":{"parent":"section_1770655114462","label":"What is your name?","rules":"Collect both names","intent":"Collect_caller_details","required_info":"first_name\nlast_name","example_prompts":"Could you pleae confirm your first and last name and spell it for me?","example_answers":"Jane Smith, J A N E S M I T H \nAndrea Rob-Jones, A N D R E A R O B J O N E S","example_summaries":"Just to confirm, your full name is [first_name] [last_name], is that correct?","use_ai_intent":true,"auto_confirm":true},"parentId":"section_1770655114462","extent":"parent","measured":{"width":184,"height":88},"selected":false,"dragging":false},{"id":"question_1770655188834","type":"question","position":{"x":70.79205569575072,"y":199.86016695269427},"data":{"parent":"question_1770655155164","label":"What is your Date of Birth?","rules":"check in dd/mm/yyyy format or check in dd/mm/yy format","intent":"collect_caller_details","required_info":"dob","example_prompts":"What is your date of birth?","example_answers":"01/04/96\n20/03/2001\n10/05/05\n11/07/1976","example_summaries":"Your date of birth is [dob], is that correct?","use_ai_intent":true,"auto_confirm":true},"parentId":"section_1770655114462","extent":"parent","measured":{"width":236,"height":88},"selected":false,"dragging":false},{"id":"transition_1770655534139","type":"transition","position":{"x":-838.2666492930572,"y":-247.5556861771581},"data":{"parentId":"section_1770655114462","transitionType":"action","actionType":"pds_lookup","conditions":[{"id":"cond_1770655542585","description":"","enumValues":[{"id":"enum_1770655542585_4orzzzgo4","value":"Patient found"},{"id":"enum_1770655542585_zx1orta9j","value":"Patient not found"}]}],"actionData":{}},"measured":{"width":243,"height":45},"selected":false,"dragging":false},{"id":"section_1770655559246","type":"section","position":{"x":-877.4667792336784,"y":-144.4987675202283},"data":{"label":"Section for Medical or Admin"},"zIndex":-1,"style":{"width":600,"height":400},"measured":{"width":460,"height":300},"selected":false,"dragging":false,"width":460.0829945777384,"height":300,"resizing":false},{"id":"question_1770655595322","type":"question","position":{"x":85.58557045264888,"y":93.37664325095994},"data":{"parent":"section_1770655559246","label":"Is you query a Medical or Admin request?","rules":"","intent":"","required_info":"","example_prompts":"","example_answers":"","example_summaries":"","use_ai_intent":false,"auto_confirm":false},"parentId":"section_1770655559246","extent":"parent","measured":{"width":324,"height":112},"selected":false,"dragging":false},{"id":"question_1772808969402","type":"question","position":{"x":97.95506173735282,"y":342.76262084480345},"data":{"parent":"question_1770655188834","label":"What is your Post Code?","rules":"Capture and validate response","intent":"collect_postcode","required_info":"postcode","example_prompts":"What is your full Post Code?","example_answers":"N3 3AP\nN12 4AQ\nMK4 3PQ","example_summaries":"Your post code is [postcode] is that right?","use_ai_intent":true,"auto_confirm":true},"parentId":"section_1770655114462","extent":"parent","measured":{"width":220,"height":88},"selected":false,"dragging":false},{"id":"transition_1776069969811","type":"transition","position":{"x":-926.3553280500574,"y":199.03711158173132},"data":{"parentId":"section_1770655559246","transitionType":"conditional","conditions":[{"id":"cond_1776069971976","description":"Medical or admin","enumValues":[{"id":"enum_1776069977323","value":"Medical"},{"id":"enum_1776069977693","value":"Admin"}]}]},"measured":{"width":223,"height":45},"selected":false,"dragging":false},{"id":"section_1776069980338","type":"section","position":{"x":-1330.6957790301103,"y":350.3004720918219},"data":{"label":"Section for Medical"},"zIndex":-1,"style":{"width":600,"height":400},"measured":{"width":600,"height":400},"selected":false,"dragging":false},{"id":"question_1776069988308","type":"question","position":{"x":141.5979148712495,"y":157.0217588602777},"data":{"parent":"section_1776069980338","label":"Please describe the medical problem","rules":"Identify the medical issue","intent":"assess_medical_issue","required_info":"issue_status","example_prompts":"Please describe the medical problem, for example back pain?\nWhat is the medical problem you are experiencing?","example_answers":"I have a cough thats been getting worse\nBack pain","example_summaries":"","use_ai_intent":true,"auto_confirm":false},"parentId":"section_1776069980338","extent":"parent","measured":{"width":313,"height":88},"selected":false,"dragging":false},{"id":"section_1776070039900","type":"section","position":{"x":-570.2296101906751,"y":360.9258996292008},"data":{"label":"Section for Admin"},"zIndex":-1,"style":{"width":600,"height":400},"measured":{"width":600,"height":400},"selected":false,"dragging":false},{"id":"question_1776070049137","type":"question","position":{"x":185.1329708128082,"y":151.01692355799378},"data":{"parent":"section_1776070039900","label":"What administrative issue?","rules":"","intent":"","required_info":"","example_prompts":"","example_answers":"","example_summaries":"","use_ai_intent":false,"auto_confirm":false},"parentId":"section_1776070039900","extent":"parent","measured":{"width":236,"height":88},"selected":false,"dragging":false}],
  "edges": [{"id":"section_start-transition_1770655026831","source":"section_start","target":"transition_1770655026831","type":"smoothstep"},{"id":"transition_1770655026831-section_1770655049668","source":"transition_1770655026831","target":"section_1770655049668","sourceHandle":"enum_1770655043870","type":"smoothstep","label":"Someone else"},{"id":"section_1770655049668-transition_1770655073358","source":"section_1770655049668","target":"transition_1770655073358","type":"smoothstep"},{"id":"transition_1770655073358-section_1770655088700","source":"transition_1770655073358","target":"section_1770655088700","type":"smoothstep"},{"id":"transition_1770655026831-section_1770655114462","source":"transition_1770655026831","target":"section_1770655114462","sourceHandle":"enum_1770655040831","type":"smoothstep","label":"Myself"},{"id":"question_1770655155164-question_1770655188834","source":"question_1770655155164","target":"question_1770655188834","type":"smoothstep"},{"id":"section_1770655114462-transition_1770655534139","source":"section_1770655114462","target":"transition_1770655534139","type":"smoothstep"},{"id":"transition_1770655534139-section_1770655559246","source":"transition_1770655534139","target":"section_1770655559246","sourceHandle":"enum_1770655542585_4orzzzgo4","type":"smoothstep","label":"Patient found"},{"source":"transition_1770655534139","sourceHandle":"enum_1770655542585_zx1orta9j","target":"section_1770655049668","type":"default","label":"Patient not found","id":"xy-edge__transition_1770655534139enum_1770655542585_zx1orta9j-section_1770655049668"},{"id":"question_1770655188834-question_1772808969402","source":"question_1770655188834","target":"question_1772808969402","type":"smoothstep"},{"id":"section_1770655559246-transition_1776069969811","source":"section_1770655559246","target":"transition_1776069969811","type":"smoothstep"},{"id":"transition_1776069969811-section_1776069980338","source":"transition_1776069969811","target":"section_1776069980338","sourceHandle":"enum_1776069977323","type":"smoothstep","label":"Medical"},{"id":"transition_1776069969811-section_1776070039900","source":"transition_1776069969811","target":"section_1776070039900","sourceHandle":"enum_1776069977693","type":"smoothstep","label":"Admin"}]
}
```

---

## Checklist for Valid Workflow JSON

1. `section_start` and `question_start` nodes always exist
2. Every content node inside a section has `parentId`, `extent: "parent"`, and
   `data.parent` set to its logical parent node ID
3. Section nodes have `zIndex: -1` and `style: { width, height }`
4. Transition nodes are **not** nested in sections (`parentId` is absent on the
   node); they reference their section via `data.parentId`
5. At most one transition per section
6. Edge IDs follow `"${source}-${target}"` convention
7. All programmatic edges use `type: "smoothstep"`
8. Conditional edges set `sourceHandle` to the corresponding `enumValues[].id`
   and include a `label`
9. No edges connect content nodes across different sections (only transitions
   can bridge sections)
10. Position values for children inside sections are **relative** to the section
11. Each source handle on a transition node has **at most one** outgoing edge —
    never two edges sharing the same `sourceHandle`
