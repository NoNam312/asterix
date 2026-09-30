// Study areas for high school and university, with a baseline difficulty (1 = easy, 5 = very hard)
// and the words that point to them: subject names, abbreviations and topic content.
// Difficulty values are general estimates of how demanding each area usually is, not facts
// about any particular course. Add areas or words freely; run `npm run scorer:train` afterwards.

export type Area = {
  id: string;
  name: string;
  difficulty: number;
  terms: string[];
  /**
   * Short forms (MOC, ML, PE, IT). They can mean other things, so they only count when the quest
   * is clearly about studying; everyday words (IT, PE, SAT, ACT) must also be written in capitals.
   */
  abbreviations?: string[];
};

/** Abbreviations that are also ordinary words, so they must be written in capitals to count. */
export const EVERYDAY_WORD_ABBREVIATIONS = new Set(["it", "pe", "act", "sat"]);

export const AREAS: Area[] = [
  // ---------- Mathematics ----------
  { id: "basic-maths", name: "Basic maths", difficulty: 1.5, terms: [
    "times tables", "fractions", "decimals", "percentages", "long division", "basic maths", "basic math",
    "numeracy", "mental maths", "mental math", "arithmetic", "general maths", "general math",
  ] },
  { id: "school-algebra", name: "Algebra", difficulty: 2.5, terms: [
    "algebra", "quadratic", "quadratics", "factorising", "factorizing", "inequalities", "simultaneous equations",
    "polynomials", "logarithms", "logs", "exponents", "indices", "surds", "linear equations", "graphing",
    "functions and graphs", "completing the square", "further maths", "further math", "maths standard", "algebra 2",
    "maths", "math", "mathematics",
  ] },
  { id: "geometry-trig", name: "Geometry and trigonometry", difficulty: 2.5, terms: [
    "geometry", "trigonometry", "trig", "pythagoras", "circle theorems", "angles", "sine rule", "cosine rule",
    "coordinate geometry", "transformations", "area and volume", "unit circle", "radians", "precalculus", "precalc",
  ] },
  { id: "calculus", name: "Calculus", difficulty: 4, terms: [
    "calculus", "calc", "calc 1", "calc 2", "derivative", "derivatives", "differentiation", "integral", "integrals",
    "integration", "limits", "chain rule", "product rule", "quotient rule", "taylor series", "power series",
    "sequences and series", "riemann sum", "antiderivative", "antiderivatives", "related rates", "optimisation problems",
    "optimization problems", "implicit differentiation", "maths methods", "math methods", "methods", "specialist maths",
    "specialist math", "specialist", "calculus ab", "calculus bc", "extension 1", "extension 2", "mathematics extension",
    "further pure", "a level maths", "a level math", "hl maths", "maths hl", "math hl", "aa hl",
  ] },
  { id: "multivariable", name: "Multivariable calculus", difficulty: 4.5, terms: [
    "multivariable", "multivariable calculus", "vector calculus", "partial derivatives", "double integrals",
    "triple integrals", "divergence", "curl of a vector field", "stokes theorem", "greens theorem", "lagrange multipliers", "jacobian",
    "calc 3", "real analysis prep",
  ] },
  { id: "linear-algebra", name: "Linear algebra", difficulty: 4, terms: [
    "linear algebra", "matrix", "matrices", "eigenvalue", "eigenvalues", "eigenvector", "eigenvectors",
    "determinant", "determinants", "gaussian elimination", "row reduction", "vector space", "vector spaces",
    "linear independence", "orthogonal", "orthogonality", "diagonalisation", "diagonalization", "linear transformation",
    "linear transformations", "null space", "rank nullity", "span", "basis vectors", "gram schmidt",
  ] },
  { id: "differential-equations", name: "Differential equations", difficulty: 4.5, terms: [
    "differential equations", "diff eq", "diffeq", "ode", "odes", "pde", "pdes", "laplace transform",
    "laplace transforms", "fourier series", "fourier transform", "separable equations", "initial value problem",
    "boundary value problem",
  ] },
  { id: "real-analysis", name: "Real analysis", difficulty: 5, terms: [
    "real analysis", "epsilon delta", "cauchy sequence", "cauchy sequences", "metric spaces", "measure theory",
    "uniform continuity", "supremum", "complex analysis", "functional analysis", "analysis proofs",
  ] },
  { id: "abstract-algebra", name: "Abstract algebra", difficulty: 5, terms: [
    "abstract algebra", "group theory", "ring theory", "field theory", "galois theory", "galois", "homomorphism",
    "homomorphisms", "isomorphism", "cosets", "lagranges theorem", "rings and fields",
  ] },
  { id: "discrete-maths", name: "Discrete maths", difficulty: 4, terms: [
    "discrete maths", "discrete math", "discrete mathematics", "combinatorics", "graph theory", "proof by induction",
    "mathematical induction", "propositional logic", "predicate logic", "set theory", "permutations", "combinations",
    "pigeonhole", "recurrence relations", "boolean algebra", "proofs", "proof writing",
  ] },
  { id: "probability-stats", name: "Probability and statistics", difficulty: 3.5, terms: [
    "probability", "statistics", "stats", "hypothesis testing", "hypothesis test", "regression", "confidence interval",
    "confidence intervals", "normal distribution", "binomial distribution", "distributions", "bayes theorem", "bayesian",
    "t test", "chi square", "anova", "standard deviation", "p value", "p values", "sampling", "expected value",
    "random variables", "statistical inference", "ap stats", "ap statistics",
  ] },
  { id: "number-theory", name: "Number theory", difficulty: 4.5, terms: [
    "number theory", "modular arithmetic", "primes", "diophantine", "congruences", "olympiad", "math olympiad",
  ] },
  { id: "topology", name: "Topology", difficulty: 5, terms: ["topology", "topological", "manifolds", "homotopy", "algebraic topology"] },
  { id: "numerical-methods", name: "Numerical methods", difficulty: 4, terms: [
    "numerical methods", "numerical analysis", "newtons method", "finite difference", "interpolation",
    "numerical integration", "scientific computing",
  ] },
  { id: "optimisation", name: "Optimisation", difficulty: 4, terms: [
    "linear programming", "operations research", "simplex method", "convex optimization", "convex optimisation",
    "optimisation theory", "optimization theory",
  ] },

  // ---------- Computing ----------
  { id: "intro-programming", name: "Programming", difficulty: 2.5, terms: [
    "programming", "python", "java", "javascript", "c programming", "c++", "cpp", "c sharp", "scratch", "loops",
    "if statements", "variables", "intro to programming", "cs50", "cs 50", "foundations of computing", "codecademy",
  ] },
  { id: "algorithms", name: "Algorithms and data structures", difficulty: 4, terms: [
    "algorithms", "algorithm", "data structures", "data structure", "sorting", "sorting algorithms", "binary search",
    "linked list", "linked lists", "hash table", "hash tables", "hashing", "heaps", "binary tree", "binary trees", "dijkstra", "dynamic programming", "recursion", "big o", "time complexity", "greedy algorithms",
    "minimum spanning tree", "leetcode", "graph algorithms", "design of algorithms", "algorithms and data structures",
  ], abbreviations: ["bst", "bfs", "dfs"] },
  { id: "theory-computation", name: "Theory of computation", difficulty: 5, terms: [
    "models of computation", "theory of computation", "automata", "automaton", "finite automata",
    "regular expressions", "regular languages", "context free grammar", "context free grammars",
    "pushdown automata", "turing machine", "turing machines", "pumping lemma", "decidability", "undecidable",
    "halting problem", "np complete", "np completeness", "complexity theory", "formal languages", "computability",
    "lambda calculus",
  ], abbreviations: ["moc", "toc", "cfg", "dfa", "nfa"] },
  { id: "functional-programming", name: "Functional and logic programming", difficulty: 4, terms: [
    "haskell", "functional programming", "ocaml", "lisp", "scheme", "prolog", "declarative programming", "monads",
    "f sharp",
  ] },
  { id: "computer-systems", name: "Computer systems", difficulty: 4.5, terms: [
    "operating systems", "computer systems", "concurrency", "multithreading", "threads", "processes",
    "memory management", "virtual memory", "assembly", "mips", "risc v", "pointers", "malloc", "systems programming",
    "kernel", "file systems", "computer architecture", "cpu design", "caches",
  ] },
  { id: "networks", name: "Computer networks", difficulty: 3.5, terms: [
    "computer networks", "network protocols", "tcp", "udp", "ip addressing", "subnetting", "routing", "osi model", "sockets",
    "network security", "ccna",
  ] },
  { id: "databases", name: "Databases", difficulty: 3, terms: [
    "databases", "database", "sql", "relational algebra", "normalisation", "normalization", "er diagram",
    "er diagrams", "nosql", "mongodb", "postgres", "postgresql", "mysql", "database systems", "supabase", "firebase",
  ] },
  { id: "web-dev", name: "Web development", difficulty: 3, terms: [
    "html", "css", "react", "next js", "nextjs", "vue", "angular", "svelte", "frontend", "front end", "backend",
    "back end", "web development", "web dev", "node js", "nodejs", "express", "rest api", "api", "website",
    "web app", "tailwind", "typescript",
  ] },
  { id: "mobile-dev", name: "App development", difficulty: 3.5, terms: [
    "ios app", "android app", "mobile app", "swift", "swiftui", "kotlin", "flutter", "react native", "app store",
  ] },
  { id: "software-engineering", name: "Software engineering", difficulty: 3, terms: [
    "software engineering", "object oriented", "oop", "design patterns", "uml", "agile", "scrum", "unit tests",
    "unit testing", "git", "version control", "software development", "object oriented software development",
    "it project", "software project", "code review",
  ] },
  { id: "ai-ml", name: "AI and machine learning", difficulty: 4.5, terms: [
    "machine learning", "artificial intelligence", "neural network", "neural networks", "deep learning",
    "gradient descent", "backpropagation", "classification", "clustering", "reinforcement learning",
    "natural language processing", "computer vision", "pytorch", "tensorflow", "transformers",
    "kaggle",
  ], abbreviations: ["ml", "ai", "nlp", "llm", "llms"] },
  { id: "graphics", name: "Computer graphics", difficulty: 4, terms: [
    "computer graphics", "graphics", "graphics and interaction", "shaders", "shader", "rendering", "opengl",
    "unity", "unreal", "ray tracing", "game development", "game dev", "godot", "blender",
  ] },
  { id: "security", name: "Cyber security", difficulty: 4, terms: [
    "cyber security", "cybersecurity", "security", "cryptography", "encryption", "penetration testing", "pentesting", "vulnerabilities", "hack the box", "tryhackme",
  ], abbreviations: ["ctf"] },
  { id: "compilers", name: "Compilers and programming languages", difficulty: 5, terms: [
    "compilers", "compiler", "parsing", "lexer", "code generation", "type checking", "type systems",
    "programming language theory", "interpreters",
  ] },
  { id: "data-science", name: "Data science", difficulty: 3.5, terms: [
    "data science", "data analysis", "data analytics", "pandas", "numpy", "data visualisation", "data visualization",
    "tableau", "power bi", "r programming", "rstudio", "jupyter", "data wrangling", "elements of data processing",
  ] },
  { id: "hci", name: "HCI and UX", difficulty: 2.5, terms: [
    "human computer interaction", "user experience", "ux research", "ui design", "usability",
    "user research", "personas", "prototyping", "user testing",
  ], abbreviations: ["hci", "ux"] },
  { id: "information-systems", name: "Information systems", difficulty: 2.5, terms: [
    "information systems", "business analysis", "requirements analysis", "systems analysis", "digital technologies",
    "digital tech", "information technology", "computing",
  ], abbreviations: ["ict", "it"] },

  // ---------- Physics ----------
  { id: "physics", name: "Physics", difficulty: 3.5, terms: [
    "physics", "phys", "kinematics", "projectile motion", "newtons laws", "forces", "momentum", "work and energy",
    "circular motion", "waves", "optics", "electricity", "circuits", "ohms law", "gravity", "friction",
    "simple harmonic motion", "ap physics", "physics hl",
  ] },
  { id: "electromagnetism", name: "Electromagnetism", difficulty: 4.5, terms: [
    "electromagnetism", "maxwells equations", "electric field", "electric fields", "magnetic field", "magnetic fields",
    "gauss law", "faradays law", "electrostatics", "magnetostatics", "electrodynamics",
  ] },
  { id: "quantum", name: "Quantum physics", difficulty: 5, terms: [
    "quantum", "quantum mechanics", "schrodinger", "wave function", "wavefunction", "uncertainty principle",
    "quantum physics", "particle physics", "quantum computing",
  ] },
  { id: "thermodynamics", name: "Thermodynamics", difficulty: 4, terms: [
    "thermodynamics", "thermo", "entropy", "heat engines", "statistical mechanics", "heat transfer",
  ] },
  { id: "classical-mechanics", name: "Classical mechanics", difficulty: 4, terms: [
    "classical mechanics", "lagrangian", "hamiltonian", "rigid body", "oscillations", "harmonic oscillator",
    "mechanics", "orbital mechanics",
  ] },
  { id: "astronomy", name: "Astronomy", difficulty: 3.5, terms: ["astronomy", "astrophysics", "cosmology", "stellar evolution", "exoplanets"] },
  { id: "relativity", name: "Relativity", difficulty: 5, terms: ["relativity", "special relativity", "general relativity", "lorentz transformation"] },

  // ---------- Chemistry ----------
  { id: "chemistry", name: "Chemistry", difficulty: 3.5, terms: [
    "chemistry", "chem", "stoichiometry", "moles", "mole calculations", "periodic table", "bonding", "ionic bonding",
    "covalent bonding", "titration", "titrations", "acids and bases", "redox", "equilibrium", "chemical equations",
    "gas laws", "electrochemistry", "rates of reaction", "le chatelier", "ap chem", "chem hl",
  ] },
  { id: "organic-chemistry", name: "Organic chemistry", difficulty: 4.5, terms: [
    "organic chemistry", "orgo", "ochem", "organic chem", "reaction mechanisms", "sn1", "sn2", "alkenes", "alkanes",
    "functional groups", "stereochemistry", "chirality", "nmr", "ir spectroscopy", "organic synthesis", "aromatic",
    "carbonyl",
  ] },
  { id: "physical-chemistry", name: "Physical chemistry", difficulty: 4.5, terms: [
    "physical chemistry", "pchem", "p chem", "chemical kinetics", "thermochemistry", "quantum chemistry", "spectroscopy",
  ] },
  { id: "biochemistry", name: "Biochemistry", difficulty: 4, terms: [
    "biochemistry", "biochem", "enzymes", "enzyme kinetics", "metabolism", "krebs cycle", "citric acid cycle",
    "glycolysis", "electron transport chain", "amino acids", "protein structure", "proteins",
  ] },

  // ---------- Biology, health and medicine ----------
  { id: "biology", name: "Biology", difficulty: 3, terms: [
    "biology", "bio", "cell biology", "mitosis", "meiosis", "photosynthesis", "cellular respiration", "respiration",
    "dna", "rna", "inheritance", "evolution", "natural selection", "ecosystems", "osmosis", "diffusion", "homeostasis",
    "immune system", "microbiology", "ap bio", "bio hl", "cells",
  ] },
  { id: "genetics", name: "Genetics and molecular biology", difficulty: 4, terms: [
    "molecular biology", "genetics", "gene expression", "transcription", "dna replication", "pcr", "crispr",
    "genomics", "punnett squares", "mendelian genetics",
  ] },
  { id: "anatomy-physiology", name: "Anatomy and physiology", difficulty: 3.5, terms: [
    "anatomy", "physiology", "nervous system", "cardiovascular system", "muscular system", "skeletal system",
    "endocrine system", "renal system", "respiratory system", "a and p",
  ] },
  { id: "medicine", name: "Medicine", difficulty: 4.5, terms: [
    "pharmacology", "pathology", "medicine", "clinical skills", "med school", "usmle", "histology", "neuroanatomy",
    "immunology", "osce", "clinical placement", "pharmacy", "pharmaceutics", "dentistry", "dental", "veterinary",
    "vet science",
  ] },
  { id: "neuroscience", name: "Neuroscience", difficulty: 4, terms: ["neuroscience", "neurons", "synapses", "action potential", "neurobiology"] },
  { id: "health-nursing", name: "Health and nursing", difficulty: 3, terms: [
    "nursing", "public health", "epidemiology", "nutrition", "first aid", "health science", "midwifery",
    "occupational therapy", "physiotherapy",
  ] },
  { id: "psychology", name: "Psychology", difficulty: 3, terms: [
    "psychology", "psych", "cognitive psychology", "developmental psychology", "social psychology", "research methods",
    "abnormal psychology", "behaviourism", "behaviorism", "psych experiment", "ap psych",
  ] },
  { id: "physical-education", name: "PE and health", difficulty: 2, terms: [ "physical education", "health and pe", "sport and recreation", "health class",
  ], abbreviations: ["pe", "hpe", "pdhpe"] },
  { id: "sport-science", name: "Sport and exercise science", difficulty: 3.5, terms: [
    "sport science", "exercise science", "exercise physiology", "biomechanics", "kinesiology",
  ] },

  // ---------- Engineering ----------
  { id: "electrical-engineering", name: "Electrical and electronic engineering", difficulty: 4.5, terms: [
    "electrical engineering", "circuit analysis", "signals and systems", "signal processing", "control systems",
    "digital logic", "logic gates", "electronics", "transistors", "op amps", "microcontrollers", "arduino",
    "embedded systems", "fpga", "vhdl", "verilog", "power systems",
  ] },
  { id: "mechanical-engineering", name: "Mechanical engineering", difficulty: 4, terms: [
    "mechanical engineering", "statics", "dynamics", "fluid mechanics", "fluids", "solid mechanics", "stress and strain",
    "materials science", "solidworks", "autocad", "cad", "engineering drawing", "machine design",
  ] },
  { id: "civil-engineering", name: "Civil engineering", difficulty: 4, terms: [
    "civil engineering", "structural analysis", "structural engineering", "geotechnical", "surveying",
    "concrete design", "hydraulics",
  ] },
  { id: "chemical-engineering", name: "Chemical engineering", difficulty: 4.5, terms: [
    "chemical engineering", "mass transfer", "process design", "unit operations", "reactor design",
  ] },
  { id: "engineering", name: "Engineering", difficulty: 3.5, terms: [
    "engineering", "engineering design", "engineering maths", "engineering math", "engineering mechanics",
    "systems engineering", "robotics", "mechatronics",
  ] },

  // ---------- Business, economics and law ----------
  { id: "economics", name: "Economics", difficulty: 3, terms: [
    "economics", "econ", "microeconomics", "macroeconomics", "micro", "macro", "supply and demand", "elasticity",
    "market structures", "monopoly", "gdp", "inflation", "fiscal policy", "monetary policy", "game theory",
    "ap macro", "ap micro",
  ] },
  { id: "econometrics", name: "Econometrics", difficulty: 4.5, terms: ["econometrics", "time series", "ols regression", "panel data"] },
  { id: "accounting", name: "Accounting", difficulty: 3, terms: [
    "accounting", "balance sheet", "income statement", "cash flow statement", "journal entries", "ledger",
    "depreciation", "auditing", "taxation law", "bookkeeping",
  ] },
  { id: "finance", name: "Finance", difficulty: 3.5, terms: [
    "finance", "corporate finance", "investments", "valuation", "npv", "portfolio theory", "options pricing", "bonds",
    "capm", "financial modelling", "financial modeling", "dcf",
  ] },
  { id: "business", name: "Business and management", difficulty: 2.5, terms: [
    "business", "business studies", "management", "marketing", "strategy", "entrepreneurship", "commerce",
    "human resources", "organisational behaviour", "organizational behavior", "supply chain", "business management",
    "consumer behaviour", "consumer behavior",
  ] },
  { id: "legal-studies", name: "Legal studies (school)", difficulty: 2.5, terms: [
    "legal studies", "legal", "civics and citizenship",
  ] },
  { id: "law", name: "Law", difficulty: 4, terms: [
    "law", "contracts", "contract law", "torts", "tort law", "constitutional law", "criminal law",
    "case law", "legal research", "moot", "property law", "equity and trusts", "administrative law", "bar exam",
  ] },

  // ---------- Humanities and social sciences ----------
  { id: "english", name: "English and literature", difficulty: 2.5, terms: [
    "english", "literature", "english literature", "english lit", "poetry", "poem", "poems", "shakespeare", "macbeth",
    "hamlet", "romeo and juliet", "othello", "king lear", "great gatsby", "to kill a mockingbird", "1984",
    "of mice and men", "frankenstein", "jane eyre", "pride and prejudice", "text response", "comparative essay",
    "close reading", "creative writing", "language analysis", "persuasive essay", "analytical essay", "novel study",
    "ap lang", "ap lit", "english advanced", "english hl",
  ] },
  { id: "history", name: "History", difficulty: 2.5, terms: [
    "history", "ww1", "ww2", "world war", "world war 1", "world war 2", "cold war", "revolution", "revolutions",
    "ancient history", "modern history", "medieval", "holocaust", "industrial revolution", "civil rights",
    "source analysis", "historiography", "apush", "ap world",
  ] },
  { id: "geography", name: "Geography", difficulty: 2.5, terms: [
    "geography", "landforms", "urbanisation", "urbanization", "tectonic plates", "plate tectonics", "fieldwork",
    "coastal processes", "population geography",
  ] },
  { id: "philosophy", name: "Philosophy", difficulty: 3.5, terms: [
    "philosophy", "ethics", "epistemology", "metaphysics", "kant", "plato", "aristotle", "descartes",
    "utilitarianism", "existentialism", "theory of knowledge", "critical thinking",
  ], abbreviations: ["tok"] },
  { id: "politics", name: "Politics and international relations", difficulty: 3, terms: [
    "politics", "political science", "government", "international relations", "public policy", "civics",
    "democracy", "global politics", "ap gov",
  ] },
  { id: "sociology", name: "Sociology and cultural studies", difficulty: 2.5, terms: [
    "sociology", "anthropology", "social science", "cultural studies", "gender studies", "media studies",
    "criminology", "social studies",
  ] },
  { id: "religion", name: "Religious studies", difficulty: 2, terms: ["religion", "religious studies", "theology", "scripture", "religious education"] },
  { id: "classics", name: "Classics", difficulty: 3.5, terms: ["classics", "latin", "ancient greek", "greek mythology", "classical studies"] },
  { id: "linguistics", name: "Linguistics", difficulty: 3.5, terms: ["linguistics", "phonetics", "phonology", "syntax", "semantics", "morphology"] },
  { id: "education", name: "Education", difficulty: 2.5, terms: ["education", "pedagogy", "lesson plan", "lesson plans", "curriculum", "teaching placement"] },
  { id: "environmental", name: "Environmental science", difficulty: 3, terms: [
    "environmental science", "sustainability", "climate change", "ecology", "conservation", "earth science", "geology",
  ] },

  // ---------- Languages ----------
  { id: "languages", name: "Languages", difficulty: 3, terms: [
    "french", "spanish", "german", "italian", "japanese", "chinese", "mandarin", "cantonese", "korean", "arabic",
    "hindi", "indonesian", "vietnamese", "russian", "portuguese", "vocab", "vocabulary", "grammar", "conjugation",
    "conjugations", "verb tables", "kanji", "hiragana", "katakana", "duolingo", "speaking practice",
    "listening practice",
  ], abbreviations: ["jlpt", "hsk", "dele"] },
  { id: "english-language-tests", name: "English language tests", difficulty: 2.5, terms: ["ielts", "toefl"], abbreviations: ["esl", "eal", "pte"] },

  // ---------- Arts and design ----------
  { id: "music", name: "Music", difficulty: 3, terms: [
    "music", "music theory", "scales", "harmony", "composition", "aural", "sight reading", "ear training", "recital",
    "ameb", "abrsm", "music performance",
  ] },
  { id: "visual-art", name: "Visual art", difficulty: 2.5, terms: [
    "art", "visual art", "studio art", "art history", "sculpture", "art folio", "visual arts", "ceramics",
  ] },
  { id: "drama-film", name: "Drama and film", difficulty: 2.5, terms: [
    "drama", "theatre", "theater", "film studies", "cinematography", "screenwriting", "acting", "monologue",
    "media production",
  ] },
  { id: "design", name: "Design", difficulty: 3, terms: [
    "graphic design", "typography", "branding", "product design", "visual communication", "visual communication design", "industrial design", "fashion design",
  ], abbreviations: ["vcd"] },
  { id: "architecture", name: "Architecture", difficulty: 4, terms: ["architecture", "architectural", "design studio", "building design"] },
  { id: "technology-school", name: "Technology and applied studies", difficulty: 2, terms: [
    "food technology", "food tech", "home economics", "textiles", "woodwork", "metalwork", "design and technology",
  ] },

  // ---------- Entrance and admissions tests ----------
  { id: "entrance-tests", name: "Entrance tests", difficulty: 3.5, terms: [ "selective school test",
  ], abbreviations: ["sat", "act", "gre", "gmat", "lsat", "ucat", "ukcat", "gamsat", "mcat", "psat"] },
];

