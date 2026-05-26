/**
 * Seed-based curriculum — 69 seeds.
 *
 * Coverage: A1 survival → A2 everyday → B1 intermediate → B2 upper-intermediate
 *           → C1 advanced → C2 native-level mastery.
 *
 * Categories: Grammar, Vocabulary, Expressions & Phrases, Real-world Scenarios,
 *   Idioms & Collocations, Culture & Society, Fancy/Advanced Vocabulary,
 *   Storytelling, Debate, Humour, Register & Style.
 *
 * Each seed is language-agnostic — the AI executes it IN the target language,
 * adapting to the user's per-domain CEFR scores every session.
 */

export type { CefrLevel, SkillDomain } from '../types'
import type { CefrLevel, SkillDomain } from '../types'

export interface HeatMoment {
  /** Trigger this beat after the user has taken this many turns */
  triggerAfterTurn: number
  /** Short instruction to the AI about what to do — never shown to the user */
  beat: string
  /** What kind of response the user should produce — informs the prompt */
  expectedRegister: 'sympathetic' | 'humorous' | 'practical' | 'opinionated' | 'curious'
}

export interface ConversationSeed {
  id: string
  title: string
  blurb: string
  cefrRange: [CefrLevel, CefrLevel]
  prerequisites: string[]
  domains: SkillDomain[]
  scenarioBrief: string
  targetGrammar: string[]
  targetVocab: string[]
  successCue: string
  /**
   * Optional emotional beats. Real conversations have moments of tension,
   * humor, excitement, or confusion. Textbook ones don't. Heat moments
   * inject scripted unpredictability that forces reactive language.
   */
  heatMoments?: HeatMoment[]
}

// ─── A1 — Survival (10 seeds) ─────────────────────────────────────────────────

const A1_SEEDS: ConversationSeed[] = [
  {
    id: 'greetings',
    title: 'First Greetings',
    blurb: 'Say hello, introduce yourself, ask basic questions.',
    cefrRange: ['A1', 'A2'],
    prerequisites: [],
    domains: ['vocabulary', 'listening'],
    scenarioBrief: 'You are meeting the user for the very first time. Greet them warmly, ask their name, where they are from, and how they feel. Keep sentences very short. Repeat key phrases naturally. Model correct forms when they slip — never announce corrections.',
    targetGrammar: ['present-simple "to be"', 'subject pronouns', 'yes/no questions'],
    targetVocab: ['greetings', 'countries', 'simple feelings', 'names'],
    successCue: 'User introduces themselves and asks at least one question back.',
  },
  {
    id: 'numbers-time',
    title: 'Numbers & Time',
    blurb: 'Numbers, telling time, days of the week.',
    cefrRange: ['A1', 'A2'],
    prerequisites: ['greetings'],
    domains: ['vocabulary', 'listening'],
    scenarioBrief: 'Chat naturally about numbers, time, and days. Ask the user their age, what time it is, what day they have plans. Use numbers 1–100 organically. No drills — just conversation.',
    targetGrammar: ['numbers', 'time expressions', 'questions with "when"'],
    targetVocab: ['numbers', 'time', 'days', 'months'],
    successCue: 'User tells the time and answers a "when" question correctly.',
  },
  {
    id: 'cafe',
    title: 'At a Café',
    blurb: 'Order a drink, ask the price, pay.',
    cefrRange: ['A1', 'A2'],
    prerequisites: ['numbers-time'],
    domains: ['vocabulary', 'grammar', 'fluency'],
    scenarioBrief: 'Roleplay: you are café staff. Greet the customer, take their order, ask if for here or to go, give the price. Stay in character. If they switch language, gently nudge them back.',
    targetGrammar: ['polite requests ("I would like")', 'present-simple', 'numbers/prices'],
    targetVocab: ['drinks', 'food', 'sizes', 'currency', 'politeness phrases'],
    successCue: 'User completes a full order and pays without switching language.',
    heatMoments: [
      {
        triggerAfterTurn: 3,
        beat: "The card machine just broke. Tell the customer apologetically — they need to pay cash or wait. See how they handle the inconvenience.",
        expectedRegister: 'practical',
      },
    ],
  },
  {
    id: 'family',
    title: 'Family & People',
    blurb: 'Describe your family, talk about people you know.',
    cefrRange: ['A1', 'A2'],
    prerequisites: ['greetings'],
    domains: ['vocabulary', 'grammar'],
    scenarioBrief: 'Ask the user about their family — siblings, parents, pets. Share a little about your own (invented) family. Introduce possessive pronouns and basic adjectives naturally.',
    targetGrammar: ['possessive pronouns', 'basic adjectives', 'has/have'],
    targetVocab: ['family members', 'ages', 'physical descriptions', 'personality'],
    successCue: 'User describes at least 3 family members using adjectives.',
  },
  {
    id: 'colors-objects',
    title: 'Colors & Objects',
    blurb: 'Describe things around you.',
    cefrRange: ['A1', 'A2'],
    prerequisites: ['greetings'],
    domains: ['vocabulary', 'listening'],
    scenarioBrief: 'Play a description game — describe objects using colors, sizes, and materials. Ask the user to guess what you are describing, then swap.',
    targetGrammar: ['adjective agreement (if applicable)', 'demonstratives (this/that)', 'is/are'],
    targetVocab: ['colors', 'shapes', 'common objects', 'materials'],
    successCue: 'User successfully describes an object so you can guess it.',
  },
  {
    id: 'basic-verbs',
    title: 'Action Verbs',
    blurb: 'Talk about what you do — eat, sleep, work, play.',
    cefrRange: ['A1', 'A2'],
    prerequisites: ['greetings'],
    domains: ['grammar', 'vocabulary'],
    scenarioBrief: 'Chat about everyday actions. Ask what the user does in the morning, what they eat, what they like to do. Introduce the 30 most common verbs naturally through questions and answers.',
    targetGrammar: ['present simple with common verbs', 'negation (don\'t/doesn\'t)', 'wh-questions'],
    targetVocab: ['common action verbs', 'daily activities', 'frequency words'],
    successCue: 'User uses at least 5 different verbs correctly in one conversation.',
  },
  {
    id: 'places-city',
    title: 'Places in the City',
    blurb: 'Name and describe places — shops, parks, stations.',
    cefrRange: ['A1', 'A2'],
    prerequisites: ['numbers-time'],
    domains: ['vocabulary', 'listening'],
    scenarioBrief: 'Describe your (imaginary) city. Ask the user about their city — what is near their home, what they like to visit. Introduce place vocabulary and simple prepositions of location.',
    targetGrammar: ['there is/there are', 'prepositions of place (near, next to, opposite)', 'simple questions about location'],
    targetVocab: ['city places', 'shops', 'transport hubs', 'public spaces'],
    successCue: 'User describes where 3 places are in their city.',
  },
  {
    id: 'likes-dislikes',
    title: 'Likes & Dislikes',
    blurb: 'Say what you love, like, and hate.',
    cefrRange: ['A1', 'A2'],
    prerequisites: ['basic-verbs'],
    domains: ['grammar', 'vocabulary', 'fluency'],
    scenarioBrief: 'Explore preferences — music, food, sports, weather. Use "I like", "I love", "I don\'t like", "I hate" naturally. Ask the user for their preferences and share your own (invented) ones.',
    targetGrammar: ['like/love/hate + noun or gerund', 'simple opinion phrases', 'and/but connectors'],
    targetVocab: ['hobbies', 'music genres', 'sports', 'food types'],
    successCue: 'User expresses 3 preferences using different verbs (like, love, hate).',
  },
  {
    id: 'transport',
    title: 'Getting Around',
    blurb: 'Buy a ticket, ask about transport, plan a journey.',
    cefrRange: ['A1', 'A2'],
    prerequisites: ['numbers-time', 'places-city'],
    domains: ['vocabulary', 'grammar', 'listening'],
    scenarioBrief: 'Roleplay: you are a ticket office worker or bus driver. The user needs to get somewhere. Help them buy a ticket, understand the schedule, and find the right platform or stop.',
    targetGrammar: ['modal "can" for requests', 'how much/how long questions', 'numbers for prices and times'],
    targetVocab: ['transport types', 'tickets', 'stations', 'schedule vocabulary'],
    successCue: 'User successfully buys a ticket and understands departure information.',
  },
  {
    id: 'home-rooms',
    title: 'My Home',
    blurb: 'Describe your home, rooms, and furniture.',
    cefrRange: ['A1', 'A2'],
    prerequisites: ['colors-objects', 'places-city'],
    domains: ['vocabulary', 'grammar'],
    scenarioBrief: 'Ask the user to describe their home — how many rooms, what furniture, what they like about it. Share a description of your own (invented) home. Introduce room vocabulary and "there is/are".',
    targetGrammar: ['there is/there are', 'prepositions of place', 'adjectives for size and condition'],
    targetVocab: ['rooms', 'furniture', 'household items', 'adjectives for homes'],
    successCue: 'User describes at least 3 rooms with furniture using prepositions.',
  },
]

// ─── A2 — Everyday Life (12 seeds) ───────────────────────────────────────────

