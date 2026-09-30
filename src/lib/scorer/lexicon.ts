// Task types, modifier words and level clues for the quest scorer.
// Longer phrases win over shorter ones; on a tie, earlier task types win.

import type { Category } from "../quests.ts";

export type Domain =
  | "study"
  | "project"
  | "career"
  | "work"
  | "fitness"
  | "chore"
  | "errand"
  | "admin"
  | "social"
  | "selfcare"
  | "hobby";

export type TaskType = {
  id: string;
  label: string;
  domain: Domain;
  words: string[];
  /** Generic words that mean something else in a study context ("project" -> assignment). */
  studyAlt?: { words: string[]; type: string };
};

export const TASK_TYPES: TaskType[] = [
  { id: "exam", label: "Exam", domain: "study", words: [
    "exam", "exams", "final exam", "final exams", "finals", "midterm", "midterms", "mid sem", "midsem",
    "mid semester exam", "test", "mock exam", "trial exam", "trials", "sac", "sit exam", "oral exam",
    "practical exam", "prac exam", "class test", "unit test", "end of year exam", "board exam", "exam day",
  ] },
  { id: "exam-prep", label: "Exam prep", domain: "study", words: [
    "past paper", "past papers", "past exam", "past exams", "practice exam", "practice exams", "practice test",
    "practice tests", "sample exam", "mock paper", "exam revision", "exam prep", "exam preparation", "cram",
    "cramming", "revision for exam", "study for exam", "study for test", "study for final", "revise for exam",
    "oral exam practice", "exam practice", "test prep",
  ] },
  { id: "assessment", label: "Major assessment", domain: "study", words: [
    "assignment", "assignments", "assessment", "essay", "essays", "lab report", "research report", "thesis",
    "dissertation", "coursework", "ia", "internal assessment", "extended essay", "research paper", "capstone",
    "group project", "school project", "uni project", "case study", "literature review", "lit review",
    "research proposal", "major work", "sat task", "folio", "report", "ass",
  ] },
  { id: "quiz", label: "Quiz", domain: "study", words: ["quiz", "quizzes", "pop quiz", "online quiz", "spelling test", "vocab test", "mcq"] },
  { id: "problems", label: "Problem solving", domain: "study", words: [
    "problem set", "problem sets", "pset", "psets", "homework", "hw", "worksheet", "worksheets", "exercise sheet",
    "exercises", "questions", "practice questions", "practice problems", "problems", "tutorial", "tutorials",
    "tute", "tutes", "tut", "workshop", "lab", "labs", "prac", "practical", "textbook questions", "proofs",
    "derivations", "exam questions",
  ] },
  { id: "class", label: "Class", domain: "study", words: [
    "lecture", "lectures", "lec", "lecs", "class", "classes", "seminar", "seminars", "lesson", "lessons", "webinar",
    "lecture recording", "recorded lecture", "school", "uni", "go to uni", "go to school", "tafe",
  ] },
  { id: "study-session", label: "Study session", domain: "study", words: [
    "study", "revise", "revision", "learn", "memorise", "memorize", "go over", "catch up on", "catch up on lectures",
    "study session", "study group", "self study", "content review", "subject", "subjects", "unit", "topic",
    "topics", "module", "course content", "coursework review",
  ] },
  { id: "light-study", label: "Reading and review", domain: "study", words: [
    "flashcards", "flashcard", "flash cards", "anki", "notes", "note taking", "make notes", "rewrite notes",
    "read", "readings", "chapter", "chapters", "textbook", "skim", "summary", "summarise", "summarize", "recap",
    "review", "glossary", "watch video", "khan academy", "quizlet",
  ] },
  { id: "project-build", label: "Building", domain: "project", words: [
    "build", "code", "coding", "develop", "implement", "program", "deploy", "ship", "launch", "feature", "features",
    "bug", "bugs", "fix bug", "bug fix", "refactor", "website", "web app", "app", "portfolio website",
    "portfolio site", "side project", "personal project", "github", "open source", "hackathon", "prototype", "mvp",
    "script", "automation", "bot", "set up", "setup", "integrate", "database", "api", "landing page", "extension",
    "project", "portfolio",
  ], studyAlt: { words: ["project", "portfolio", "presentation", "code", "coding", "program"], type: "assessment" } },
  { id: "project-design", label: "Designing", domain: "project", words: [
    "design", "redesign", "mockup", "mockups", "wireframe", "wireframes", "figma", "logo", "ui", "user flow",
    "style guide", "moodboard", "mood board",
  ], studyAlt: { words: ["design"], type: "assessment" } },
  { id: "project-plan", label: "Planning", domain: "project", words: [
    "brainstorm", "brainstorming", "outline", "roadmap", "ideation", "project plan", "project planning", "spec",
    "research ideas", "plan project", "plan the project", "user stories",
  ], studyAlt: { words: ["outline", "brainstorm", "brainstorming"], type: "study-session" } },
  { id: "project-content", label: "Writing and content", domain: "project", words: [
    "blog post", "blog", "write up", "writeup", "readme", "documentation", "docs", "article", "newsletter",
    "video script", "edit video", "video editing", "youtube video", "content", "podcast episode", "portfolio case study",
  ] },
  { id: "career", label: "Career", domain: "career", words: [
    "resume", "cv", "cover letter", "cover letters", "job application", "job applications", "apply for jobs",
    "apply for job", "internship application", "internship applications", "apply for internship",
    "apply for internships", "grad application", "grad applications", "interview prep", "interview practice",
    "mock interview", "linkedin", "networking event", "coding interview", "job search", "career fair",
    "internship", "internships", "job hunting", "applications", "portfolio review", "grad program",
  ] },
  { id: "work", label: "Work", domain: "work", words: [
    "work", "shift", "work shift", "meeting", "meetings", "standup", "client", "clients", "timesheet", "work report",
    "overtime", "onboarding", "tutoring", "tutor", "babysitting", "part time job", "casual shift", "retail shift",
  ] },
  { id: "fitness-heavy", label: "Hard training", domain: "fitness", words: [
    "leg day", "deadlift", "deadlifts", "squat", "squats", "hiit", "sprint", "sprints", "10k", "15k", "21k",
    "half marathon", "marathon", "crossfit", "intervals", "long run", "max out", "pr attempt", "bootcamp",
    "tempo run", "hill sprints", "triathlon", "powerlifting", "hyrox",
  ] },
  { id: "fitness", label: "Workout", domain: "fitness", words: [
    "workout", "work out", "gym", "lift", "lifting", "weights", "push day", "pull day", "upper body", "lower body",
    "chest day", "back day", "arm day", "arms", "shoulders", "core", "abs", "full body", "run", "running", "jog",
    "jogging", "5k", "swim", "swimming", "cycle", "cycling", "bike ride", "training", "cardio", "boxing", "climbing",
    "bouldering", "football", "soccer", "basketball", "netball", "tennis", "badminton", "volleyball", "rugby",
    "hockey", "cricket", "martial arts", "bjj", "muay thai", "karate", "judo", "dance class", "spin class", "rowing",
    "calisthenics", "pushups", "push ups", "pull ups", "plank", "hike", "hiking", "surf", "surfing", "skate",
    // exercise names, so a workout list in the notes reads as gym ("Hammer Curls - 7kg")
    "curls", "bicep curls", "hammer curls", "lat pulldowns", "lat pull downs", "pulldowns", "pull downs",
    "bench press", "shoulder press", "overhead press", "leg press", "lunges", "dips", "tricep extensions",
    "lateral raises", "cable rows", "high rows", "seated rows", "reps",
  ], studyAlt: { words: ["run", "running", "training", "core", "lift", "cycle"], type: "study-session" } },
  { id: "fitness-light", label: "Light activity", domain: "fitness", words: [
    "walk", "walking", "stretch", "stretching", "yoga", "mobility", "cooldown", "cool down", "pilates", "light jog",
    "steps", "foam roll", "foam rolling",
  ] },
  { id: "chore-big", label: "Big chore", domain: "chore", words: [
    "deep clean", "spring clean", "meal prep", "move house", "moving house", "moving out", "declutter",
    "decluttering", "clean garage", "clean the house", "clean house", "organise room", "organize room",
    "organise wardrobe", "organize closet", "gardening", "mow lawn", "mow the lawn", "yard work", "packing",
    "unpacking", "assemble furniture", "ikea furniture", "furniture", "renovate", "paint room",
  ] },
  { id: "chore", label: "Chore", domain: "chore", words: [
    "laundry", "washing", "dishes", "wash dishes", "dishwasher", "vacuum", "vacuuming", "clean", "cleaning", "tidy",
    "tidy up", "cook", "cooking", "make dinner", "make lunch", "bins", "take out trash", "take out the bins", "trash",
    "iron", "ironing", "make bed", "water plants", "feed dog", "feed cat", "walk the dog", "walk dog",
    "change sheets", "fold clothes", "mop", "sweep", "dust", "clean bathroom", "clean kitchen", "clean room",
    "wash car", "clean car",
    "chores",
  ] },
  { id: "errand", label: "Errand", domain: "errand", words: [
    "groceries", "grocery", "grocery shopping", "shopping", "supermarket", "bank", "post office", "pharmacy",
    "chemist", "pick up", "drop off", "return parcel", "renew", "passport", "license", "licence", "rego",
    "pay bill", "pay bills", "appointment", "dentist", "doctor", "doctors", "gp", "haircut", "barber",
    "car service", "mechanic", "vet appointment", "optometrist", "blood test", "errands", "run errands",
  ] },
  { id: "admin", label: "Admin", domain: "admin", words: [
    "email", "emails", "reply", "inbox", "schedule", "plan day", "plan my day", "plan week", "plan my week",
    "weekly plan", "weekly review", "calendar", "organise files", "organize files", "fill form", "forms", "paperwork",
    "budget", "budgeting", "tax return", "taxes", "bills", "subscriptions", "booking", "book flights",
    "enrol", "enroll", "enrolment", "enrollment", "timetable",
  ] },
  { id: "social", label: "Social", domain: "social", words: [
    "meet friends", "meet up", "meetup", "hang out", "hangout", "catch up with", "coffee with", "coffee", "lunch with",
    "dinner with", "drinks", "party", "date", "date night", "visit", "visit grandma", "visit family", "call mum",
    "call mom", "call dad", "call grandma", "call family", "call friend", "facetime", "birthday", "birthday party",
    "bbq", "picnic", "game night", "friends", "family dinner", "family time", "wedding", "brunch", "sleepover",
  ], studyAlt: { words: ["friends", "coffee", "meet up", "meetup"], type: "study-session" } },
  { id: "selfcare", label: "Self-care", domain: "selfcare", words: [
    "meditate", "meditation", "journal", "journaling", "sleep", "nap", "shower", "skincare", "therapy", "therapist",
    "relax", "rest", "self care", "bath", "mindfulness", "breathing exercises", "gratitude", "screen break",
  ] },
  { id: "hobby", label: "Hobby practice", domain: "hobby", words: [
    "guitar", "piano", "violin", "drums", "ukulele", "cello", "flute", "saxophone", "singing", "sing", "vocals",
    "practice instrument", "instrument practice", "draw", "drawing", "paint", "painting", "sketch", "sketching",
    "knit", "knitting", "crochet", "sewing", "write story", "writing story", "short story", "short stories",
    "fanfic", "novel writing", "photography", "photo editing",
    "dance practice", "chess", "rubiks cube", "baking", "pottery", "calligraphy", "digital art",
  ] },
  { id: "leisure", label: "Leisure", domain: "hobby", words: [
    "read novel", "read book", "read a book", "reading for fun", "watch movie", "movie", "movies", "watch show",
    "netflix", "gaming", "video games", "play games", "anime", "podcast", "board games", "tv", "youtube",
  ] },
];

