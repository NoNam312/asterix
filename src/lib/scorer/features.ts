// Turns a quest into model features: what kind of task it is, which study area, what level,
// modifier words and duration. Used by the app (model.ts) and the trainer (scripts/train-scorer.mjs).

import type { Category } from "../quests.ts";
import { AREAS, CODE_PREFIXES, EVERYDAY_WORD_ABBREVIATIONS, type Area } from "./areas.ts";
import {
  DOMAIN_CATEGORY,
  LEVEL_WORDS,
  MODIFIERS,
  TASK_TYPES,
  type Domain,
  type TaskType,
} from "./lexicon.ts";
import { matchPhrase, phrase, registerVocabulary, tokenize, type Phrase, type Tokens } from "./text.ts";

export type QuestInput = {
  title: string;
  notes?: string | null;
  category: Category;
  durationMin: number;
};

export type Features = {
  /** Feature name -> value, fed to the linear model. */
  x: Record<string, number>;
  /** remapped: a loose word reinterpreted because a subject is named ("calculus with friends"). */
  task?: { type: TaskType; phrase: string; remapped?: boolean };
  area?: { area: Area; phrase: string };
  level?: { value: number; label: string };
  modifiers: { id: string; label: string; phrase: string }[];
  multi: boolean;
  domain?: Domain;
  /** A subject named in a non-study quest ("Graphics and Interactions leg day"); not scored. */
  ignoredSubject?: { name: string; phrase: string };
  suggestedCategory?: Category;
};

// ---------- precomputed phrase tables ----------

const taskPhrases = TASK_TYPES.flatMap((type, order) =>
  type.words.map((w) => ({ type, order, p: phrase(w) })),
);
const areaPhrases = AREAS.flatMap((area) => area.terms.map((t) => ({ area, p: phrase(t) })));
const modifierPhrases = MODIFIERS.map((m) => ({ ...m, phrases: m.words.map(phrase) }));
const levelPhrases = LEVEL_WORDS.flatMap((l) => l.words.map((w) => ({ ...l, p: phrase(w) })));
const areaById = new Map(AREAS.map((a) => [a.id, a]));
const abbreviations = new Map(AREAS.flatMap((a) => (a.abbreviations ?? []).map((w) => [w, a] as const)));

/** An abbreviation in the quest, if the context makes it believable (see Area.abbreviations). */
function findAbbreviation(tokens: Tokens, studySignals: boolean) {
  if (!studySignals) return undefined;
  for (const word of tokens.raw) {
    const area = abbreviations.get(word);
    if (!area) continue;
    if (EVERYDAY_WORD_ABBREVIATIONS.has(word) && !tokens.upper.has(word)) continue;
    return { area, phrase: word.toUpperCase() };
  }
  return undefined;
}

registerVocabulary(
  [...taskPhrases, ...areaPhrases, ...levelPhrases].flatMap((e) => e.p.stems)
    .concat(modifierPhrases.flatMap((m) => m.phrases.flatMap((p) => p.stems))),
);
const knownWords = new Set(
  [...TASK_TYPES.flatMap((t) => t.words), ...AREAS.flatMap((a) => a.terms), ...MODIFIERS.flatMap((m) => m.words)]
    .flatMap((w) => w.toLowerCase().split(/[^a-z0-9]+/)),
);

const EFFORTFUL: Domain[] = ["study", "project", "career", "work", "fitness"];
/** Domains where a subject's difficulty matters. A leg day isn't harder because a subject is named. */
const KNOWLEDGE: Domain[] = ["study", "project", "career", "work"];

// ---------- helpers ----------

/** Best match = most words; ties go to the earliest entry. */
function bestMatch<T extends { p: Phrase }>(tokens: Tokens, entries: T[], tieBreak: (a: T, b: T) => number) {
  let best: T | undefined;
  for (const e of entries) {
    if (!matchPhrase(tokens, e.p)) continue;
    if (!best || e.p.stems.length > best.p.stems.length || (e.p.stems.length === best.p.stems.length && tieBreak(e, best) < 0)) {
      best = e;
    }
  }
  return best;
}

type TaskEntry = (typeof taskPhrases)[number];