const A2_SEEDS: ConversationSeed[] = [
  {
    id: 'directions',
    title: 'Asking Directions',
    blurb: 'Find a place, give and follow directions.',
    cefrRange: ['A2', 'B1'],
    prerequisites: ['places-city', 'transport'],
    domains: ['vocabulary', 'grammar', 'listening'],
    scenarioBrief: 'You are a friendly local. The user is lost and needs directions to a landmark. Use prepositions of place and basic imperatives. Ask clarifying questions ("on foot or by car?"). Give a 3-step route.',
    targetGrammar: ['imperatives', 'prepositions of place', 'prepositions of movement'],
    targetVocab: ['streets', 'landmarks', 'transport', 'distances'],
    successCue: 'User gives AND follows a 3-step route correctly.',
    heatMoments: [
      {
        triggerAfterTurn: 3,
        beat: "Realise the place they're heading to has just closed for the day — break the news and offer an alternative nearby. Force them to react and adapt their plan.",
        expectedRegister: 'practical',
      },
    ],
  },
  {
    id: 'shopping',
    title: 'Shopping',
    blurb: 'Buy clothes, ask for sizes and prices, negotiate.',
    cefrRange: ['A2', 'B1'],
    prerequisites: ['cafe', 'colors-objects'],
    domains: ['vocabulary', 'grammar', 'fluency'],
    scenarioBrief: 'Roleplay shop assistant. User browses for clothes or electronics. Discuss size, color, price, return policy. Introduce a small problem (out of stock) so they have to negotiate.',
    targetGrammar: ['comparatives', 'demonstratives', 'object pronouns'],
    targetVocab: ['clothing', 'colors', 'sizes', 'money', 'shopping phrases'],
    successCue: 'User compares two items and makes a decision.',
  },
  {
    id: 'daily-routine',
    title: 'My Day',
    blurb: 'Talk about what you do every day.',
    cefrRange: ['A2', 'B1'],
    prerequisites: ['numbers-time', 'basic-verbs'],
    domains: ['grammar', 'fluency', 'vocabulary'],
    scenarioBrief: 'Casual chat about a typical day. Push them to use frequency adverbs (always/often/never), times of day, and simple connectors. Share your own routine to model the structures.',
    targetGrammar: ['present simple', 'frequency adverbs', 'time connectors'],
    targetVocab: ['daily activities', 'workplaces', 'meals', 'transport'],
    successCue: 'User describes their morning and evening using 4+ verbs and at least one frequency adverb.',
  },
  {
    id: 'food-preferences',
    title: 'Food & Tastes',
    blurb: 'Talk about food you love and hate.',
    cefrRange: ['A2', 'B1'],
    prerequisites: ['cafe', 'likes-dislikes'],
    domains: ['vocabulary', 'fluency'],
    scenarioBrief: 'Discuss food — favourite dishes, things you dislike, cooking habits. Ask about local food in the country where the target language is spoken. Share opinions using "I love", "I can\'t stand", "I prefer".',
    targetGrammar: ['like/love/hate + gerund', 'preference expressions', 'simple comparisons'],
    targetVocab: ['food', 'cooking methods', 'flavors', 'meals', 'restaurants'],
    successCue: 'User expresses at least 3 food preferences with reasons.',
  },
  {
    id: 'weather-seasons',
    title: 'Weather & Seasons',
    blurb: 'Describe the weather, talk about seasons.',
    cefrRange: ['A2', 'B1'],
    prerequisites: ['daily-routine'],
    domains: ['vocabulary', 'grammar'],
    scenarioBrief: 'Chat about today\'s weather, favourite seasons, and what you do in each season. Introduce weather vocabulary and present continuous for current conditions.',
    targetGrammar: ['present continuous', 'it + weather verbs', 'seasonal expressions'],
    targetVocab: ['weather', 'seasons', 'temperature', 'outdoor activities'],
    successCue: 'User describes current weather and explains what they like to do in their favourite season.',
  },
  {
    id: 'health-body',
    title: 'Health & Body',
    blurb: 'Describe how you feel, talk about health.',
    cefrRange: ['A2', 'B1'],
    prerequisites: ['family', 'daily-routine'],
    domains: ['vocabulary', 'grammar'],
    scenarioBrief: 'Roleplay: you are a friendly doctor or pharmacist. The user describes symptoms. Ask follow-up questions. Give simple advice. Introduce body parts, symptoms, and basic medical vocabulary.',
    targetGrammar: ['have + noun (I have a headache)', 'feel + adjective', 'should/shouldn\'t'],
    targetVocab: ['body parts', 'symptoms', 'medicine', 'health advice'],
    successCue: 'User describes at least 2 symptoms and understands your advice.',
  },
  {
    id: 'hobbies-free-time',
    title: 'Hobbies & Free Time',
    blurb: 'Talk about what you do for fun.',
    cefrRange: ['A2', 'B1'],
    prerequisites: ['likes-dislikes', 'daily-routine'],
    domains: ['vocabulary', 'fluency'],
    scenarioBrief: 'Discuss hobbies — sports, music, reading, gaming, cooking. Ask how often they do each hobby, when they started, and why they enjoy it. Introduce hobby vocabulary and frequency expressions.',
    targetGrammar: ['present simple for habits', 'how often questions', 'since/for (light)'],
    targetVocab: ['hobbies', 'sports', 'arts', 'frequency expressions'],
    successCue: 'User describes 2 hobbies with frequency and a reason they enjoy them.',
  },
  {
    id: 'school-education',
    title: 'School & Education',
    blurb: 'Talk about school, subjects, and studying.',
    cefrRange: ['A2', 'B1'],
    prerequisites: ['daily-routine', 'likes-dislikes'],
    domains: ['vocabulary', 'grammar'],
    scenarioBrief: 'Discuss school life — favourite subjects, teachers, homework, exams. Ask about the user\'s school experience. Introduce school vocabulary and simple past for memories.',
    targetGrammar: ['simple past (regular and irregular)', 'used to (light)', 'opinion phrases'],
    targetVocab: ['school subjects', 'classroom', 'exams', 'education system'],
    successCue: 'User describes their school experience using simple past correctly.',
  },
  {
    id: 'restaurant',
    title: 'At a Restaurant',
    blurb: 'Make a reservation, order a meal, complain politely.',
    cefrRange: ['A2', 'B1'],
    prerequisites: ['cafe', 'food-preferences'],
    domains: ['vocabulary', 'grammar', 'fluency'],
    scenarioBrief: 'Roleplay: you are a waiter at a restaurant. The user makes a reservation, reads the menu, orders, and perhaps sends something back. Introduce formal restaurant language and polite complaint phrases.',
    targetGrammar: ['would like for ordering', 'could for polite requests', 'past simple for complaints'],
    targetVocab: ['menu items', 'restaurant vocabulary', 'polite complaint phrases', 'reservation language'],
    successCue: 'User orders a full meal and handles one complication (wrong order, allergy) politely.',
    heatMoments: [
      {
        triggerAfterTurn: 4,
        beat: "Bring the wrong dish. Apologise sincerely but make the user describe what they actually ordered. Force them to politely complain.",
        expectedRegister: 'practical',
      },
    ],
  },
  {
    id: 'phone-messages',
    title: 'Phone Calls & Messages',
    blurb: 'Make a phone call, leave a message, text someone.',
    cefrRange: ['A2', 'B1'],
    prerequisites: ['greetings', 'numbers-time'],
    domains: ['vocabulary', 'listening', 'fluency'],
    scenarioBrief: 'Roleplay a phone call — calling to make an appointment, asking for information, or leaving a message. Introduce phone-specific language ("Can I speak to…", "I\'ll call back", "Could you repeat that?").',
    targetGrammar: ['indirect questions', 'modal verbs for requests', 'future with "will" for promises'],
    targetVocab: ['phone vocabulary', 'appointment language', 'message-taking phrases'],
    successCue: 'User successfully makes an appointment or leaves a clear message.',
    heatMoments: [
      {
        triggerAfterTurn: 2,
        beat: "Pretend the line is bad and you didn't catch part of what they said. Force them to repeat or rephrase using polite phone language.",
        expectedRegister: 'practical',
      },
    ],
  },
  {
    id: 'celebrations',
    title: 'Celebrations & Festivals',
    blurb: 'Talk about birthdays, holidays, and traditions.',
    cefrRange: ['A2', 'B1'],
    prerequisites: ['family', 'food-preferences'],
    domains: ['vocabulary', 'grammar'],
    scenarioBrief: 'Discuss celebrations — birthdays, national holidays, religious festivals. Ask what the user does to celebrate, what food they eat, what gifts they give. Introduce celebration vocabulary and simple past.',
    targetGrammar: ['simple past', 'time expressions (last year, on my birthday)', 'we + verb for customs'],
    targetVocab: ['celebrations', 'gifts', 'food traditions', 'holiday vocabulary'],
    successCue: 'User describes a celebration they enjoy using past tense.',
  },
  {
    id: 'animals-nature',
    title: 'Animals & Nature',
    blurb: 'Talk about animals, pets, and the natural world.',
    cefrRange: ['A2', 'B1'],
    prerequisites: ['home-rooms', 'colors-objects'],
    domains: ['vocabulary', 'grammar'],
    scenarioBrief: 'Discuss animals — pets, wild animals, favourite creatures. Ask if the user has a pet, what animals they find interesting, and why. Introduce animal vocabulary and simple relative clauses.',
    targetGrammar: ['simple relative clauses (which/that)', 'can for ability', 'adjectives for animals'],
    targetVocab: ['animals', 'habitats', 'characteristics', 'pet care'],
    successCue: 'User describes an animal using a relative clause.',
  },
]

// ─── B1 — Intermediate (14 seeds) ────────────────────────────────────────────

