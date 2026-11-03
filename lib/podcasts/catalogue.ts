/**
 * Curated catalogue of health podcast and video episodes.
 *
 * Every entry points at a video published by a named health authority on its own
 * channel. The video identifiers, titles, channel names, publication dates and
 * durations below were read from each video's own watch page and oEmbed record on
 * the date recorded in `CATALOGUE_VERIFICATION`; they were not written from
 * memory or inferred. `pnpm check:podcasts --live` re-reads them from YouTube and
 * fails if any of them has drifted, so a removed or renamed video is a test
 * failure rather than a broken card.
 *
 * Two rules this file follows deliberately:
 *
 *  1. Nothing is invented. There are no view counts, no ratings, no "most
 *     popular" ordering and no implied clinical endorsement. `summary` is written
 *     by this project from the published title and publisher, and the entry it
 *     describes is the authoritative content.
 *  2. Membership is a decision, not a scrape. Only accounts belonging to a
 *     recognised public-health authority, health service, or professional
 *     medical society are included, and each entry records which kind of body
 *     published it so the distinction is visible in the interface.
 *
 * An episode being listed here means it was published by a named authority. It
 * does not mean this project has clinically reviewed it, and the interface says
 * so. See `docs/podcasts.md`.
 */
import {
  PODCAST_TOPIC_IDS,
  PODCAST_TOPIC_LABELS,
  type PodcastTopicId,
} from "@/lib/profile/options";

export type PublisherKind =
  | "international-health-agency"
  | "national-public-health-agency"
  | "national-health-service"
  | "professional-medical-society";

export const PUBLISHER_KIND_LABELS: Record<PublisherKind, string> = {
  "international-health-agency": "International health agency",
  "national-public-health-agency": "National public health agency",
  "national-health-service": "National health service",
  "professional-medical-society": "Professional medical society",
};

export type EpisodeLanguage = "en" | "hi";

export type PodcastEntry = {
  /** Stable slug, used in the URL of the detail page. */
  id: string;
  /** The YouTube video identifier, as published. */
  videoId: string;
  title: string;
  publisher: string;
  publisherKind: PublisherKind;
  /**
   * A short summary written by this project. It restates what the published title
   * and publisher establish, and claims nothing about the video's contents beyond
   * that. The video is the authoritative source.
   */
  summary: string;
  topics: PodcastTopicId[];
  tags: string[];
  language: EpisodeLanguage;
  /** Publication date as reported by the video page, `YYYY-MM-DD`. */
  publishedOn: string;
  /** Exact duration in seconds, as reported by the video page. */
  durationSeconds: number;
  videoUrl: string;
  thumbnailUrl: string;
  /**
   * Set when an episode is tied to a campaign or an outbreak that has passed. A
   * reader is told so rather than being left to treat dated guidance as current.
   */
  datedNote: string | null;
};

/** How and when the metadata above was verified. Shown in the interface. */
export const CATALOGUE_VERIFICATION = {
  verifiedOn: "2026-10-14",
  method:
    "Each video's YouTube watch page and oEmbed record, read directly: video id, title, channel name, upload date and duration.",
  script: "pnpm check:podcasts --live",
  scopeNote:
    "Publication by a named authority is not a clinical review. This project has not reviewed the medical content of any episode, and listing one is not an endorsement.",
} as const;