/** Modifier words and the feature they switch on. */
export const MODIFIERS: { id: string; label: string; words: string[] }[] = [
  { id: "active", label: "Active work", words: [
    "write", "writing", "draft", "solve", "derive", "prove", "implement", "debug", "calculate", "analyse", "analyze",
    "practise", "compose", "complete", "finish",
  ] },
  { id: "passive", label: "Passive", words: [
    "watch", "listen", "attend", "rewatch", "skim", "browse", "look over", "glance", "sit in",
  ] },
  { id: "intense", label: "Intensity", words: [
    "full", "entire", "whole", "all", "hard", "difficult", "advanced", "timed", "intensive", "deep", "big", "major",
    "huge", "heavy", "challenging", "extended", "complex", "honours", "honors",
  ] },
  { id: "easy", label: "Light", words: [
    "quick", "easy", "light", "short", "brief", "simple", "casual", "small", "mini", "little", "chill", "basic",
    "quickly", "5 min", "10 min",
  ] },
  { id: "deadline", label: "Deadline", words: [
    "due", "deadline", "submit", "submission", "finalise", "finalize", "final draft", "last minute", "tonight",
    "due tomorrow", "due today", "polish",
  ] },
  { id: "intro", label: "Introductory level", words: [
    "intro", "introduction", "introductory", "fundamentals", "foundations", "basics", "beginner", "beginners", "101",
    "elementary", "principles",
  ] },
];