const B1_SEEDS: ConversationSeed[] = [
  {
    id: 'past-events',
    title: 'A Story From Last Week',
    blurb: 'Tell a story in the past tense.',
    cefrRange: ['B1', 'B2'],
    prerequisites: ['daily-routine', 'food-preferences'],
    domains: ['grammar', 'fluency'],
    scenarioBrief: 'Ask the user to tell you about something interesting that happened recently. Use recasts in past tenses. Ask follow-up "what happened next?" questions to keep the story going.',
    targetGrammar: ['past tenses', 'time markers (yesterday, last week)', 'sequencing (first, then, finally)'],
    targetVocab: ['narrative verbs', 'feelings', 'time expressions'],
    successCue: 'User tells a 4+ sentence story with correct past tense throughout.',
    heatMoments: [
      {
        triggerAfterTurn: 3,
        beat: "React to a detail in their story with surprise — repeat the detail back as a question and ask for more colour. Push them to add a sensory detail.",
        expectedRegister: 'curious',
      },
    ],
  },
  {
    id: 'travel-plans',
    title: 'Travel Plans',
    blurb: 'Plan a trip, talk about places you want to visit.',
    cefrRange: ['B1', 'B2'],
    prerequisites: ['directions', 'past-events'],
    domains: ['grammar', 'fluency', 'vocabulary'],
    scenarioBrief: 'Discuss travel — a trip the user is planning or has taken. Ask about transport, accommodation, activities. Introduce future tense and first conditional.',
    targetGrammar: ['future tense(s)', 'first conditional', 'modals of intention (going to, will)'],
    targetVocab: ['transport', 'accommodation', 'tourist attractions', 'booking vocabulary'],
    successCue: 'User makes a 3-step travel plan with at least one conditional.',
    heatMoments: [
      {
        triggerAfterTurn: 4,
        beat: "Mention you've been to where they're planning to go. Drop one weird/specific local detail (a strange food, a bizarre tradition) and ask if they knew about it.",
        expectedRegister: 'curious',
      },
    ],
  },
  {
    id: 'opinions',
    title: 'Opinions & Tastes',
    blurb: 'Agree, disagree, and explain why.',
    cefrRange: ['B1', 'B2'],
    prerequisites: ['food-preferences', 'weather-seasons'],
    domains: ['fluency', 'grammar', 'vocabulary'],
    scenarioBrief: 'Pick a light opinion-rich topic (best season, dogs vs cats, city vs countryside). Push them to use "because", "in my opinion", "I think that". Push back gently to make them defend their view.',
    targetGrammar: ['conjunctions (because, although)', 'modal verbs', 'opinion phrases'],
    targetVocab: ['opinion verbs', 'adjectives for evaluation', 'discourse markers'],
    successCue: 'User defends one opinion against your counter-argument with a reason.',
  },
  {
    id: 'technology',
    title: 'Technology & Daily Life',
    blurb: 'Talk about apps, devices, and how technology affects your life.',
    cefrRange: ['B1', 'B2'],
    prerequisites: ['daily-routine', 'opinions'],
    domains: ['vocabulary', 'fluency'],
    scenarioBrief: 'Discuss how the user uses technology — favourite apps, social media habits, how phones have changed daily life. Ask for opinions on whether technology is mostly good or bad.',
    targetGrammar: ['present perfect (have you ever…)', 'used to', 'comparatives'],
    targetVocab: ['technology', 'apps', 'social media', 'devices', 'internet'],
    successCue: 'User gives an opinion on technology with at least one example from their own life.',
  },
  {
    id: 'work-study',
    title: 'Work & Study',
    blurb: 'Describe your job or studies, talk about goals.',
    cefrRange: ['B1', 'B2'],
    prerequisites: ['past-events', 'opinions'],
    domains: ['vocabulary', 'fluency', 'grammar'],
    scenarioBrief: 'Ask about the user\'s work or studies. What do they do? What do they enjoy or find difficult? What are their goals? Introduce professional vocabulary and hypothetical structures.',
    targetGrammar: ['present perfect', 'second conditional (light)', 'purpose clauses (in order to)'],
    targetVocab: ['professions', 'workplace', 'study', 'goals', 'skills'],
    successCue: 'User describes their work/study and mentions at least one goal.',
  },
  {
    id: 'environment',
    title: 'Environment & Nature',
    blurb: 'Talk about nature, environmental issues, what you can do.',
    cefrRange: ['B1', 'B2'],
    prerequisites: ['weather-seasons', 'opinions'],
    domains: ['vocabulary', 'grammar'],
    scenarioBrief: 'Discuss the environment — climate, nature, what the user does to be eco-friendly. Introduce modal verbs for obligation and possibility. Ask for their opinion on environmental issues.',
    targetGrammar: ['modal verbs (should, must, could)', 'passive voice (light)', 'cause/effect'],
    targetVocab: ['environment', 'nature', 'climate', 'recycling', 'sustainability'],
    successCue: 'User explains one environmental problem and suggests a solution.',
  },
  {
    id: 'present-perfect',
    title: 'Life Experiences',
    blurb: 'Talk about things you have and haven\'t done in your life.',
    cefrRange: ['B1', 'B2'],
    prerequisites: ['past-events', 'travel-plans'],
    domains: ['grammar', 'fluency'],
    scenarioBrief: 'Play a "have you ever…?" game. Ask about life experiences — places visited, foods tried, skills learned. Push the user to use present perfect for experiences and simple past for specific events.',
    targetGrammar: ['present perfect vs simple past', 'ever/never/already/yet', 'for/since'],
    targetVocab: ['experience verbs', 'travel', 'achievements', 'life milestones'],
    successCue: 'User correctly uses present perfect for experience and simple past for a specific time.',
  },
  {
    id: 'giving-advice',
    title: 'Giving Advice',
    blurb: 'Ask for and give advice on everyday problems.',
    cefrRange: ['B1', 'B2'],
    prerequisites: ['health-body', 'opinions'],
    domains: ['grammar', 'fluency', 'vocabulary'],
    scenarioBrief: 'Present the user with a problem (a friend is stressed, someone lost their job, a neighbour is noisy). Ask them for advice. Then swap — they present a problem and you give advice. Focus on modal verbs for advice.',
    targetGrammar: ['should/shouldn\'t', 'could/might', 'if I were you…', 'why don\'t you…'],
    targetVocab: ['problem vocabulary', 'advice phrases', 'feelings', 'solutions'],
    successCue: 'User gives advice using at least 2 different modal structures.',
  },
  {
    id: 'describing-people',
    title: 'Describing People',
    blurb: 'Describe appearance, personality, and character.',
    cefrRange: ['B1', 'B2'],
    prerequisites: ['family', 'past-events'],
    domains: ['vocabulary', 'fluency'],
    scenarioBrief: 'Describe a real or fictional person — their appearance, personality, and what makes them interesting. Ask the user to describe someone they admire. Introduce nuanced personality adjectives.',
    targetGrammar: ['relative clauses (who/that)', 'adjective order', 'seem/appear + adjective'],
    targetVocab: ['personality adjectives', 'physical appearance', 'character traits', 'admiration phrases'],
    successCue: 'User describes a person using both physical and personality adjectives with a relative clause.',
  },
  {
    id: 'news-events',
    title: 'Talking About News',
    blurb: 'Discuss current events, share what you heard.',
    cefrRange: ['B1', 'B2'],
    prerequisites: ['opinions', 'technology'],
    domains: ['vocabulary', 'grammar', 'listening'],
    scenarioBrief: 'Discuss a recent news story (use a generic, non-controversial topic — a sports event, a scientific discovery, a cultural event). Ask the user what they think. Introduce reported speech and passive voice.',
    targetGrammar: ['reported speech (said that, told me)', 'passive voice', 'discourse markers (apparently, reportedly)'],
    targetVocab: ['news vocabulary', 'media', 'reporting verbs', 'opinion phrases'],
    successCue: 'User summarises a news story using reported speech.',
  },
  {
    id: 'making-plans',
    title: 'Making Plans',
    blurb: 'Arrange to meet, suggest activities, confirm plans.',
    cefrRange: ['B1', 'B2'],
    prerequisites: ['phone-messages', 'hobbies-free-time'],
    domains: ['grammar', 'fluency', 'vocabulary'],
    scenarioBrief: 'Roleplay making plans with a friend — suggest an activity, negotiate a time and place, confirm the details. Introduce future forms and polite suggestions.',
    targetGrammar: ['future with "will" and "going to"', 'shall we…? / how about…?', 'if + present simple'],
    targetVocab: ['suggestion phrases', 'time expressions', 'activity vocabulary', 'confirmation language'],
    successCue: 'User successfully arranges a meeting including time, place, and activity.',
  },
  {
    id: 'expressing-feelings',
    title: 'Expressing Feelings',
    blurb: 'Talk about emotions, moods, and how you feel.',
    cefrRange: ['B1', 'B2'],
    prerequisites: ['health-body', 'giving-advice'],
    domains: ['vocabulary', 'fluency'],
    scenarioBrief: 'Explore emotional vocabulary. Ask the user how they feel about different situations — starting a new job, moving to a new city, losing something important. Introduce nuanced emotion vocabulary beyond "happy" and "sad".',
    targetGrammar: ['feel + adjective', 'make + object + adjective', 'gerunds as subjects (Losing things makes me…)'],
    targetVocab: ['emotion adjectives', 'mood vocabulary', 'empathy phrases', 'intensifiers'],
    successCue: 'User expresses a complex emotion using vocabulary beyond basic happy/sad/angry.',
    heatMoments: [
      {
        triggerAfterTurn: 3,
        beat: "Share something mildly vulnerable about yourself first (a recent disappointment, a small worry) — natural, not over-shared. This invites them to reciprocate with their own real emotional vocabulary.",
        expectedRegister: 'sympathetic',
      },
    ],
  },
  {
    id: 'sports-competition',
    title: 'Sports & Competition',
    blurb: 'Talk about sports, matches, winning and losing.',
    cefrRange: ['B1', 'B2'],
    prerequisites: ['hobbies-free-time', 'past-events'],
    domains: ['vocabulary', 'fluency', 'grammar'],
    scenarioBrief: 'Discuss sports — favourite teams, memorable matches, personal sporting experiences. Ask the user if they play any sports and what they think about competition. Introduce sports vocabulary and narrative past.',
    targetGrammar: ['past simple and continuous for narrative', 'superlatives', 'exclamations'],
    targetVocab: ['sports vocabulary', 'competition terms', 'team sports', 'individual sports'],
    successCue: 'User narrates a sporting event or personal sports experience.',
  },
  {
    id: 'music-arts',
    title: 'Music & the Arts',
    blurb: 'Talk about music, films, books, and art.',
    cefrRange: ['B1', 'B2'],
    prerequisites: ['hobbies-free-time', 'opinions'],
    domains: ['vocabulary', 'fluency'],
    scenarioBrief: 'Discuss cultural interests — favourite music genres, films, books, or art. Ask the user to recommend something and explain why. Introduce arts vocabulary and recommendation language.',
    targetGrammar: ['present perfect for recommendations (have you seen…)', 'relative clauses', 'it\'s worth + gerund'],
    targetVocab: ['music genres', 'film vocabulary', 'literary terms', 'art vocabulary', 'recommendation phrases'],
    successCue: 'User recommends something cultural and explains why using at least 2 reasons.',
  },
]

// ─── B2 — Upper-Intermediate (13 seeds) ──────────────────────────────────────