export const PODCAST_ENTRIES: readonly PodcastEntry[] = [
  {
    id: "cdc-blood-pressure-control",
    videoId: "XOxQyO-Sw-g",
    title: "CDC Vital Signs: Getting Blood Pressure Under Control",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    publisherKind: "national-public-health-agency",
    summary:
      "A CDC Vital Signs instalment on bringing raised blood pressure under control. Published in 2012, so the framing reflects that campaign.",
    topics: ["heart-and-blood-pressure"],
    tags: ["blood pressure", "hypertension", "prevention"],
    language: "en",
    publishedOn: "2012-09-05",
    durationSeconds: 117,
    videoUrl: "https://www.youtube.com/watch?v=XOxQyO-Sw-g",
    thumbnailUrl: "https://i.ytimg.com/vi/XOxQyO-Sw-g/hqdefault.jpg",
    datedNote: "Published in 2012 as part of that year's CDC Vital Signs release.",
  },
  {
    id: "cdc-high-blood-pressure",
    videoId: "FdF9Xzr2sPg",
    title: "What You Need to Know About High Blood Pressure",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    publisherKind: "national-public-health-agency",
    summary:
      "A short CDC explainer on high blood pressure, from the agency's public education series.",
    topics: ["heart-and-blood-pressure"],
    tags: ["blood pressure", "hypertension", "measurement"],
    language: "en",
    publishedOn: "2019-07-23",
    durationSeconds: 45,
    videoUrl: "https://www.youtube.com/watch?v=FdF9Xzr2sPg",
    thumbnailUrl: "https://i.ytimg.com/vi/FdF9Xzr2sPg/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "aha-track-blood-pressure-at-home",
    videoId: "-jf2qoNRLTI",
    title: "How to track your blood pressure at home",
    publisher: "American Heart Association",
    publisherKind: "professional-medical-society",
    summary:
      "An American Heart Association video on tracking blood pressure at home, which is the measurement the records page of this platform is for.",
    topics: ["tests-and-seeking-care", "heart-and-blood-pressure"],
    tags: ["blood pressure", "home measurement", "monitoring"],
    language: "en",
    publishedOn: "2022-04-13",
    durationSeconds: 30,
    videoUrl: "https://www.youtube.com/watch?v=-jf2qoNRLTI",
    thumbnailUrl: "https://i.ytimg.com/vi/-jf2qoNRLTI/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "aha-lifes-essential-8",
    videoId: "4Dpl4MS1EKw",
    title: "Introducing: Life's Essential 8",
    publisher: "American Heart Association",
    publisherKind: "professional-medical-society",
    summary:
      "A short introduction to Life's Essential 8, the American Heart Association's list of the factors it associates with cardiovascular health.",
    topics: ["heart-and-blood-pressure", "general-health"],
    tags: ["cardiovascular health", "risk factors", "prevention"],
    language: "en",
    publishedOn: "2022-06-29",
    durationSeconds: 60,
    videoUrl: "https://www.youtube.com/watch?v=4Dpl4MS1EKw",
    thumbnailUrl: "https://i.ytimg.com/vi/4Dpl4MS1EKw/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "cdc-million-hearts",
    videoId: "poc1eTuJJfc",
    title: "Million Hearts: Preventing Heart Attacks and Strokes",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    publisherKind: "national-public-health-agency",
    summary:
      "A CDC video describing the Million Hearts initiative on preventing heart attacks and strokes. Published in 2011.",
    topics: ["heart-and-blood-pressure"],
    tags: ["heart attack", "stroke", "prevention"],
    language: "en",
    publishedOn: "2011-09-08",
    durationSeconds: 95,
    videoUrl: "https://www.youtube.com/watch?v=poc1eTuJJfc",
    thumbnailUrl: "https://i.ytimg.com/vi/poc1eTuJJfc/hqdefault.jpg",
    datedNote: "Published in 2011, when the Million Hearts initiative was launched.",
  },
  {
    id: "bhf-heart-attack-risk",
    videoId: "57SDJlhNQbY",
    title: "BHF Heart Matters Live: How can I reduce my risk of having a heart attack?",
    publisher: "British Heart Foundation",
    publisherKind: "professional-medical-society",
    summary:
      "A recorded British Heart Foundation question-and-answer session with a clinician on reducing heart attack risk. Just over an hour long.",
    topics: ["heart-and-blood-pressure", "general-health"],
    tags: ["heart attack", "risk factors", "questions and answers"],
    language: "en",
    publishedOn: "2025-08-11",
    durationSeconds: 3670,
    videoUrl: "https://www.youtube.com/watch?v=57SDJlhNQbY",
    thumbnailUrl: "https://i.ytimg.com/vi/57SDJlhNQbY/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "cdc-national-diabetes-prevention",
    videoId: "K4SOS9okas4",
    title: "Get to Know CDC’s National Diabetes Prevention Program",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    publisherKind: "national-public-health-agency",
    summary:
      "A CDC overview of its National Diabetes Prevention Program, a structured lifestyle programme rather than clinical treatment.",
    topics: ["diabetes", "general-health"],
    tags: ["diabetes", "prevention", "lifestyle"],
    language: "en",
    publishedOn: "2017-10-16",
    durationSeconds: 150,
    videoUrl: "https://www.youtube.com/watch?v=K4SOS9okas4",
    thumbnailUrl: "https://i.ytimg.com/vi/K4SOS9okas4/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "nhs-diabetes-prevention-programme",
    videoId: "7S21NH_sDQI",
    title: "The NHS Diabetes Prevention Programme story",
    publisher: "NHS England",
    publisherKind: "national-health-service",
    summary:
      "NHS England's account of its Diabetes Prevention Programme, which is specific to England and to that service.",
    topics: ["diabetes", "general-health"],
    tags: ["diabetes", "prevention", "lifestyle"],
    language: "en",
    publishedOn: "2018-04-06",
    durationSeconds: 105,
    videoUrl: "https://www.youtube.com/watch?v=7S21NH_sDQI",
    thumbnailUrl: "https://i.ytimg.com/vi/7S21NH_sDQI/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "cdc-diabetes-basics",
    videoId: "AflsVX5XO5M",
    title: "What You Need to Know About Diabetes",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    publisherKind: "national-public-health-agency",
    summary:
      "A short CDC explainer on diabetes, from the agency's public education series.",
    topics: ["diabetes"],
    tags: ["diabetes", "blood glucose"],
    language: "en",
    publishedOn: "2019-12-09",
    durationSeconds: 80,
    videoUrl: "https://www.youtube.com/watch?v=AflsVX5XO5M",
    thumbnailUrl: "https://i.ytimg.com/vi/AflsVX5XO5M/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "nhs-sleep-problems",
    videoId: "TaLFBTvB1iQ",
    title: "Sleep problems | NHS",
    publisher: "NHS",
    publisherKind: "national-health-service",
    summary:
      "NHS guidance on sleep problems, including a description of what insomnia is and what can be done about it.",
    topics: ["sleep", "general-health"],
    tags: ["sleep", "insomnia", "habits"],
    language: "en",
    publishedOn: "2024-10-07",
    durationSeconds: 380,
    videoUrl: "https://www.youtube.com/watch?v=TaLFBTvB1iQ",
    thumbnailUrl: "https://i.ytimg.com/vi/TaLFBTvB1iQ/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "nhs-stress",
    videoId: "jXT0YtAl4YM",
    title: "Stress | NHS",
    publisher: "NHS",
    publisherKind: "national-health-service",
    summary:
      "An NHS video on stress and how it can affect everyday life. The upload dates from 2009, so treat it as general background.",
    topics: ["mental-health", "general-health"],
    tags: ["stress", "mental health", "well-being"],
    language: "en",
    publishedOn: "2009-04-07",
    durationSeconds: 194,
    videoUrl: "https://www.youtube.com/watch?v=jXT0YtAl4YM",
    thumbnailUrl: "https://i.ytimg.com/vi/jXT0YtAl4YM/hqdefault.jpg",
    datedNote: "Published in 2009.",
  },
  {
    id: "nhs-low-mood-self-help",
    videoId: "qKcRUOWYQ9w",
    title: "Self-help for low mood and depression | NHS",
    publisher: "NHS",
    publisherKind: "national-health-service",
    summary:
      "An NHS video on self-help approaches for low mood and depression, and on when to seek further help.",
    topics: ["mental-health"],
    tags: ["low mood", "depression", "self-help"],
    language: "en",
    publishedOn: "2022-10-06",
    durationSeconds: 630,
    videoUrl: "https://www.youtube.com/watch?v=qKcRUOWYQ9w",
    thumbnailUrl: "https://i.ytimg.com/vi/qKcRUOWYQ9w/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "who-healthy-diet",
    videoId: "XMcab1MFaLc",
    title: "A healthy diet, a healthier world",
    publisher: "World Health Organization (WHO)",
    publisherKind: "international-health-agency",
    summary:
      "A World Health Organization video on healthy eating and its relation to health at population level.",
    topics: ["nutrition-and-activity", "general-health"],
    tags: ["nutrition", "diet", "prevention"],
    language: "en",
    publishedOn: "2020-06-21",
    durationSeconds: 99,
    videoUrl: "https://www.youtube.com/watch?v=XMcab1MFaLc",
    thumbnailUrl: "https://i.ytimg.com/vi/XMcab1MFaLc/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "who-be-active",
    videoId: "uZX14W4rVCU",
    title: "Let’s be active for health for all",
    publisher: "World Health Organization (WHO)",
    publisherKind: "international-health-agency",
    summary:
      "A World Health Organization video on physical activity, tied to its active-living campaign.",
    topics: ["nutrition-and-activity", "general-health"],
    tags: ["physical activity", "exercise", "prevention"],
    language: "en",
    publishedOn: "2018-06-03",
    durationSeconds: 94,
    videoUrl: "https://www.youtube.com/watch?v=uZX14W4rVCU",
    thumbnailUrl: "https://i.ytimg.com/vi/uZX14W4rVCU/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "cdc-fight-germs-wash-hands",
    videoId: "eZw4Ga3jg3E",
    title: "Fight Germs. Wash Your Hands!",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    publisherKind: "national-public-health-agency",
    summary:
      "A CDC hand hygiene video produced with the US Department of Agriculture's food safety campaign. The content is general and not specific to one country's guidance.",
    topics: ["infection-and-vaccination"],
    tags: ["hand hygiene", "infection prevention"],
    language: "en",
    publishedOn: "2021-07-19",
    durationSeconds: 180,
    videoUrl: "https://www.youtube.com/watch?v=eZw4Ga3jg3E",
    thumbnailUrl: "https://i.ytimg.com/vi/eZw4Ga3jg3E/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "cdc-handwashing",
    videoId: "fpXh2XHwMmE",
    title: "What you need to know about handwashing",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    publisherKind: "national-public-health-agency",
    summary:
      "A CDC explainer on handwashing, covering how and when to wash hands.",
    topics: ["infection-and-vaccination"],
    tags: ["hand hygiene", "infection prevention"],
    language: "en",
    publishedOn: "2022-09-30",
    durationSeconds: 127,
    videoUrl: "https://www.youtube.com/watch?v=fpXh2XHwMmE",
    thumbnailUrl: "https://i.ytimg.com/vi/fpXh2XHwMmE/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "who-vaccines-and-children-2021",
    videoId: "FSdUsOQgIn0",
    title: "WHO’s Science in 5 on COVID-19: vaccines and children - 11 June 2021",
    publisher: "World Health Organization (WHO)",
    publisherKind: "international-health-agency",
    summary:
      "An episode of the WHO's Science in 5 series recorded in June 2021 about COVID-19 vaccination and children. It is a dated episode and is not current vaccination-schedule guidance.",
    topics: ["infection-and-vaccination"],
    tags: ["vaccination", "COVID-19", "children"],
    language: "en",
    publishedOn: "2021-06-11",
    durationSeconds: 308,
    videoUrl: "https://www.youtube.com/watch?v=FSdUsOQgIn0",
    thumbnailUrl: "https://i.ytimg.com/vi/FSdUsOQgIn0/hqdefault.jpg",
    datedNote:
      "Recorded in June 2021 during the COVID-19 vaccination rollout. It is not current vaccination guidance for any country.",
  },
  {
    id: "cdc-vaccines-for-children-30-years",
    videoId: "1yf7uEnEU6o",
    title: "CDC Vital Signs: Vaccines for Children Program: 30 Years of Protecting Children",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    publisherKind: "national-public-health-agency",
    summary:
      "A CDC Vital Signs video marking thirty years of its Vaccines for Children programme. It describes one country's programme.",
    topics: ["infection-and-vaccination"],
    tags: ["vaccination", "children", "immunisation"],
    language: "en",
    publishedOn: "2024-08-29",
    durationSeconds: 171,
    videoUrl: "https://www.youtube.com/watch?v=1yf7uEnEU6o",
    thumbnailUrl: "https://i.ytimg.com/vi/1yf7uEnEU6o/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "cdc-tuberculosis-transmission",
    videoId: "UKV8Zn7x0wM",
    title: "CDC Tuberculosis (TB) Transmission and Pathogenesis Video",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    publisherKind: "national-public-health-agency",
    summary:
      "A CDC Division of Tuberculosis Elimination video on how tuberculosis is transmitted and how the infection develops.",
    topics: ["respiratory-and-tb"],
    tags: ["tuberculosis", "transmission", "infection"],
    language: "en",
    publishedOn: "2020-05-26",
    durationSeconds: 102,
    videoUrl: "https://www.youtube.com/watch?v=UKV8Zn7x0wM",
    thumbnailUrl: "https://i.ytimg.com/vi/UKV8Zn7x0wM/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "ukhsa-what-is-tb",
    videoId: "2tz7UZTgzIs",
    title: "What is tuberculosis (TB)?",
    publisher: "UK Health Security Agency",
    publisherKind: "national-public-health-agency",
    summary:
      "A UK Health Security Agency explainer on what tuberculosis is, from the agency's public information series.",
    topics: ["respiratory-and-tb"],
    tags: ["tuberculosis", "diagnosis"],
    language: "en",
    publishedOn: "2023-03-15",
    durationSeconds: 86,
    videoUrl: "https://www.youtube.com/watch?v=2tz7UZTgzIs",
    thumbnailUrl: "https://i.ytimg.com/vi/2tz7UZTgzIs/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "mohfw-national-tb-elimination-programme",
    videoId: "1dRA_ORU-cY",
    title: "National Tuberculosis Elimination Programme",
    publisher: "Ministry of Health & Family Welfare",
    publisherKind: "national-public-health-agency",
    summary:
      "An Indian Ministry of Health and Family Welfare video on the National Tuberculosis Elimination Programme, the country's TB programme. The channel name is shown exactly as the publisher lists it.",
    topics: ["respiratory-and-tb", "general-health"],
    tags: ["tuberculosis", "India", "public health programme"],
    language: "en",
    publishedOn: "2025-01-28",
    durationSeconds: 231,
    videoUrl: "https://www.youtube.com/watch?v=1dRA_ORU-cY",
    thumbnailUrl: "https://i.ytimg.com/vi/1dRA_ORU-cY/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "mohfw-end-tb-2025",
    videoId: "sen_wh9x540",
    title: "An efforts of National TB Elimination Programme towards End TB by 2025",
    publisher: "Ministry of Health & Family Welfare",
    publisherKind: "national-public-health-agency",
    summary:
      "An Indian Ministry of Health and Family Welfare video on the National TB Elimination Programme and its stated 2025 goal. That target year has passed, so the video is dated.",
    topics: ["respiratory-and-tb"],
    tags: ["tuberculosis", "India", "public health programme"],
    language: "en",
    publishedOn: "2022-03-23",
    durationSeconds: 211,
    videoUrl: "https://www.youtube.com/watch?v=sen_wh9x540",
    thumbnailUrl: "https://i.ytimg.com/vi/sen_wh9x540/hqdefault.jpg",
    datedNote:
      "Published in 2022 and framed around a 2025 target, which has now passed.",
  },
  {
    id: "mohfw-tb-mukt-bharat-nikshay-mitra",
    videoId: "UWzYWG-kQ1g",
    title: "Pradhan Mantri TB Mukt Bharat Abhiyaan | Help India Become TB-free with Ni-kshay Mitra",
    publisher: "Ministry of Health & Family Welfare",
    publisherKind: "national-public-health-agency",
    summary:
      "A short Indian Ministry of Health and Family Welfare clip on the Ni-kshay Mitra component of the national TB campaign, which invites community support for people in TB treatment.",
    topics: ["respiratory-and-tb"],
    tags: ["tuberculosis", "India", "community support"],
    language: "en",
    publishedOn: "2022-10-20",
    durationSeconds: 20,
    videoUrl: "https://www.youtube.com/watch?v=UWzYWG-kQ1g",
    thumbnailUrl: "https://i.ytimg.com/vi/UWzYWG-kQ1g/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "tb-mukt-bharat-goal",
    videoId: "p_2-_Wc9FpQ",
    title: "TB Mukt Bharat goal is achievable.",
    publisher: "TB Mukt Bharat (Central TB Division)",
    publisherKind: "national-public-health-agency",
    summary:
      "A video from the Central TB Division's TB Mukt Bharat channel about the national TB elimination goal and local progress reporting.",
    topics: ["respiratory-and-tb"],
    tags: ["tuberculosis", "India", "public health programme"],
    language: "en",
    publishedOn: "2022-01-25",
    durationSeconds: 264,
    videoUrl: "https://www.youtube.com/watch?v=p_2-_Wc9FpQ",
    thumbnailUrl: "https://i.ytimg.com/vi/p_2-_Wc9FpQ/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "ukhsa-heart-attack-symptoms-bsl",
    videoId: "3-h3wUkxXME",
    title: "Heart Attack Symptoms - Help Us Help You | NHS | BSL version",
    publisher: "UK Health Security Agency",
    publisherKind: "national-public-health-agency",
    summary:
      "A British Sign Language version of the NHS heart attack symptoms campaign film, which is why the original is listed alongside it.",
    topics: ["heart-and-blood-pressure", "tests-and-seeking-care"],
    tags: ["heart attack", "warning signs", "accessible"],
    language: "en",
    publishedOn: "2022-03-23",
    durationSeconds: 35,
    videoUrl: "https://www.youtube.com/watch?v=3-h3wUkxXME",
    thumbnailUrl: "https://i.ytimg.com/vi/3-h3wUkxXME/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "aha-stroke-warning-signs",
    videoId: "ya1JIuei74c",
    title: "Is this a stroke? Here's how to know.",
    publisher: "American Heart Association",
    publisherKind: "professional-medical-society",
    summary:
      "An American Heart Association video on recognising stroke warning signs and acting on them.",
    topics: ["heart-and-blood-pressure", "tests-and-seeking-care"],
    tags: ["stroke", "warning signs", "urgent care"],
    language: "en",
    publishedOn: "2025-05-08",
    durationSeconds: 61,
    videoUrl: "https://www.youtube.com/watch?v=ya1JIuei74c",
    thumbnailUrl: "https://i.ytimg.com/vi/ya1JIuei74c/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "cdc-dengue-chikungunya-prevention",
    videoId: "v0KaDZ6Zmuo",
    title: "Dengue and Chikungunya in Our Backyard: Preventing Aedes Mosquito-Borne Diseases",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    publisherKind: "national-public-health-agency",
    summary:
      "A recorded CDC session on preventing dengue and chikungunya by controlling Aedes mosquitoes. It runs for about an hour.",
    topics: ["mosquito-borne-disease"],
    tags: ["dengue", "chikungunya", "mosquito control"],
    language: "en",
    publishedOn: "2015-05-22",
    durationSeconds: 3621,
    videoUrl: "https://www.youtube.com/watch?v=v0KaDZ6Zmuo",
    thumbnailUrl: "https://i.ytimg.com/vi/v0KaDZ6Zmuo/hqdefault.jpg",
    datedNote: "Recorded in 2015.",
  },
  {
    id: "cdc-aedes-prevention",
    videoId: "ejoCdPGh6rs",
    title: "Preventing Aedes Mosquito-Borne Diseases with Dr. Ronald Rosenberg",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    publisherKind: "national-public-health-agency",
    summary:
      "A CDC interview-format video on preventing diseases carried by Aedes mosquitoes, which include dengue and chikungunya.",
    topics: ["mosquito-borne-disease"],
    tags: ["dengue", "chikungunya", "mosquito control"],
    language: "en",
    publishedOn: "2016-07-06",
    durationSeconds: 574,
    videoUrl: "https://www.youtube.com/watch?v=ejoCdPGh6rs",
    thumbnailUrl: "https://i.ytimg.com/vi/ejoCdPGh6rs/hqdefault.jpg",
    datedNote: "Published in 2016.",
  },
  {
    id: "mohfw-dengue-prevention",
    videoId: "1ej4LaD5xWg",
    title: "A short video on prevention and control of dengue",
    publisher: "Ministry of Health & Family Welfare",
    publisherKind: "national-public-health-agency",
    summary:
      "An Indian Ministry of Health and Family Welfare public information clip on dengue prevention and control.",
    topics: ["mosquito-borne-disease"],
    tags: ["dengue", "India", "mosquito control"],
    language: "en",
    publishedOn: "2017-07-24",
    durationSeconds: 34,
    videoUrl: "https://www.youtube.com/watch?v=1ej4LaD5xWg",
    thumbnailUrl: "https://i.ytimg.com/vi/1ej4LaD5xWg/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "mohfw-dengue-chikungunya",
    videoId: "CpYA1qfDAtE",
    title: "Protect yourself from Dengue and Chikungunya",
    publisher: "Ministry of Health & Family Welfare",
    publisherKind: "national-public-health-agency",
    summary:
      "An Indian Ministry of Health and Family Welfare clip on protecting against both dengue and chikungunya.",
    topics: ["mosquito-borne-disease"],
    tags: ["dengue", "chikungunya", "India"],
    language: "en",
    publishedOn: "2016-07-25",
    durationSeconds: 40,
    videoUrl: "https://www.youtube.com/watch?v=CpYA1qfDAtE",
    thumbnailUrl: "https://i.ytimg.com/vi/CpYA1qfDAtE/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "nvbdcp-dengue-35-seconds",
    videoId: "dmA8QPGuVtc",
    title: "Dengue Prevention and Cure - Video Clip 35 sec.",
    publisher: "NVBDCP MoH&FW",
    publisherKind: "national-public-health-agency",
    summary:
      "A thirty-five second dengue public information spot from India's National Centre for Vector Borne Diseases Control, whose channel carries the abbreviated name shown here. It is listed under the title it was published with.",
    topics: ["mosquito-borne-disease"],
    tags: ["dengue", "India", "mosquito control"],
    language: "en",
    publishedOn: "2023-09-11",
    durationSeconds: 34,
    videoUrl: "https://www.youtube.com/watch?v=dmA8QPGuVtc",
    thumbnailUrl: "https://i.ytimg.com/vi/dmA8QPGuVtc/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "nhsggc-blood-glucose-monitoring",
    videoId: "HchMQ45Uvas",
    title: "NHSGGC - Diabetes Education: Blood glucose monitoring - Gluco Rx Nexus",
    publisher: "NHS Greater Glasgow and Clyde",
    publisherKind: "national-health-service",
    summary:
      "An NHS Greater Glasgow and Clyde diabetes education video on using one specific blood glucose meter. The technique is general; the meter model is not.",
    topics: ["tests-and-seeking-care", "diabetes"],
    tags: ["blood glucose", "monitoring", "meter"],
    language: "en",
    publishedOn: "2021-05-14",
    durationSeconds: 365,
    videoUrl: "https://www.youtube.com/watch?v=HchMQ45Uvas",
    thumbnailUrl: "https://i.ytimg.com/vi/HchMQ45Uvas/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "mohfw-uwin-immunisation-hindi",
    videoId: "Vao8IJcyhYo",
    title: "यू-विन: आपके बच्चे के टीकाकरण की डिजिटल गाइड!",
    publisher: "Ministry of Health & Family Welfare",
    publisherKind: "national-public-health-agency",
    summary:
      "A Hindi-language Indian Ministry of Health and Family Welfare video introducing U-WIN, the country's digital immunisation record for children. The title says: U-WIN, a digital guide to your child's vaccination.",
    topics: ["infection-and-vaccination"],
    tags: ["vaccination", "children", "India", "Hindi"],
    language: "hi",
    publishedOn: "2025-04-23",
    durationSeconds: 170,
    videoUrl: "https://www.youtube.com/watch?v=Vao8IJcyhYo",
    thumbnailUrl: "https://i.ytimg.com/vi/Vao8IJcyhYo/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "mohfw-get-your-child-immunised",
    videoId: "hQ99jv7oob0",
    title: "Get your child fully immunised",
    publisher: "Ministry of Health & Family Welfare",
    publisherKind: "national-public-health-agency",
    summary:
      "An Indian Ministry of Health and Family Welfare public information clip on completing a child's immunisation schedule.",
    topics: ["infection-and-vaccination"],
    tags: ["vaccination", "children", "India"],
    language: "en",
    publishedOn: "2016-05-16",
    durationSeconds: 30,
    videoUrl: "https://www.youtube.com/watch?v=hQ99jv7oob0",
    thumbnailUrl: "https://i.ytimg.com/vi/hQ99jv7oob0/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "mygov-mental-health-is-health",
    videoId: "nt2fqOPprfU",
    title: "Mental health is an integral part of health #MentalHealthMatters",
    publisher: "MyGov India",
    publisherKind: "national-public-health-agency",
    summary:
      "A short Government of India public information clip stating that mental health is part of health.",
    topics: ["mental-health", "general-health"],
    tags: ["mental health", "India", "public awareness"],
    language: "en",
    publishedOn: "2020-10-15",
    durationSeconds: 68,
    videoUrl: "https://www.youtube.com/watch?v=nt2fqOPprfU",
    thumbnailUrl: "https://i.ytimg.com/vi/nt2fqOPprfU/hqdefault.jpg",
    datedNote: null,
  },
  {
    id: "mygov-tele-manas",
    videoId: "dsxx8yvK25A",
    title: "National Tele Mental Health Program Will Be Launched",
    publisher: "MyGov India",
    publisherKind: "national-public-health-agency",
    summary:
      "A Government of India announcement video about the launch of the National Tele Mental Health Programme (Tele-MANAS) and its telephone helpline.",
    topics: ["mental-health", "tests-and-seeking-care"],
    tags: ["mental health", "helpline", "India"],
    language: "en",
    publishedOn: "2022-02-01",
    durationSeconds: 114,
    videoUrl: "https://www.youtube.com/watch?v=dsxx8yvK25A",
    thumbnailUrl: "https://i.ytimg.com/vi/dsxx8yvK25A/hqdefault.jpg",
    datedNote: "Announcement from February 2022.",
  },
];