/** Course-code prefixes (e.g. COMP30026, CS 101, MATH2250) and the area they suggest. */
export const CODE_PREFIXES: Record<string, string> = {
  comp: "intro-programming", cs: "intro-programming", csc: "intro-programming", cse: "intro-programming",
  cosc: "intro-programming", cmpt: "intro-programming", cisc: "intro-programming", swen: "software-engineering",
  seng: "software-engineering", info: "information-systems", isys: "information-systems", it: "information-systems",
  math: "calculus", mast: "calculus", mth: "calculus", mat: "calculus", ma: "calculus", stat: "probability-stats",
  sta: "probability-stats", phys: "physics", phyc: "physics", phy: "physics", chem: "chemistry", che: "chemistry",
  biol: "biology", bio: "biology", bios: "biology", biom: "biochemistry", econ: "economics", eco: "economics",
  acct: "accounting", acc: "accounting", fnce: "finance", fin: "finance", psyc: "psychology", psy: "psychology",
  hist: "history", phil: "philosophy", pols: "politics", poli: "politics", soci: "sociology", laws: "law",
  law: "law", engr: "engineering", engg: "engineering", elen: "electrical-engineering", ee: "electrical-engineering",
  ece: "electrical-engineering", elec: "electrical-engineering", mech: "mechanical-engineering",
  mcen: "mechanical-engineering", civl: "civil-engineering", cive: "civil-engineering", chen: "chemical-engineering",
  mgmt: "business", mktg: "business", bus: "business", busa: "business", ling: "linguistics", engl: "english",
  musi: "music", mus: "music", arch: "architecture", abpl: "architecture", geog: "geography", envs: "environmental",
  anat: "anatomy-physiology", phrm: "medicine", neur: "neuroscience", educ: "education",
};