const B2_SEEDS: ConversationSeed[] = [
  {
    id: 'culture-debate',
    title: 'Culture & Society',
    blurb: 'Compare cultures, discuss social norms.',
    cefrRange: ['B2', 'C1'],
    prerequisites: ['work-study', 'environment'],
    domains: ['fluency', 'vocabulary', 'grammar'],
    scenarioBrief: 'Light cultural comparison — food rituals, festivals, social norms, family structures across cultures. Encourage longer turns, hedging language, and respectful disagreement.',
    targetGrammar: ['relative clauses', 'hedging modals', 'complex comparatives'],
    targetVocab: ['society', 'culture', 'traditions', 'values', 'abstract nouns'],
    successCue: 'User holds a 2-minute uninterrupted turn comparing two cultures.',
    heatMoments: [
      {
        triggerAfterTurn: 4,
        beat: "Take a mildly contrarian position on something the user said. Be civil, push them to defend it. Force hedging language and respectful disagreement.",
        expectedRegister: 'opinionated',
      },
    ],
  },
  {
    id: 'media-news',
    title: 'Media & Current Events',
    blurb: 'Discuss news, media, and how we consume information.',
    cefrRange: ['B2', 'C1'],
    prerequisites: ['technology', 'news-events'],
    domains: ['vocabulary', 'fluency', 'listening'],
    scenarioBrief: 'Discuss how the user gets their news, what topics interest them, and whether they trust media. Introduce reported speech and passive voice for discussing what "people say".',
    targetGrammar: ['reported speech', 'passive voice', 'discourse markers (however, nevertheless)'],
    targetVocab: ['media', 'journalism', 'social media', 'bias', 'information'],
    successCue: 'User summarises a news story or opinion using reported speech.',
  },
  {
    id: 'hypotheticals',
    title: 'What If? Hypotheticals',
    blurb: 'Explore hypothetical scenarios and conditionals.',
    cefrRange: ['B2', 'C1'],
    prerequisites: ['work-study', 'travel-plans'],
    domains: ['grammar', 'fluency'],
    scenarioBrief: 'Explore hypothetical scenarios — "what would you do if you won the lottery?", "if you could live anywhere, where would it be?". Push for second and third conditionals.',
    targetGrammar: ['second conditional', 'third conditional', 'mixed conditionals (light)'],
    targetVocab: ['hypothetical expressions', 'wishes', 'regrets', 'possibilities'],
    successCue: 'User uses second conditional correctly in at least 2 turns.',
    heatMoments: [
      {
        triggerAfterTurn: 3,
        beat: "Pose a sharp dilemma — a moral trade-off where neither answer is clean. Push them to actually pick one and defend it. Don't accept 'it depends'.",
        expectedRegister: 'opinionated',
      },
    ],
  },
  {
    id: 'emotions-relationships',
    title: 'Emotions & Relationships',
    blurb: 'Talk about feelings, friendships, and relationships.',
    cefrRange: ['B2', 'C1'],
    prerequisites: ['expressing-feelings', 'describing-people'],
    domains: ['vocabulary', 'fluency'],
    scenarioBrief: 'Discuss emotions, friendships, and what makes relationships work. Ask about a memorable friendship or a time they felt proud or disappointed. Introduce nuanced emotion vocabulary.',
    targetGrammar: ['gerunds after prepositions', 'complex adjectives', 'narrative past tenses'],
    targetVocab: ['emotions', 'relationships', 'personality traits', 'empathy phrases'],
    successCue: 'User describes an emotional experience using nuanced vocabulary.',
  },
  {
    id: 'idioms-everyday',
    title: 'Everyday Idioms',
    blurb: 'Learn and use common idioms in natural conversation.',
    cefrRange: ['B2', 'C1'],
    prerequisites: ['opinions', 'work-study'],
    domains: ['vocabulary', 'fluency', 'listening'],
    scenarioBrief: 'Weave 4–5 common idioms into natural conversation (e.g. "break the ice", "hit the nail on the head", "under the weather", "bite the bullet"). Use each idiom in context, explain it naturally if the user looks confused, then check if they can use it back.',
    targetGrammar: ['idiomatic expressions in context', 'informal register', 'phrasal verbs'],
    targetVocab: ['common idioms', 'phrasal verbs', 'informal expressions', 'colloquial language'],
    successCue: 'User correctly uses at least 2 idioms introduced during the session.',
  },
  {
    id: 'passive-voice',
    title: 'Passive Voice in Action',
    blurb: 'Use passive voice naturally in conversation.',
    cefrRange: ['B2', 'C1'],
    prerequisites: ['news-events', 'work-study'],
    domains: ['grammar', 'vocabulary'],
    scenarioBrief: 'Discuss topics that naturally invite passive voice — how things are made, what was discovered, what has been built in the user\'s city. Guide them to use passive constructions without making it feel like a grammar lesson.',
    targetGrammar: ['passive voice (present, past, perfect)', 'passive with modals', 'impersonal passive (it is said that)'],
    targetVocab: ['manufacturing', 'history', 'science', 'urban development'],
    successCue: 'User uses passive voice correctly in at least 3 turns.',
  },
  {
    id: 'collocations',
    title: 'Word Partnerships',
    blurb: 'Master collocations — words that go together naturally.',
    cefrRange: ['B2', 'C1'],
    prerequisites: ['work-study', 'music-arts'],
    domains: ['vocabulary', 'fluency'],
    scenarioBrief: 'Discuss topics rich in collocations — making decisions, taking risks, doing research, having a conversation. Introduce strong collocations naturally and gently correct when the user uses the wrong partner word.',
    targetGrammar: ['verb + noun collocations', 'adjective + noun collocations', 'adverb + adjective collocations'],
    targetVocab: ['make/do/have/take collocations', 'strong adjective collocations', 'business collocations'],
    successCue: 'User uses at least 3 correct collocations without prompting.',
  },
  {
    id: 'formal-informal',
    title: 'Register & Style',
    blurb: 'Switch between formal and informal language.',
    cefrRange: ['B2', 'C1'],
    prerequisites: ['work-study', 'giving-advice'],
    domains: ['vocabulary', 'fluency', 'grammar'],
    scenarioBrief: 'Roleplay two versions of the same situation — first informally (chatting with a friend), then formally (speaking to a manager or official). Help the user notice and practice the differences in vocabulary, grammar, and tone.',
    targetGrammar: ['formal vs informal question forms', 'passive for formality', 'modal verbs for politeness'],
    targetVocab: ['formal vocabulary', 'informal contractions', 'professional phrases', 'register markers'],
    successCue: 'User successfully adjusts their language when you switch the context from informal to formal.',
  },
  {
    id: 'abstract-concepts',
    title: 'Abstract Thinking',
    blurb: 'Discuss abstract ideas — success, happiness, freedom.',
    cefrRange: ['B2', 'C1'],
    prerequisites: ['opinions', 'culture-debate'],
    domains: ['vocabulary', 'fluency', 'grammar'],
    scenarioBrief: 'Explore abstract concepts — what does success mean to the user? Is happiness a choice? What is freedom? Push for complex sentence structures, hedging, and sophisticated argumentation.',
    targetGrammar: ['nominalization', 'complex subordination', 'hedging (tend to, seem to, arguably)'],
    targetVocab: ['abstract nouns', 'philosophical vocabulary', 'argumentation phrases', 'hedging language'],
    successCue: 'User defines an abstract concept and defends their definition.',
  },
  {
    id: 'job-interview',
    title: 'Job Interview',
    blurb: 'Practice a job interview — questions, answers, impressions.',
    cefrRange: ['B2', 'C1'],
    prerequisites: ['work-study', 'formal-informal'],
    domains: ['vocabulary', 'fluency', 'grammar'],
    scenarioBrief: 'Roleplay a job interview. You are the interviewer. Ask about experience, strengths, weaknesses, and why they want the job. Give feedback on their answers. Introduce professional interview language.',
    targetGrammar: ['present perfect for experience', 'second conditional for hypotheticals', 'formal question forms'],
    targetVocab: ['interview vocabulary', 'professional skills', 'strengths/weaknesses language', 'company vocabulary'],
    successCue: 'User answers 4 interview questions using professional language.',
  },
  {
    id: 'persuasion',
    title: 'Persuasion & Argument',
    blurb: 'Convince someone, argue a point, use rhetorical techniques.',
    cefrRange: ['B2', 'C1'],
    prerequisites: ['opinions', 'abstract-concepts'],
    domains: ['fluency', 'vocabulary', 'grammar'],
    scenarioBrief: 'Give the user a position to argue (e.g. "convince me to try a new hobby" or "argue that cities are better than the countryside"). Coach them on persuasive techniques — evidence, examples, rhetorical questions.',
    targetGrammar: ['rhetorical questions', 'concession (although, even though)', 'emphasis structures'],
    targetVocab: ['persuasion phrases', 'rhetorical devices', 'evidence language', 'counter-argument vocabulary'],
    successCue: 'User makes a persuasive argument using at least 2 rhetorical techniques.',
  },
  {
    id: 'travel-culture',
    title: 'Travel & Cultural Immersion',
    blurb: 'Discuss cultural differences, travel experiences, and cultural faux pas.',
    cefrRange: ['B2', 'C1'],
    prerequisites: ['travel-plans', 'culture-debate'],
    domains: ['vocabulary', 'fluency', 'listening'],
    scenarioBrief: 'Discuss cultural differences encountered while travelling — food, customs, social norms, language barriers. Ask about a time the user experienced culture shock or made a cultural mistake. Introduce cultural vocabulary.',
    targetGrammar: ['narrative past tenses', 'contrast connectors (whereas, while)', 'hedging for cultural sensitivity'],
    targetVocab: ['cultural vocabulary', 'travel experiences', 'customs', 'faux pas', 'cultural sensitivity'],
    successCue: 'User describes a cultural experience and reflects on what they learned.',
  },
  {
    id: 'complex-grammar',
    title: 'Complex Grammar in Use',
    blurb: 'Master inversion, cleft sentences, and emphasis structures.',
    cefrRange: ['B2', 'C1'],
    prerequisites: ['formal-informal', 'persuasion'],
    domains: ['grammar', 'fluency'],
    scenarioBrief: 'Weave advanced grammar structures into natural conversation — inversion for emphasis ("Never have I seen…"), cleft sentences ("What I love is…"), fronting ("Interesting though it is…"). Use them naturally and coach the user to try them.',
    targetGrammar: ['inversion for emphasis', 'cleft sentences (it is/what)', 'fronting', 'ellipsis'],
    targetVocab: ['emphasis vocabulary', 'sophisticated connectors', 'formal discourse markers'],
    successCue: 'User attempts and correctly uses at least one advanced emphasis structure.',
  },
]

// ─── C1 — Advanced (10 seeds) ─────────────────────────────────────────────────