const BY_ID = new Map(PODCAST_ENTRIES.map((entry) => [entry.id, entry]));
const BY_VIDEO_ID = new Map(PODCAST_ENTRIES.map((entry) => [entry.videoId, entry]));

export function getPodcastEntry(id: string): PodcastEntry | null {
  return BY_ID.get(id) ?? null;
}

export function getPodcastEntryByVideoId(videoId: string): PodcastEntry | null {
  return BY_VIDEO_ID.get(videoId) ?? null;
}

/** `2 min 45 sec`, `35 sec`, `1 hr 1 min`. Used for display only. */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const spare = minutes % 60;
    return spare > 0 ? `${hours} hr ${spare} min` : `${hours} hr`;
  }
  if (minutes === 0) return `${rest} sec`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} sec`;
}

export function formatPublishedOn(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Topic labels present in the catalogue, for building a filter that has content. */
export function catalogueTopics(): { id: PodcastTopicId; label: string; count: number }[] {
  return PODCAST_TOPIC_IDS.map((id) => ({
    id,
    label: PODCAST_TOPIC_LABELS[id],
    count: PODCAST_ENTRIES.filter((entry) => entry.topics.includes(id)).length,
  })).filter((topic) => topic.count > 0);
}

/**
 * Text search over the fields a reader would reasonably search by: title,
 * publisher, summary, tags and topic labels. Deliberately a plain substring match
 * rather than a fuzzy score, so a result can be explained and an empty result is
 * obviously empty rather than a ranking artefact.
 */
export function matchesQuery(entry: PodcastEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  const haystack = [
    entry.title,
    entry.publisher,
    entry.summary,
    ...entry.tags,
    ...entry.topics.map((topic) => PODCAST_TOPIC_LABELS[topic]),
  ]
    .join(" ")
    .toLowerCase();
  return needle
    .split(/\s+/)
    .every((token) => haystack.includes(token));
}

export type CatalogueFilter = {
  query?: string;
  topics?: PodcastTopicId[];
  language?: EpisodeLanguage | null;
};

export function filterCatalogue(filter: CatalogueFilter = {}): PodcastEntry[] {
  const topics = filter.topics ?? [];
  return PODCAST_ENTRIES.filter((entry) => {
    if (topics.length > 0 && !entry.topics.some((topic) => topics.includes(topic))) {
      return false;
    }
    if (filter.language && entry.language !== filter.language) return false;
    return matchesQuery(entry, filter.query ?? "");
  });
}

/**
 * Episodes sharing at least one topic with the given one, most shared topics
 * first and then the shortest first, because a short episode is the easier of two
 * equally relevant items to start with. Returns the topic ids it matched on so the
 * reason a suggestion appears can be shown rather than asserted.
 */
export function relatedEpisodes(
  id: string,
  limit = 3,
): { entry: PodcastEntry; sharedTopics: PodcastTopicId[] }[] {
  const source = getPodcastEntry(id);
  if (!source) return [];
  return PODCAST_ENTRIES.filter((entry) => entry.id !== source.id)
    .map((entry) => ({
      entry,
      sharedTopics: entry.topics.filter((topic) => source.topics.includes(topic)),
    }))
    .filter((candidate) => candidate.sharedTopics.length > 0)
    .sort((a, b) => {
      if (b.sharedTopics.length !== a.sharedTopics.length) {
        return b.sharedTopics.length - a.sharedTopics.length;
      }
      return a.entry.durationSeconds - b.entry.durationSeconds;
    })
    .slice(0, limit);
}

/**
 * Episodes matching a set of podcast topics, used for the profile-driven
 * recommendations. The publisher is part of the reason shown to the reader, so the
 * selection prefers an international agency or national public-health agency over a
 * professional society when both match.
 */
export function episodesForTopics(
  topics: PodcastTopicId[],
  limit = 3,
  exclude: string[] = [],
): { entry: PodcastEntry; matchedTopics: PodcastTopicId[] }[] {
  if (topics.length === 0) return [];
  const kindRank: Record<PublisherKind, number> = {
    "international-health-agency": 0,
    "national-public-health-agency": 1,
    "national-health-service": 2,
    "professional-medical-society": 3,
  };
  return PODCAST_ENTRIES.filter((entry) => !exclude.includes(entry.id))
    .map((entry) => ({
      entry,
      matchedTopics: entry.topics.filter((topic) => topics.includes(topic)),
    }))
    .filter((candidate) => candidate.matchedTopics.length > 0)
    .sort((a, b) => {
      if (b.matchedTopics.length !== a.matchedTopics.length) {
        return b.matchedTopics.length - a.matchedTopics.length;
      }
      const rank = kindRank[a.entry.publisherKind] - kindRank[b.entry.publisherKind];
      if (rank !== 0) return rank;
      return a.entry.durationSeconds - b.entry.durationSeconds;
    })
    .slice(0, limit);
}

export function countPodcastTopics(): number {
  return catalogueTopics().length;
}