/** Education level clues. level: 0 = junior high, 1 = senior high, 2–3 = university years, 4 = postgrad. */
export const LEVEL_WORDS: { words: string[]; level: number; label: string }[] = [
  { level: 0, label: "Junior high school", words: [
    "year 7", "year 8", "year 9", "year 10", "grade 6", "grade 7", "grade 8", "grade 9", "yr 7", "yr 8", "yr 9",
    "yr 10", "ks3", "middle school", "junior high", "freshman year high school",
  ] },
  { level: 0.7, label: "GCSE / year 10–11", words: ["gcse", "gcses", "igcse", "o level", "o levels", "grade 10", "myp"] },
  { level: 1, label: "Senior high school", words: [
    "year 11", "year 12", "year 13", "yr 11", "yr 12", "yr 13", "grade 11", "grade 12", "vce", "hsc", "wace",
    "qce", "sace", "atar", "a level", "a levels", "alevel", "ib", "ib dp", "ap", "sl", "high school", "senior year",
    "matric", "leaving cert", "ncea",
  ] },
  { level: 1.3, label: "Advanced high school", words: ["hl", "higher level", "ap bc", "extension 2", "further maths a level"] },
  { level: 2, label: "University (1st year)", words: ["first year", "1st year", "freshman", "college", "university", "uni", "undergrad"] },
  { level: 2.5, label: "University (2nd year)", words: ["second year", "2nd year", "sophomore"] },
  { level: 3, label: "University (3rd year)", words: ["third year", "3rd year", "final year", "senior", "capstone"] },
  { level: 4, label: "Postgraduate", words: [
    "honours", "honors", "masters", "postgrad", "postgraduate", "phd", "doctoral", "grad school", "thesis",
    "dissertation",
  ] },
];

/** Where a detected domain suggests the quest belongs. */
export const DOMAIN_CATEGORY: Record<Domain, Category> = {
  study: "study",
  project: "other",
  career: "work",
  work: "work",
  fitness: "gym",
  chore: "chores",
  errand: "chores",
  admin: "other",
  social: "personal",
  selfcare: "personal",
  hobby: "personal",
};