const C1_SEEDS: ConversationSeed[] = [
  {
    id: 'nuance-idiom',
    title: 'Nuance & Idiom',
    blurb: 'Idioms, sarcasm, and register shifts.',
    cefrRange: ['C1', 'C2'],
    prerequisites: ['idioms-everyday', 'formal-informal'],
    domains: ['vocabulary', 'fluency', 'listening'],
    scenarioBrief: 'Use idiomatic expressions, light irony, and shift between formal and casual register mid-conversation. Coach them on when each register fits. Introduce 2–3 idioms per session and check if they can use them back.',
    targetGrammar: ['subjunctive (if applicable)', 'inversion for emphasis', 'discourse markers'],
    targetVocab: ['idioms', 'collocations', 'register markers', 'irony signals'],
    successCue: 'User picks up an idiom and re-uses it naturally later in the same session.',
  },
  {
    id: 'abstract-debate',
    title: 'Abstract Ideas',
    blurb: 'Debate abstract concepts — justice, freedom, happiness.',
    cefrRange: ['C1', 'C2'],
    prerequisites: ['abstract-concepts', 'media-news'],
    domains: ['fluency', 'grammar', 'vocabulary'],
    scenarioBrief: 'Debate an abstract concept — what is justice? Can happiness be measured? Is freedom absolute? Push for complex sentence structures, hedging, and sophisticated argumentation. Challenge their views respectfully.',
    targetGrammar: ['complex subordination', 'nominalization', 'advanced hedging'],
    targetVocab: ['abstract nouns', 'philosophical vocabulary', 'argumentation phrases'],
    successCue: 'User sustains a 3-minute argument on an abstract topic with minimal errors.',
  },
  {
    id: 'storytelling',
    title: 'Storytelling & Narrative',
    blurb: 'Tell a compelling story with vivid detail.',
    cefrRange: ['C1', 'C2'],
    prerequisites: ['past-events', 'emotions-relationships'],
    domains: ['fluency', 'grammar', 'vocabulary'],
    scenarioBrief: 'Ask the user to tell a story — real or invented — with vivid detail, suspense, and character. Coach them on narrative techniques: building tension, using dialogue, varying sentence length.',
    targetGrammar: ['narrative tenses', 'direct/indirect speech', 'participle clauses'],
    targetVocab: ['narrative devices', 'vivid verbs', 'sensory language', 'story structure'],
    successCue: 'User tells a story with a clear beginning, middle, and end using varied tenses.',
  },
  {
    id: 'sophisticated-vocab',
    title: 'Sophisticated Vocabulary',
    blurb: 'Use precise, elevated vocabulary in natural speech.',
    cefrRange: ['C1', 'C2'],
    prerequisites: ['collocations', 'abstract-debate'],
    domains: ['vocabulary', 'fluency'],
    scenarioBrief: 'Discuss any topic but deliberately use sophisticated vocabulary — replace "very good" with "exemplary", "show" with "demonstrate", "use" with "utilise". Coach the user to upgrade their word choices naturally.',
    targetGrammar: ['nominalization', 'formal register', 'precise word choice'],
    targetVocab: ['Latinate vocabulary', 'academic word list', 'precise synonyms', 'elevated adjectives'],
    successCue: 'User uses at least 5 sophisticated vocabulary items correctly in one session.',
  },
  {
    id: 'humour-wit',
    title: 'Humour & Wit',
    blurb: 'Understand and use humour, wordplay, and wit.',
    cefrRange: ['C1', 'C2'],
    prerequisites: ['nuance-idiom', 'storytelling'],
    domains: ['vocabulary', 'fluency', 'listening'],
    scenarioBrief: 'Explore humour in the target language — puns, wordplay, self-deprecating humour, irony. Share a funny anecdote and ask the user to share one. Explain why jokes work in the target language and culture.',
    targetGrammar: ['irony markers', 'understatement', 'double meanings'],
    targetVocab: ['humour vocabulary', 'wordplay', 'irony expressions', 'comic timing phrases'],
    successCue: 'User successfully understands a joke or pun and attempts one of their own.',
  },
  {
    id: 'academic-discourse',
    title: 'Academic Discourse',
    blurb: 'Discuss ideas in an academic, structured way.',
    cefrRange: ['C1', 'C2'],
    prerequisites: ['abstract-debate', 'persuasion'],
    domains: ['vocabulary', 'grammar', 'fluency'],
    scenarioBrief: 'Discuss a topic academically — present a thesis, support it with evidence, acknowledge counter-arguments, and conclude. Coach the user on academic discourse markers and formal register.',
    targetGrammar: ['academic discourse markers', 'passive for objectivity', 'complex noun phrases'],
    targetVocab: ['academic vocabulary', 'hedging language', 'citation phrases', 'logical connectors'],
    successCue: 'User presents a structured argument with thesis, evidence, and conclusion.',
  },
  {
    id: 'cultural-references',
    title: 'Cultural References & Allusions',
    blurb: 'Understand and use cultural references, proverbs, and allusions.',
    cefrRange: ['C1', 'C2'],
    prerequisites: ['culture-debate', 'nuance-idiom'],
    domains: ['vocabulary', 'listening', 'fluency'],
    scenarioBrief: 'Introduce cultural references specific to the target language — famous proverbs, literary allusions, historical references, pop culture. Explain their meaning and context, then check if the user can use them appropriately.',
    targetGrammar: ['allusion and reference structures', 'proverb patterns', 'cultural hedging'],
    targetVocab: ['proverbs', 'cultural allusions', 'historical references', 'literary vocabulary'],
    successCue: 'User correctly uses or explains a cultural reference introduced during the session.',
  },
  {
    id: 'negotiation',
    title: 'Negotiation & Diplomacy',
    blurb: 'Negotiate, compromise, and find common ground.',
    cefrRange: ['C1', 'C2'],
    prerequisites: ['job-interview', 'persuasion'],
    domains: ['vocabulary', 'fluency', 'grammar'],
    scenarioBrief: 'Roleplay a negotiation — a salary discussion, a business deal, or a compromise between friends. Coach the user on diplomatic language, making concessions, and finding win-win solutions.',
    targetGrammar: ['conditional structures for negotiation', 'hedging for diplomacy', 'concession language'],
    targetVocab: ['negotiation vocabulary', 'diplomatic phrases', 'compromise language', 'business terms'],
    successCue: 'User reaches a negotiated outcome using diplomatic language.',
  },
  {
    id: 'metaphor-imagery',
    title: 'Metaphor & Imagery',
    blurb: 'Use metaphors, similes, and vivid imagery in speech.',
    cefrRange: ['C1', 'C2'],
    prerequisites: ['storytelling', 'sophisticated-vocab'],
    domains: ['vocabulary', 'fluency'],
    scenarioBrief: 'Explore figurative language — metaphors, similes, personification. Discuss how the target language uses imagery differently from English. Ask the user to describe abstract concepts using metaphors.',
    targetGrammar: ['simile structures (as…as, like)', 'metaphorical extensions', 'personification'],
    targetVocab: ['figurative language', 'imagery vocabulary', 'poetic expressions', 'extended metaphors'],
    successCue: 'User creates an original metaphor or simile to describe an abstract concept.',
  },
  {
    id: 'professional-presentation',
    title: 'Professional Presentation',
    blurb: 'Present ideas clearly and persuasively in a professional context.',
    cefrRange: ['C1', 'C2'],
    prerequisites: ['academic-discourse', 'negotiation'],
    domains: ['fluency', 'vocabulary', 'grammar'],
    scenarioBrief: 'Ask the user to give a short (2-minute) presentation on any topic they know well. Coach them on structure, signposting language, and engaging the audience. Give feedback on clarity and vocabulary.',
    targetGrammar: ['signposting language', 'discourse markers for structure', 'rhetorical questions'],
    targetVocab: ['presentation vocabulary', 'signposting phrases', 'professional register', 'audience engagement'],
    successCue: 'User delivers a structured 2-minute presentation with clear signposting.',
  },
]

// ─── C2 — Native Mastery (10 seeds) ──────────────────────────────────────────