/** Picks the task type with the strongest evidence: longest phrase, then most matched phrases. */
function bestTask(tokens: Tokens): TaskEntry | undefined {
  const byType = new Map<string, { best: TaskEntry; longest: number; total: number }>();
  for (const e of taskPhrases) {
    if (!matchPhrase(tokens, e.p)) continue;
    const s = byType.get(e.type.id) ?? { best: e, longest: 0, total: 0 };
    s.total += e.p.stems.length;
    if (e.p.stems.length > s.longest) Object.assign(s, { best: e, longest: e.p.stems.length });
    byType.set(e.type.id, s);
  }
  let winner: { best: TaskEntry; longest: number; total: number } | undefined;
  for (const s of byType.values()) {
    if (
      !winner ||
      s.longest > winner.longest ||
      (s.longest === winner.longest && s.total > winner.total) ||
      (s.longest === winner.longest && s.total === winner.total && s.best.order < winner.best.order)
    ) {
      winner = s;
    }
  }
  return winner?.best;
}

/** Hide words already explained by the subject ("Krebs cycle" shouldn't also mean cycling). */
function mask(tokens: Tokens, p: Phrase): Tokens {
  const hide = (list: string[]) => {
    for (let i = 0; i + p.stems.length <= list.length; i++) {
      if (p.stems.every((s, k) => list[i + k] === s)) {
        return [...list.slice(0, i), ...p.stems.map(() => "#"), ...list.slice(i + p.stems.length)];
      }
    }
    return list;
  };
  return { raw: tokens.raw, all: hide(tokens.all), content: hide(tokens.content), upper: tokens.upper };
}

/** Course codes: COMP30026, CS 101, MATH-2250, csc148. Returns level and a hinted area. */
function courseCode(tokens: Tokens) {
  const { raw } = tokens;
  for (let i = 0; i < raw.length; i++) {
    let prefix: string | undefined;
    let digits: string | undefined;
    const joined = raw[i].match(/^([a-z]{2,5})(\d{3,5})[a-z]?$/);
    if (joined) [, prefix, digits] = joined;
    else if (/^[a-z]{2,5}$/.test(raw[i]) && /^\d{3,5}[a-z]?$/.test(raw[i + 1] ?? "")) {
      prefix = raw[i];
      digits = raw[i + 1];
    }
    if (!prefix || !digits) continue;
    const area = CODE_PREFIXES[prefix] ? areaById.get(CODE_PREFIXES[prefix]) : undefined;
    // Unknown prefixes must look like a course code, not a word ("essay 2000 words").
    if (!area && (prefix.length > 4 || knownWords.has(prefix) || !/^[1-9]\d{2,4}$/.test(digits))) continue;
    const first = Number(digits[0]);
    const level = first <= 1 ? 2 : first === 2 ? 2.5 : first <= 4 ? 3 : 4;
    return { code: `${prefix.toUpperCase()}${digits}`, level, area };
  }
  return undefined;
}

// ---------- main ----------