const C2_SEEDS: ConversationSeed[] = [
  {
    id: 'native-fluency',
    title: 'Native-Speed Conversation',
    blurb: 'Converse at full native speed with no simplification.',
    cefrRange: ['C2', 'C2'],
    prerequisites: ['nuance-idiom', 'professional-presentation'],
    domains: ['fluency', 'listening', 'vocabulary'],
    scenarioBrief: 'Have a completely natural, native-speed conversation on any topic. No simplification, no slowing down, no glossing. Treat the user as a peer. Comment only on style, not correctness.',
    targetGrammar: ['full native grammar range', 'ellipsis', 'spoken grammar features'],
    targetVocab: ['full native vocabulary range', 'slang', 'colloquialisms', 'regional expressions'],
    successCue: 'User sustains a 5-minute natural conversation without requesting clarification.',
  },
  {
    id: 'literary-language',
    title: 'Literary Language',
    blurb: 'Discuss literature, poetry, and elevated prose.',
    cefrRange: ['C2', 'C2'],
    prerequisites: ['storytelling', 'metaphor-imagery'],
    domains: ['vocabulary', 'fluency', 'listening'],
    scenarioBrief: 'Discuss a piece of literature, poetry, or elevated prose in the target language. Analyse language choices, themes, and style. Ask the user to interpret a passage and express their reaction.',
    targetGrammar: ['literary tenses', 'subjunctive in literary contexts', 'complex sentence structures'],
    targetVocab: ['literary vocabulary', 'critical analysis terms', 'poetic devices', 'thematic vocabulary'],
    successCue: 'User analyses a piece of language and expresses a nuanced interpretation.',
  },
  {
    id: 'philosophy-ethics',
    title: 'Philosophy & Ethics',
    blurb: 'Debate philosophical and ethical questions at depth.',
    cefrRange: ['C2', 'C2'],
    prerequisites: ['abstract-debate', 'academic-discourse'],
    domains: ['fluency', 'vocabulary', 'grammar'],
    scenarioBrief: 'Debate a philosophical or ethical question — the trolley problem, the nature of consciousness, the ethics of AI. Push for nuanced, multi-perspective thinking. Challenge assumptions respectfully.',
    targetGrammar: ['complex conditional structures', 'subjunctive for hypotheticals', 'sophisticated hedging'],
    targetVocab: ['philosophical vocabulary', 'ethical terms', 'logical fallacy names', 'epistemological language'],
    successCue: 'User presents a multi-perspective argument on a philosophical question.',
  },
  {
    id: 'wordplay-puns',
    title: 'Wordplay & Puns',
    blurb: 'Master puns, double meanings, and linguistic humour.',
    cefrRange: ['C2', 'C2'],
    prerequisites: ['humour-wit', 'literary-language'],
    domains: ['vocabulary', 'fluency', 'listening'],
    scenarioBrief: 'Explore wordplay specific to the target language — puns that only work in that language, double meanings, tongue twisters, and linguistic jokes. Explain why they work and challenge the user to create their own.',
    targetGrammar: ['homophone awareness', 'polysemy', 'syntactic ambiguity'],
    targetVocab: ['wordplay vocabulary', 'homophones', 'polysemous words', 'tongue twisters'],
    successCue: 'User creates an original pun or wordplay in the target language.',
  },
  {
    id: 'dialect-variation',
    title: 'Dialect & Regional Variation',
    blurb: 'Understand regional accents, dialects, and slang.',
    cefrRange: ['C2', 'C2'],
    prerequisites: ['cultural-references', 'native-fluency'],
    domains: ['listening', 'vocabulary', 'fluency'],
    scenarioBrief: 'Introduce regional variations of the target language — different accents, dialects, slang terms. Discuss how the language varies across regions and social groups. Help the user understand and appreciate this variation.',
    targetGrammar: ['dialectal grammar variations', 'code-switching', 'register variation'],
    targetVocab: ['regional slang', 'dialectal vocabulary', 'sociolinguistic terms', 'informal registers'],
    successCue: 'User identifies and correctly uses at least 2 regional or dialectal expressions.',
  },
  {
    id: 'spontaneous-debate',
    title: 'Spontaneous Debate',
    blurb: 'Argue any position spontaneously, even one you disagree with.',
    cefrRange: ['C2', 'C2'],
    prerequisites: ['persuasion', 'philosophy-ethics'],
    domains: ['fluency', 'vocabulary', 'grammar'],
    scenarioBrief: 'Assign the user a position to argue — even one they disagree with. Give them 30 seconds to prepare, then debate. Switch sides halfway through. Focus on spontaneous argumentation and quick thinking.',
    targetGrammar: ['rapid conditional structures', 'concession and rebuttal', 'rhetorical devices'],
    targetVocab: ['debate vocabulary', 'rebuttal phrases', 'concession language', 'spontaneous discourse markers'],
    successCue: 'User argues a position convincingly for 2 minutes, then successfully argues the opposite.',
  },
  {
    id: 'creative-writing-spoken',
    title: 'Creative Expression',
    blurb: 'Create stories, poems, or descriptions spontaneously.',
    cefrRange: ['C2', 'C2'],
    prerequisites: ['storytelling', 'metaphor-imagery'],
    domains: ['vocabulary', 'fluency', 'grammar'],
    scenarioBrief: 'Give the user a creative prompt — describe a scene using only sensory language, invent a character in 60 seconds, or continue a story from a single sentence. Focus on creative spontaneity and vivid expression.',
    targetGrammar: ['creative grammar structures', 'stream of consciousness', 'poetic syntax'],
    targetVocab: ['sensory vocabulary', 'creative expression', 'vivid verbs', 'poetic language'],
    successCue: 'User produces a creative response that is vivid, original, and linguistically rich.',
  },
  {
    id: 'professional-writing-spoken',
    title: 'Professional Writing Style (Spoken)',
    blurb: 'Speak in a way that sounds like polished professional writing.',
    cefrRange: ['C2', 'C2'],
    prerequisites: ['professional-presentation', 'academic-discourse'],
    domains: ['vocabulary', 'grammar', 'fluency'],
    scenarioBrief: 'Ask the user to explain complex topics as if writing a professional report or article — but spoken. Coach them on precision, economy of language, and professional register. Give feedback on word choice and structure.',
    targetGrammar: ['nominalization', 'complex noun phrases', 'formal passive', 'concise structures'],
    targetVocab: ['professional register', 'technical vocabulary', 'precise language', 'formal connectors'],
    successCue: 'User explains a complex topic in a way that sounds polished and professional.',
  },
  {
    id: 'cross-cultural-communication',
    title: 'Cross-Cultural Communication',
    blurb: 'Navigate cultural misunderstandings and communicate across cultures.',
    cefrRange: ['C2', 'C2'],
    prerequisites: ['travel-culture', 'dialect-variation'],
    domains: ['vocabulary', 'fluency', 'listening'],
    scenarioBrief: 'Roleplay cross-cultural communication scenarios — a business meeting with different cultural norms, a social situation with different expectations. Coach the user on cultural sensitivity and adaptive communication.',
    targetGrammar: ['indirect speech for diplomacy', 'hedging for cultural sensitivity', 'formal/informal switching'],
    targetVocab: ['cross-cultural vocabulary', 'diplomatic language', 'cultural sensitivity terms', 'intercultural communication'],
    successCue: 'User navigates a cross-cultural scenario with appropriate sensitivity and language.',
  },
  {
    id: 'mastery-freeform',
    title: 'Free Conversation — Mastery',
    blurb: 'Completely free conversation at native level on any topic.',
    cefrRange: ['C2', 'C2'],
    prerequisites: ['native-fluency', 'spontaneous-debate'],
    domains: ['fluency', 'vocabulary', 'grammar', 'listening'],
    scenarioBrief: 'Have a completely free, unstructured conversation. The user chooses the topic. You respond as a native speaker peer — no teaching, no corrections unless something is genuinely wrong. The goal is pure fluency and enjoyment.',
    targetGrammar: ['full native grammar range'],
    targetVocab: ['full native vocabulary range'],
    successCue: 'User sustains a 10-minute free conversation with native-level fluency.',
  },
]

// ─── Additional Scenarios (expanding coverage) ────────────────────────────────

const EXTRA_A1_SEEDS: ConversationSeed[] = [
  { id: 'weather-basic', title: 'Today\'s Weather', blurb: 'Talk about hot, cold, rain, sun.', cefrRange: ['A1', 'A2'], prerequisites: ['greetings'], domains: ['vocabulary', 'listening'], scenarioBrief: 'Simple weather chat. Ask if it is hot or cold today. Use only basic weather words. Very short sentences.', targetGrammar: ['it is + adjective', 'today/tomorrow'], targetVocab: ['hot', 'cold', 'rain', 'sun', 'wind', 'snow'], successCue: 'User describes today\'s weather in 2+ sentences.' },
  { id: 'classroom-words', title: 'In the Classroom', blurb: 'Learn words for school objects.', cefrRange: ['A1', 'A2'], prerequisites: ['greetings'], domains: ['vocabulary'], scenarioBrief: 'Name classroom objects — pen, book, table, chair. Play a pointing game.', targetGrammar: ['this is / that is', 'what is this?'], targetVocab: ['pen', 'book', 'table', 'chair', 'board', 'bag'], successCue: 'User names 5 classroom objects.' },
  { id: 'body-parts', title: 'My Body', blurb: 'Name body parts and describe yourself.', cefrRange: ['A1', 'A2'], prerequisites: ['colors-objects'], domains: ['vocabulary', 'grammar'], scenarioBrief: 'Name body parts. Play "touch your nose" game. Describe hair and eye color.', targetGrammar: ['I have + noun', 'my + body part'], targetVocab: ['head', 'hand', 'eye', 'nose', 'mouth', 'hair'], successCue: 'User describes their appearance using 3+ body parts.' },
  { id: 'emotions-basic', title: 'How Do You Feel?', blurb: 'Happy, sad, tired, hungry.', cefrRange: ['A1', 'A2'], prerequisites: ['greetings'], domains: ['vocabulary', 'listening'], scenarioBrief: 'Ask how the user feels. Teach basic emotion words. Very simple.', targetGrammar: ['I am + adjective', 'are you + adjective?'], targetVocab: ['happy', 'sad', 'tired', 'hungry', 'thirsty', 'good'], successCue: 'User expresses how they feel and asks you back.' },
  { id: 'pets', title: 'Pets & Animals', blurb: 'Talk about cats, dogs, and pets.', cefrRange: ['A1', 'A2'], prerequisites: ['family'], domains: ['vocabulary', 'grammar'], scenarioBrief: 'Ask about pets. Do they have a cat or dog? What color? What name?', targetGrammar: ['I have / I don\'t have', 'it is + adjective'], targetVocab: ['cat', 'dog', 'fish', 'bird', 'big', 'small', 'name'], successCue: 'User describes a pet (real or imaginary) with 2+ details.' },
]

const EXTRA_A2_SEEDS: ConversationSeed[] = [
  { id: 'weekend-plans', title: 'Weekend Plans', blurb: 'Talk about what you will do this weekend.', cefrRange: ['A2', 'B1'], prerequisites: ['daily-routine'], domains: ['grammar', 'fluency'], scenarioBrief: 'Discuss weekend plans. Use going to + verb. Ask about activities.', targetGrammar: ['going to + verb', 'want to + verb', 'time expressions'], targetVocab: ['weekend activities', 'plans', 'places to go'], successCue: 'User describes 3 weekend plans using future forms.' },
  { id: 'cooking-basic', title: 'Simple Cooking', blurb: 'Describe how to make a simple dish.', cefrRange: ['A2', 'B1'], prerequisites: ['food-preferences'], domains: ['vocabulary', 'grammar'], scenarioBrief: 'Ask the user to describe how to make their favourite simple dish. Introduce cooking verbs.', targetGrammar: ['imperatives', 'sequence words (first, then, after)'], targetVocab: ['cooking verbs', 'ingredients', 'kitchen tools'], successCue: 'User explains a recipe using 4+ steps.' },
  { id: 'clothes-fashion', title: 'What Are You Wearing?', blurb: 'Describe clothes and outfits.', cefrRange: ['A2', 'B1'], prerequisites: ['shopping', 'colors-objects'], domains: ['vocabulary', 'grammar'], scenarioBrief: 'Describe what you\'re wearing. Ask about favourite clothes. Introduce clothing vocabulary.', targetGrammar: ['present continuous for current state', 'adjective order'], targetVocab: ['clothing items', 'colors', 'materials', 'style adjectives'], successCue: 'User describes their outfit using 3+ items with adjectives.' },
  { id: 'movies-tv', title: 'Movies & TV Shows', blurb: 'Talk about what you watch.', cefrRange: ['A2', 'B1'], prerequisites: ['likes-dislikes'], domains: ['vocabulary', 'fluency'], scenarioBrief: 'Discuss favourite movies and TV shows. Ask what genre they like and why.', targetGrammar: ['present simple for opinions', 'because + reason', 'comparatives'], targetVocab: ['movie genres', 'TV vocabulary', 'opinion phrases'], successCue: 'User recommends a movie/show and gives a reason.' },
  { id: 'apartment-hunting', title: 'Finding a Home', blurb: 'Describe what you want in a home.', cefrRange: ['A2', 'B1'], prerequisites: ['home-rooms', 'numbers-time'], domains: ['vocabulary', 'grammar'], scenarioBrief: 'Roleplay: user is looking for an apartment. Ask what they need — rooms, location, price.', targetGrammar: ['I need / I want', 'there must be', 'comparatives'], targetVocab: ['apartment vocabulary', 'location words', 'amenities'], successCue: 'User describes their ideal home with 4+ requirements.' },
  { id: 'social-media', title: 'Social Media', blurb: 'Talk about apps, posts, and online life.', cefrRange: ['A2', 'B1'], prerequisites: ['hobbies-free-time'], domains: ['vocabulary', 'fluency'], scenarioBrief: 'Discuss social media habits. Which apps? How often? What do they post?', targetGrammar: ['frequency adverbs', 'present simple for habits', 'like + gerund'], targetVocab: ['social media apps', 'posting', 'following', 'sharing'], successCue: 'User describes their social media habits with frequency.' },
  { id: 'at-the-gym', title: 'At the Gym', blurb: 'Talk about exercise and fitness.', cefrRange: ['A2', 'B1'], prerequisites: ['hobbies-free-time', 'health-body'], domains: ['vocabulary', 'grammar'], scenarioBrief: 'Discuss exercise habits. What sports? How often? Introduce fitness vocabulary.', targetGrammar: ['frequency expressions', 'can/can\'t for ability', 'want to + verb'], targetVocab: ['exercise types', 'gym equipment', 'fitness goals'], successCue: 'User describes their exercise routine with frequency.' },
  { id: 'birthday-party', title: 'Planning a Party', blurb: 'Plan a birthday party together.', cefrRange: ['A2', 'B1'], prerequisites: ['celebrations', 'making-plans'], domains: ['vocabulary', 'fluency', 'grammar'], scenarioBrief: 'Plan a birthday party together. Discuss food, guests, activities, time.', targetGrammar: ['let\'s + verb', 'shall we...?', 'future with will'], targetVocab: ['party vocabulary', 'food', 'decorations', 'activities'], successCue: 'User helps plan a party with 3+ decisions made.' },
]

const EXTRA_B1_SEEDS: ConversationSeed[] = [
  { id: 'childhood-memories', title: 'Childhood Memories', blurb: 'Talk about growing up and childhood experiences.', cefrRange: ['B1', 'B2'], prerequisites: ['past-events', 'family'], domains: ['grammar', 'fluency', 'vocabulary'], scenarioBrief: 'Discuss childhood memories — games, school, friends, family traditions. Push for used to + verb and past continuous.', targetGrammar: ['used to + verb', 'past continuous', 'would for past habits'], targetVocab: ['childhood vocabulary', 'games', 'school memories', 'nostalgia'], successCue: 'User describes 2+ childhood memories using "used to" correctly.' },
  { id: 'money-finance', title: 'Money & Spending', blurb: 'Talk about saving, spending, and budgets.', cefrRange: ['B1', 'B2'], prerequisites: ['shopping', 'work-study'], domains: ['vocabulary', 'grammar', 'fluency'], scenarioBrief: 'Discuss money habits — saving, spending, budgets. Ask about financial goals.', targetGrammar: ['first conditional for plans', 'should/shouldn\'t for advice', 'comparatives'], targetVocab: ['money vocabulary', 'banking', 'saving', 'spending habits'], successCue: 'User gives financial advice using modal verbs.' },
  { id: 'dream-job', title: 'Dream Job', blurb: 'Describe your ideal career.', cefrRange: ['B1', 'B2'], prerequisites: ['work-study', 'opinions'], domains: ['vocabulary', 'fluency', 'grammar'], scenarioBrief: 'Discuss dream jobs. What would they do? Why? What skills do they need?', targetGrammar: ['second conditional', 'would + verb', 'need to / have to'], targetVocab: ['career vocabulary', 'skills', 'qualifications', 'ambitions'], successCue: 'User describes their dream job using conditional structures.' },
  { id: 'social-issues', title: 'Social Issues', blurb: 'Discuss problems in society and possible solutions.', cefrRange: ['B1', 'B2'], prerequisites: ['environment', 'opinions'], domains: ['vocabulary', 'fluency', 'grammar'], scenarioBrief: 'Discuss a social issue — education, inequality, technology impact. Ask for opinions and solutions.', targetGrammar: ['passive voice', 'should/must for obligation', 'cause and effect'], targetVocab: ['social issues', 'solutions', 'problems', 'society'], successCue: 'User explains a social problem and proposes a solution.' },
  { id: 'booking-hotel', title: 'Booking a Hotel', blurb: 'Reserve a room, ask about amenities, handle problems.', cefrRange: ['B1', 'B2'], prerequisites: ['travel-plans', 'phone-messages'], domains: ['vocabulary', 'fluency', 'grammar'], scenarioBrief: 'Roleplay: user calls to book a hotel. Discuss dates, room types, amenities, and handle a problem (no availability, wrong dates).', targetGrammar: ['polite requests (could/would)', 'indirect questions', 'future arrangements'], targetVocab: ['hotel vocabulary', 'amenities', 'booking language', 'complaint phrases'], successCue: 'User successfully books a room and handles one complication.' },
  { id: 'personality-quiz', title: 'Personality & Character', blurb: 'Describe personality types and discuss what makes people tick.', cefrRange: ['B1', 'B2'], prerequisites: ['describing-people', 'opinions'], domains: ['vocabulary', 'fluency'], scenarioBrief: 'Discuss personality types. Are they introverted or extroverted? What are their strengths?', targetGrammar: ['tend to + verb', 'adjective + enough / too + adjective', 'relative clauses'], targetVocab: ['personality adjectives', 'character traits', 'strengths/weaknesses'], successCue: 'User describes their personality using 4+ nuanced adjectives.' },
  { id: 'complaining-politely', title: 'Polite Complaints', blurb: 'Complain about a service or product politely.', cefrRange: ['B1', 'B2'], prerequisites: ['restaurant', 'shopping'], domains: ['vocabulary', 'fluency', 'grammar'], scenarioBrief: 'Roleplay: user needs to complain — wrong order, broken product, bad service. Teach polite complaint language.', targetGrammar: ['I\'m afraid...', 'would it be possible...', 'past simple for explaining'], targetVocab: ['complaint phrases', 'resolution language', 'polite hedging'], successCue: 'User makes a polite complaint and negotiates a resolution.' },
  { id: 'storytelling-basic', title: 'Tell Me a Story', blurb: 'Tell a short story about something that happened.', cefrRange: ['B1', 'B2'], prerequisites: ['past-events'], domains: ['grammar', 'fluency'], scenarioBrief: 'Ask the user to tell a story — funny, scary, or interesting. Coach on narrative structure.', targetGrammar: ['past simple + continuous', 'time connectors', 'direct speech'], targetVocab: ['narrative verbs', 'time expressions', 'emotion words'], successCue: 'User tells a coherent 5+ sentence story with varied past tenses.' },
  { id: 'superstitions', title: 'Superstitions & Beliefs', blurb: 'Discuss superstitions, luck, and cultural beliefs.', cefrRange: ['B1', 'B2'], prerequisites: ['celebrations', 'opinions'], domains: ['vocabulary', 'fluency'], scenarioBrief: 'Discuss superstitions from different cultures. Do they believe in luck? What brings good/bad luck?', targetGrammar: ['first conditional', 'if + present simple', 'believe/think that'], targetVocab: ['superstition vocabulary', 'luck', 'beliefs', 'cultural practices'], successCue: 'User describes 2+ superstitions and gives their opinion.' },
  { id: 'moving-house', title: 'Moving to a New Place', blurb: 'Talk about moving, packing, and settling in.', cefrRange: ['B1', 'B2'], prerequisites: ['home-rooms', 'daily-routine'], domains: ['vocabulary', 'grammar', 'fluency'], scenarioBrief: 'Discuss the experience of moving — packing, finding a new place, meeting neighbours.', targetGrammar: ['present perfect for recent events', 'have to / need to', 'time expressions'], targetVocab: ['moving vocabulary', 'household items', 'neighbourhood'], successCue: 'User describes a moving experience using present perfect.' },
]

const EXTRA_B2_SEEDS: ConversationSeed[] = [
  { id: 'ethical-dilemmas', title: 'Ethical Dilemmas', blurb: 'Discuss moral choices and justify your position.', cefrRange: ['B2', 'C1'], prerequisites: ['hypotheticals', 'opinions'], domains: ['fluency', 'vocabulary', 'grammar'], scenarioBrief: 'Present ethical dilemmas. Push for nuanced argumentation and hedging.', targetGrammar: ['mixed conditionals', 'concession (although, despite)', 'hedging'], targetVocab: ['ethics vocabulary', 'moral language', 'justification phrases'], successCue: 'User argues both sides of an ethical dilemma.' },
  { id: 'technology-future', title: 'Technology & The Future', blurb: 'Discuss AI, automation, and what the future holds.', cefrRange: ['B2', 'C1'], prerequisites: ['technology', 'hypotheticals'], domains: ['vocabulary', 'fluency', 'grammar'], scenarioBrief: 'Discuss future technology — AI, automation, space travel. Push for speculation and complex conditionals.', targetGrammar: ['future perfect', 'may/might/could for speculation', 'by the time + clause'], targetVocab: ['technology vocabulary', 'future predictions', 'innovation'], successCue: 'User makes 3+ predictions about the future using varied structures.' },
  { id: 'mental-health', title: 'Mental Health & Wellbeing', blurb: 'Discuss stress, self-care, and mental health awareness.', cefrRange: ['B2', 'C1'], prerequisites: ['expressing-feelings', 'giving-advice'], domains: ['vocabulary', 'fluency'], scenarioBrief: 'Discuss mental health — stress management, self-care, work-life balance. Sensitive but important topic.', targetGrammar: ['gerunds as subjects', 'it\'s important to/that', 'advice structures'], targetVocab: ['mental health vocabulary', 'wellbeing', 'self-care', 'stress management'], successCue: 'User discusses mental health using appropriate vocabulary and gives advice.' },
  { id: 'education-debate', title: 'Education Systems', blurb: 'Compare education systems and discuss what makes good education.', cefrRange: ['B2', 'C1'], prerequisites: ['school-education', 'culture-debate'], domains: ['vocabulary', 'fluency', 'grammar'], scenarioBrief: 'Compare education systems. What works? What doesn\'t? Push for complex comparisons.', targetGrammar: ['complex comparatives', 'passive voice', 'whereas/while for contrast'], targetVocab: ['education vocabulary', 'academic terms', 'comparison language'], successCue: 'User compares two education approaches with evidence.' },
  { id: 'climate-action', title: 'Climate & Action', blurb: 'Discuss climate change solutions and personal responsibility.', cefrRange: ['B2', 'C1'], prerequisites: ['environment', 'persuasion'], domains: ['vocabulary', 'fluency', 'grammar'], scenarioBrief: 'Discuss climate change — causes, solutions, personal vs systemic responsibility. Push for argumentation.', targetGrammar: ['passive for processes', 'unless/provided that', 'cause and effect structures'], targetVocab: ['climate vocabulary', 'sustainability', 'policy language', 'environmental action'], successCue: 'User argues for a specific climate solution with evidence.' },
  { id: 'art-criticism', title: 'Art & Criticism', blurb: 'Discuss art, beauty, and what makes something "good."', cefrRange: ['B2', 'C1'], prerequisites: ['music-arts', 'abstract-concepts'], domains: ['vocabulary', 'fluency'], scenarioBrief: 'Discuss art — what is beauty? What makes art "good"? Push for abstract thinking and sophisticated vocabulary.', targetGrammar: ['subjective language', 'hedging (arguably, to some extent)', 'complex noun phrases'], targetVocab: ['art vocabulary', 'aesthetic terms', 'criticism language', 'abstract adjectives'], successCue: 'User expresses a nuanced opinion about art using sophisticated vocabulary.' },
  { id: 'conflict-resolution', title: 'Resolving Conflicts', blurb: 'Discuss how to handle disagreements and find solutions.', cefrRange: ['B2', 'C1'], prerequisites: ['giving-advice', 'emotions-relationships'], domains: ['vocabulary', 'fluency', 'grammar'], scenarioBrief: 'Discuss conflict resolution — at work, with friends, in families. Roleplay a disagreement and find a solution.', targetGrammar: ['I wish + past', 'if only + past perfect', 'diplomatic language'], targetVocab: ['conflict vocabulary', 'resolution phrases', 'compromise language', 'empathy expressions'], successCue: 'User resolves a roleplay conflict using diplomatic language.' },
  { id: 'media-literacy', title: 'Media Literacy', blurb: 'Discuss fake news, bias, and critical thinking.', cefrRange: ['B2', 'C1'], prerequisites: ['media-news', 'technology'], domains: ['vocabulary', 'fluency', 'grammar'], scenarioBrief: 'Discuss media literacy — how to spot fake news, understand bias, think critically about information.', targetGrammar: ['reported speech', 'passive for attribution', 'hedging for uncertainty'], targetVocab: ['media literacy', 'bias', 'critical thinking', 'source evaluation'], successCue: 'User explains how to evaluate a news source using appropriate vocabulary.' },
]