export function extractFeatures(input: QuestInput): Features {
  const titleTokens = tokenize(input.title);
  const notesTokens = tokenize(input.notes ?? "");
  const x: Record<string, number> = { bias: 1 };

  // 1–2. Subject area and task type. When their phrases overlap, the longer phrase keeps the words:
  // "Krebs cycle" is biology (not cycling); "literature review" is an assessment (not English).
  const byDifficulty = (a: { area: Area }, b: { area: Area }) => b.area.difficulty - a.area.difficulty;
  let areaHit = bestMatch(titleTokens, areaPhrases, byDifficulty);
  let taskHit = bestTask(titleTokens);
  if (areaHit && taskHit) {
    if (taskHit.p.stems.length > areaHit.p.stems.length) {
      areaHit = bestMatch(mask(titleTokens, taskHit.p), areaPhrases, byDifficulty);
    } else {
      taskHit = bestTask(mask(titleTokens, areaHit.p));
    }
  }
  const areaInTitle = !!areaHit;
  areaHit ??= bestMatch(notesTokens, areaPhrases, byDifficulty);
  // The title sets the context: a study subject in the title means the notes' non-study words
  // ("row reduction" ≠ rowing) don't turn it into a workout.
  if (!taskHit) {
    const fromNotes = bestTask(notesTokens);
    if (fromNotes && !(areaInTitle && !["study", "project", "career", "work"].includes(fromNotes.type.domain))) {
      taskHit = fromNotes;
    }
  }
  const code = courseCode(titleTokens) ?? courseCode(notesTokens);

  let area: Features["area"];
  if (areaHit) area = { area: areaHit.area, phrase: areaHit.p.text };
  else if (code?.area) area = { area: code.area, phrase: code.code };

  // 3. Level: explicit words, else from the course code.
  const levelHit = bestMatch(titleTokens, levelPhrases, (a, b) => b.level - a.level) ??
    bestMatch(notesTokens, levelPhrases, (a, b) => b.level - a.level);
  let level: Features["level"];
  if (levelHit) level = { value: levelHit.level, label: levelHit.label };
  else if (code) level = { value: code.level, label: `Course code ${code.code}` };

  // Abbreviations (MOC, IT, PE) only count when something else says this is study.
  if (!area) {
    const studySignals = taskHit?.type.domain === "study" || !!level || !!code || input.category === "study";
    area = findAbbreviation(titleTokens, studySignals) ?? findAbbreviation(notesTokens, studySignals);
  }

  const studyContext = !!area || !!level || !!code;

  let task: Features["task"];
  if (taskHit) {
    let type = taskHit.type;
    let remapped = false;
    // "project", "design", "friends"... mean coursework or studying when there's a subject involved.
    if (studyContext && type.studyAlt?.words.includes(taskHit.p.text)) {
      type = TASK_TYPES.find((t) => t.id === type.studyAlt!.type)!;
      remapped = true;
    }
    task = { type, phrase: taskHit.p.text, remapped };
  }

  // 4. Domain: from the task, else study if there's a subject, else the chosen category.
  const domain: Domain | undefined = task?.type.domain ?? (studyContext ? "study" : undefined);
  let ignoredSubject: Features["ignoredSubject"];
  if (domain && !KNOWLEDGE.includes(domain)) {
    // Only warn about a subject named in the title; notes are often lists (exercises, links…).
    if (area && areaInTitle) ignoredSubject = { name: area.area.name, phrase: area.phrase };
    area = undefined;
    level = undefined;
  }

  if (task) x[`task:${task.type.id}`] = 1;
  else if (studyContext) x["task:general-study"] = 1;
  else x[`default:${input.category}`] = 1;

  if (area) {
    x["area:has"] = 1;
    x["area:difficulty"] = area.area.difficulty - 3;
  }
  if (level) {
    x["level:has"] = 1;
    x["level:value"] = level.value - 2;
  }

  // 5. Modifiers (title and notes).
  const modifiers: Features["modifiers"] = [];
  for (const m of modifierPhrases) {
    const hit = m.phrases.find((p) => matchPhrase(titleTokens, p) || matchPhrase(notesTokens, p));
    if (hit) {
      modifiers.push({ id: m.id, label: m.label, phrase: hit.text });
      x[`mod:${m.id}`] = 1;
    }
  }

  // 6. Several of something: "3 lectures", "chapters 4-6", "weeks 1-3".
  const text = `${input.title} ${input.notes ?? ""}`.toLowerCase();
  const multi =
    /\b([2-9]|1\d)\s+[a-z]+s\b/.test(text) || /\b\d+\s*[-–]\s*\d+\b/.test(text) || /\bx\s?[2-9]\b/.test(text);
  if (multi) x.multi = 1;

  // 7. Duration, with separate weights for effortful and light tasks.
  const duration = Math.log2(1 + Math.max(5, input.durationMin) / 30);
  const effortful = domain ? EFFORTFUL.includes(domain) : input.category === "study" || input.category === "gym";
  x[effortful ? "duration:effort" : "duration:light"] = duration;

  return {
    x,
    task,
    area,
    level,
    modifiers,
    multi,
    domain,
    ignoredSubject,
    suggestedCategory: domain ? DOMAIN_CATEGORY[domain] : undefined,
  };
}