// ─── Combined export ──────────────────────────────────────────────────────────

export const SEEDS: ConversationSeed[] = [
  ...A1_SEEDS,
  ...EXTRA_A1_SEEDS,
  ...A2_SEEDS,
  ...EXTRA_A2_SEEDS,
  ...B1_SEEDS,
  ...EXTRA_B1_SEEDS,
  ...B2_SEEDS,
  ...EXTRA_B2_SEEDS,
  ...C1_SEEDS,
  ...C2_SEEDS,
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getSeedById(id: string): ConversationSeed | undefined {
  return SEEDS.find((s) => s.id === id)
}

const CEFR_ORDER: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function cefrIndex(cefr: CefrLevel): number {
  return CEFR_ORDER.indexOf(cefr)
}

export function cefrFromIndex(idx: number): CefrLevel {
  return CEFR_ORDER[Math.max(0, Math.min(CEFR_ORDER.length - 1, idx))]
}

export function cefrToLevel(cefr: CefrLevel): 'beginner' | 'intermediate' | 'advanced' {
  if (cefr === 'A1' || cefr === 'A2') return 'beginner'
  if (cefr === 'B1' || cefr === 'B2') return 'intermediate'
  return 'advanced'
}

export function getUnlockedSeeds(completedIds: string[]): ConversationSeed[] {
  const done = new Set(completedIds)
  return SEEDS.filter((s) => s.prerequisites.every((p) => done.has(p)))
}

export function pickNextSeed(
  domainScores: Record<SkillDomain, CefrLevel>,
  completedIds: string[],
  currentSeedId?: string
): ConversationSeed {
  const done = new Set(completedIds)
  const unlocked = getUnlockedSeeds(completedIds)
  if (unlocked.length === 0) return SEEDS[0]

  const weakestDomain = (Object.entries(domainScores) as [SkillDomain, CefrLevel][])
    .sort((a, b) => cefrIndex(a[1]) - cefrIndex(b[1]))[0][0]
  const weakestCefr = domainScores[weakestDomain]
  const weakestIdx = cefrIndex(weakestCefr)

  const appropriate = unlocked.filter((s) => {
    const [min, max] = s.cefrRange
    return cefrIndex(min) <= weakestIdx + 1 && cefrIndex(max) >= weakestIdx - 1
  })
  const pool = appropriate.length > 0 ? appropriate : unlocked

  const incomplete = pool.filter((s) => !done.has(s.id) && s.id !== currentSeedId)
  const domainMatch = incomplete.filter((s) => s.domains.includes(weakestDomain))

  if (domainMatch.length > 0) return domainMatch[0]
  if (incomplete.length > 0) return incomplete[0]

  const replay = pool.filter((s) => s.domains.includes(weakestDomain))
  return replay[0] ?? pool[0]
}

export function getStartingSeedForCefr(cefr: CefrLevel): ConversationSeed {
  const idx = cefrIndex(cefr)
  const match = SEEDS.find((s) => {
    const [min, max] = s.cefrRange
    return cefrIndex(min) <= idx && cefrIndex(max) >= idx
  })
  return match ?? SEEDS[0]
}

export function getStartingSeedForLevel(level: 'beginner' | 'intermediate' | 'advanced'): ConversationSeed {
  if (level === 'beginner')     return getStartingSeedForCefr('A1')
  if (level === 'intermediate') return getStartingSeedForCefr('B1')
  return getStartingSeedForCefr('B2')
}

// ─── Backwards-compat aliases ─────────────────────────────────────────────────

export type CurriculumUnit = ConversationSeed & { cefr: CefrLevel }

export function getUnitById(id: string): CurriculumUnit | undefined {
  const s = getSeedById(id)
  if (!s) return undefined
  return { ...s, cefr: s.cefrRange[0] }
}

export function getNextUnit(currentId: string | undefined): CurriculumUnit {
  const idx = SEEDS.findIndex((s) => s.id === currentId)
  const next = SEEDS[idx + 1] ?? SEEDS[SEEDS.length - 1]
  return { ...next, cefr: next.cefrRange[0] }
}

export function getStartingUnitForCefr(cefr: CefrLevel): CurriculumUnit {
  const s = getStartingSeedForCefr(cefr)
  return { ...s, cefr: s.cefrRange[0] }
}

export function getStartingUnitForLevel(level: 'beginner' | 'intermediate' | 'advanced'): CurriculumUnit {
  const s = getStartingSeedForLevel(level)
  return { ...s, cefr: s.cefrRange[0] }
}

export const CURRICULUM = SEEDS.map((s) => ({ ...s, cefr: s.cefrRange[0] }))

// ─── Scenario System (conversation-first approach) ────────────────────────────

/**
 * User-friendly scenario representation for the UI.
 * All 69 seeds become selectable conversation topics.
 */
export interface Scenario {
  id: string
  title: string
  description: string  // Use seed's blurb
  category: string     // Derived from seed domains/title
  difficulty: string   // CEFR range as string
}

/**
 * Free Talk mode - no scenario constraints
 */
export const FREE_TALK_SCENARIO: Scenario = {
  id: 'free-talk',
  title: 'Free Conversation',
  description: 'Chat about whatever comes to mind. No topic restrictions.',
  category: 'Free Talk',
  difficulty: 'All levels',
}

/**
 * Convert all seeds to user-friendly scenarios for display
 */
export function getScenarios(): Scenario[] {
  return [
    FREE_TALK_SCENARIO,
    ...SEEDS.map(seed => ({
      id: seed.id,
      title: seed.title,
      description: seed.blurb,
      category: inferCategory(seed),
      difficulty: `${seed.cefrRange[0]}-${seed.cefrRange[1]}`,
    }))
  ]
}

/**
 * Infer a user-friendly category from seed content
 */
function inferCategory(seed: ConversationSeed): string {
  const id = seed.id.toLowerCase()
  const title = seed.title.toLowerCase()
  
  // Food & Dining
  if (id.includes('cafe') || id.includes('restaurant') || id.includes('food') || 
      id.includes('cooking') || id.includes('meal') || id.includes('recipe')) {
    return 'Food & Dining'
  }
  
  // Travel
  if (id.includes('travel') || id.includes('directions') || id.includes('hotel') ||
      id.includes('airport') || id.includes('tourism') || id.includes('journey')) {
    return 'Travel'
  }
  
  // Work & Career
  if (id.includes('work') || id.includes('job') || id.includes('interview') ||
      id.includes('business') || id.includes('office') || id.includes('career')) {
    return 'Work & Career'
  }
  
  // Social & Relationships
  if (id.includes('family') || id.includes('friends') || id.includes('dating') ||
      id.includes('party') || id.includes('social') || id.includes('relationship')) {
    return 'Social & Relationships'
  }
  
  // Culture & Society
  if (id.includes('culture') || id.includes('debate') || id.includes('politics') ||
      id.includes('history') || id.includes('society') || id.includes('tradition')) {
    return 'Culture & Society'
  }
  
  // Shopping & Services
  if (id.includes('shopping') || id.includes('store') || id.includes('market') ||
      id.includes('bank') || id.includes('pharmacy') || id.includes('service')) {
    return 'Shopping & Services'
  }
  
  // Health & Wellness
  if (id.includes('health') || id.includes('doctor') || id.includes('exercise') ||
      id.includes('fitness') || id.includes('wellness') || id.includes('medical')) {
    return 'Health & Wellness'
  }
  
  // Education & Learning
  if (id.includes('school') || id.includes('study') || id.includes('learning') ||
      id.includes('education') || id.includes('classroom') || id.includes('teacher')) {
    return 'Education & Learning'
  }
  
  // Entertainment & Hobbies
  if (id.includes('music') || id.includes('movie') || id.includes('sport') ||
      id.includes('hobby') || id.includes('game') || id.includes('entertainment')) {
    return 'Entertainment & Hobbies'
  }
  
  // Daily Life (default)
  return 'Daily Life'
}

// Export dynamic scenario loader


// ─── Lesson Templates (structured teaching paths) ─────────────────────────────
export * from './lesson-templates'
export * from './l1-interference'
