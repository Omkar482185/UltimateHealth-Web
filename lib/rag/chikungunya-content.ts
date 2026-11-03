/**
 * Chikungunya topic content.
 *
 * Every statement here was written by reading the corpus documents named in
 * `sourceIds`, and each one carries those ids so the page can render the
 * supporting publications next to it. Nothing on this page is generated and
 * nothing is asserted that the corpus does not contain.
 *
 * Deliberate omissions, so that the limits are explicit rather than accidental:
 *
 *  - No doses, no named brand medicines, no advice to start, stop or change a
 *    prescribed medicine.
 *  - No probability of any condition, and no statement that a reader does or
 *    does not have chikungunya or dengue.
 *  - No claim that a vaccine is available where the reader lives. The WHO
 *    fact sheet says two vaccines have regulatory approvals and are recommended
 *    in some populations, but that they are not yet widely available or in
 *    widespread use, and eligibility differs between countries, so the page
 *    points to the source and to a clinician rather than asserting availability.
 *
 * This module imports nothing server-side so it can be shared by the page and,
 * if needed, the client without pulling retrieval code into a bundle.
 */

export type SourcedStatement = {
  text: string;
  sourceIds: string[];
};

export type TopicSection = {
  id: string;
  heading: string;
  intro: string | null;
  statements: SourcedStatement[];
  /** Rendered as a two-column comparison table rather than a list. */
  comparison?: { label: string; chikungunya: string; dengue: string; sourceIds: string[] }[];
};

export const CHIKUNGUNYA_TOPIC_ID = "mosquito-borne-disease";

/**
 * The warning signs, kept separate from the sections and rendered first.
 *
 * These are the severe-dengue warning signs from the WHO dengue fact sheet,
 * which the page shows because the two illnesses are transmitted by the same
 * mosquitoes, overlap in their early symptoms, and cannot be told apart by a
 * reader from a symptom list. The WHO chikungunya fact sheet adds that severe
 * symptoms and deaths from chikungunya are rare and usually occur in young
 * babies or older people with other health problems, which is why the same
 * "seek care now" list applies to both.
 */
export const URGENT_SIGNS: SourcedStatement[] = [
  {
    text: "Severe abdominal pain.",
    sourceIds: ["who-dengue"],
  },
  {
    text: "Persistent vomiting.",
    sourceIds: ["who-dengue"],
  },
  {
    text: "Rapid breathing.",
    sourceIds: ["who-dengue"],
  },
  {
    text: "Bleeding gums or nose.",
    sourceIds: ["who-dengue"],
  },
  {
    text: "Blood in vomit or stool.",
    sourceIds: ["who-dengue"],
  },
  {
    text: "Fatigue and restlessness.",
    sourceIds: ["who-dengue"],
  },
  {
    text: "Being very thirsty, pale and cold skin, or feeling weak.",
    sourceIds: ["who-dengue"],
  },
  {
    text: "Severe disease in a newborn baby, or in an older person with other health problems.",
    sourceIds: ["who-chikungunya"],
  },
];

export const URGENT_SIGNS_NOTE =
  "The WHO dengue fact sheet notes that these signs often appear after the fever has settled, so feeling better is not by itself a reason to wait. Severe dengue and severe chikungunya both need care in hospital.";

export const CHIKUNGUNYA_SECTIONS: TopicSection[] = [
  {
    id: "overview",
    heading: "What chikungunya is",
    intro: null,
    statements: [
      {
        text: "Chikungunya is a viral illness caused by the chikungunya virus and transmitted to people by the bite of infected mosquitoes.",
        sourceIds: ["who-chikungunya", "ncvbdc-chikungunya", "mlp-chikungunya"],
      },
      {
        text: "The mosquitoes responsible are most commonly Aedes aegypti and Aedes albopictus, the same species that transmit dengue and Zika. They bite mainly during daylight hours.",
        sourceIds: ["who-chikungunya", "who-dengue"],
      },
      {
        text: "Outbreaks and sporadic cases are reported mostly in the Americas, Asia and Africa, with occasional smaller outbreaks in Europe.",
        sourceIds: ["who-chikungunya", "ukhsa-chikungunya"],
      },
      {
        text: "The name comes from a word in the Kimakonde language of southern Tanzania meaning \"that which bends up\", describing the posture of people with severe joint pain.",
        sourceIds: ["who-chikungunya"],
      },
      {
        text: "After recovery, the available evidence suggests a person is likely to be immune to future chikungunya infections.",
        sourceIds: ["who-chikungunya"],
      },
    ],
  },
  {
    id: "symptoms",
    heading: "Symptoms and how they progress",
    intro:
      "The WHO fact sheet describes chikungunya as easy to misdiagnose, because its symptoms overlap with dengue and Zika. The features below are the ones the sources single out.",
    statements: [
      {
        text: "In people who develop symptoms, onset is typically 4 to 8 days after the bite of an infected mosquito, with a range of 2 to 12 days.",
        sourceIds: ["who-chikungunya", "ncvbdc-chikungunya"],
      },
      {
        text: "It is characterised by an abrupt onset of fever, frequently with severe joint pain that is often debilitating.",
        sourceIds: ["who-chikungunya", "ncvbdc-chikungunya", "mlp-chikungunya"],
      },
      {
        text: "Joint pain usually lasts a few days, but may be prolonged, lasting weeks, months, or even years.",
        sourceIds: ["who-chikungunya", "mlp-chikungunya"],
      },
      {
        text: "Other common signs and symptoms include joint swelling, muscle pain, headache, nausea, fatigue and rash.",
        sourceIds: ["who-chikungunya", "ncvbdc-chikungunya"],
      },
      {
        text: "Most patients recover fully. Occasional eye, heart and neurological complications have been reported.",
        sourceIds: ["who-chikungunya"],
      },
      {
        text: "Without significant joint pain, symptoms are usually mild and the infection may go unrecognised.",
        sourceIds: ["who-chikungunya"],
      },
    ],
  },
  {
    id: "differentiation",
    heading: "How chikungunya differs from dengue",
    intro:
      "Both illnesses are spread by the same day-biting Aedes mosquitoes, both cause fever, and the WHO fact sheet says the symptom overlap is what makes chikungunya easy to misdiagnose. The differences below come from the two WHO fact sheets.",
    statements: [
      {
        text: "Severe, often persistent joint pain is the defining feature of chikungunya, to the point that the illness is named after the posture it produces.",
        sourceIds: ["who-chikungunya"],
      },
      {
        text: "Dengue is characterised by high fever with severe headache, pain behind the eyes, muscle and joint pains, nausea, vomiting, swollen glands and rash.",
        sourceIds: ["who-dengue"],
      },
      {
        text: "Warning signs of severe illness are well described for dengue and can appear after the fever has gone; severe chikungunya is rarer and clusters in newborns and older people with other health problems.",
        sourceIds: ["who-dengue", "who-chikungunya"],
      },
      {
        text: "A previous dengue infection increases the risk of severe dengue. For chikungunya, the evidence suggests recovery is followed by lasting immunity.",
        sourceIds: ["who-dengue", "who-chikungunya"],
      },
      {
        text: "Neither illness has a specific antiviral treatment, and in both the pain advice avoids non-steroidal anti-inflammatory medicines until dengue has been ruled out.",
        sourceIds: ["who-dengue", "who-chikungunya"],
      },
    ],
    comparison: [
      {
        label: "Main vector",
        chikungunya: "Aedes aegypti and Aedes albopictus, biting mainly in daylight",
        dengue: "Aedes aegypti, with other Aedes species a secondary role",
        sourceIds: ["who-chikungunya", "who-dengue"],
      },
      {
        label: "Typical onset",
        chikungunya: "Symptoms typically 2 to 12 days after the bite, most often 4 to 8 days",
        dengue: "Symptoms usually begin 4 to 10 days after infection and last 2 to 7 days",
        sourceIds: ["who-chikungunya", "who-dengue"],
      },
      {
        label: "Defining feature",
        chikungunya: "Severe joint pain that is often debilitating and may be prolonged",
        dengue: "High fever with headache, pain behind the eyes, and muscle and joint pains",
        sourceIds: ["who-chikungunya", "who-dengue"],
      },
      {
        label: "Who becomes severely ill",
        chikungunya: "Rare, and usually newborns or older people with other health problems",
        dengue: "A minority progress to severe dengue; a second infection raises the risk",
        sourceIds: ["who-chikungunya", "who-dengue"],
      },
      {
        label: "Pain relief while dengue is possible",
        chikungunya: "Paracetamol or acetaminophen is recommended until dengue is ruled out",
        dengue: "Paracetamol for pain, avoiding ibuprofen, aspirin and similar medicines",
        sourceIds: ["who-chikungunya", "who-dengue"],
      },
    ],
  },
  {
    id: "diagnosis",
    heading: "Diagnosis and what tests can and cannot show",
    intro: null,
    statements: [
      {
        text: "During the first week of illness the virus can be detected directly in blood samples, for example by reverse transcriptase polymerase chain reaction (RT-PCR).",
        sourceIds: ["who-chikungunya", "ncvbdc-chikungunya"],
      },
      {
        text: "Tests for antibodies to the virus are typically used after that first week. Antibody levels are usually detectable by the first week and can still be detected for about two months.",
        sourceIds: ["who-chikungunya"],
      },
      {
        text: "Because the early symptoms overlap with dengue and Zika, cases can be misdiagnosed, which the WHO fact sheet also gives as a reason national case counts are hard to establish.",
        sourceIds: ["who-chikungunya"],
      },
      {
        text: "Testing is the only way to tell these illnesses apart. A symptom list, including this page, cannot do it.",
        sourceIds: ["who-chikungunya", "who-dengue"],
      },
    ],
  },
  {
    id: "care",
    heading: "Care and recovery",
    intro: null,
    statements: [
      {
        text: "There is no specific antiviral treatment for chikungunya virus infection.",
        sourceIds: ["who-chikungunya", "ncvbdc-chikungunya", "ukhsa-chikungunya"],
      },
      {
        text: "Clinical management addresses fever and joint pain with antipyretics and suitable analgesics, drinking plenty of fluids, and general rest.",
        sourceIds: ["who-chikungunya"],
      },
      {
        text: "Most patients recover fully. Persistent joint pain is the reason follow-up matters, and it is a normal reason to ask a clinician for a review.",
        sourceIds: ["who-chikungunya", "mlp-chikungunya"],
      },
      {
        text: "People suspected of having chikungunya should avoid being bitten by mosquitoes during the first week of illness, because that is how the virus reaches other people through the mosquitoes around them.",
        sourceIds: ["who-chikungunya"],
      },
    ],
  },
  {
    id: "medication-safety",
    heading: "Medicine safety",
    intro:
      "The page states what the sources say about pain relief and nothing more. It gives no doses and does not recommend changing any prescribed medicine.",
    statements: [
      {
        text: "WHO recommends paracetamol or acetaminophen for pain and fever until dengue infection has been ruled out.",
        sourceIds: ["who-chikungunya", "who-dengue"],
      },
      {
        text: "Non-steroidal anti-inflammatory drugs such as ibuprofen and aspirin can increase the risk of bleeding and should be avoided while dengue is a possibility.",
        sourceIds: ["who-chikungunya", "who-dengue"],
      },
      {
        text: "Antibiotics do not treat chikungunya or dengue, because both are viral illnesses.",
        sourceIds: ["who-chikungunya", "who-dengue"],
      },
      {
        text: "Decisions about any medicine, including ones already prescribed for another condition, belong to a clinician or pharmacist who knows the situation.",
        sourceIds: ["who-chikungunya"],
      },
    ],
  },
  {
    id: "prevention",
    heading: "Prevention and mosquito control",
    intro:
      "Avoiding mosquito bites is the protection both fact sheets describe. Because the mosquitoes breed in containers of standing water, household control matters as much as personal protection.",
    statements: [
      {
        text: "Avoidance of mosquito bites offers the best protection against chikungunya.",
        sourceIds: ["who-chikungunya"],
      },
      {
        text: "Repellents should contain DEET, IR3535 or icaridin and be applied to exposed skin or clothing strictly according to the product label.",
        sourceIds: ["who-chikungunya", "who-dengue"],
      },
      {
        text: "Wearing clothing that minimises skin exposure helps, and window and door screens keep mosquitoes out of the home.",
        sourceIds: ["who-chikungunya", "who-dengue"],
      },
      {
        text: "Insecticide-treated mosquito nets are recommended for people who sleep during the day, such as young children, sick patients and older people.",
        sourceIds: ["who-chikungunya", "who-dengue"],
      },
      {
        text: "Breeding sites should be removed by emptying and cleaning containers that hold water on a weekly basis, disposing of waste, and covering domestic water storage.",
        sourceIds: ["who-chikungunya", "who-dengue", "ncvbdc-chikungunya"],
      },
      {
        text: "During outbreaks, health authorities may spray insecticides to kill adult mosquitoes and treat water containers to kill immature stages.",
        sourceIds: ["who-chikungunya"],
      },
    ],
  },
  {
    id: "vaccines",
    heading: "Vaccines",
    intro: null,
    statements: [
      {
        text: "Two chikungunya vaccines have received regulatory approvals and, in some countries, have been recommended for use in populations at risk.",
        sourceIds: ["who-chikungunya", "ukhsa-chikungunya"],
      },
      {
        text: "The WHO fact sheet states that these vaccines are not yet widely available or in widespread use, and that WHO and external expert advisors continue to review trial and post-marketing data.",
        sourceIds: ["who-chikungunya"],
      },
      {
        text: "Availability and eligibility therefore differ by country and by personal circumstances, which is a question for a clinician or a travel health service rather than a page like this one.",
        sourceIds: ["who-chikungunya", "ukhsa-chikungunya"],
      },
    ],
  },
  {
    id: "special-groups",
    heading: "Babies, older adults and pregnancy",
    intro: null,
    statements: [
      {
        text: "Severe symptoms and deaths from chikungunya are rare, and usually occur in young babies or older people with other coexisting health problems.",
        sourceIds: ["who-chikungunya"],
      },
      {
        text: "Newborns can be infected around delivery from an infected mother, or by mosquito bites in the weeks after birth.",
        sourceIds: ["who-chikungunya"],
      },
      {
        text: "Patients at the extremes of age are at higher risk of severe disease, and severe disease requires hospital care because of the risk of organ damage and death.",
        sourceIds: ["who-chikungunya"],
      },
      {
        text: "For dengue, maternal transmission is possible and vertical transmission rates appear low, but when a mother is infected during pregnancy babies may be born pre-term or with low birthweight, and fetal distress can occur.",
        sourceIds: ["who-dengue"],
      },
      {
        text: "A pregnancy with fever and any warning sign should be assessed urgently. The symptom guidance page treats that combination as an emergency.",
        sourceIds: ["who-hypertension", "who-dengue"],
      },
    ],
  },
];

export type TopicQuestion = {
  question: string;
  /** Answered from the assistant, so no answer text is written here. */
  sourceIds: string[];
};

/**
 * Questions the topic page offers as starting points for the assistant. There
 * are deliberately no answers here: an answer belongs to the retrieval pipeline,
 * where it carries citations that can be checked, rather than to a page of
 * hand-written prose.
 */
export const FREQUENT_QUESTIONS: TopicQuestion[] = [
  { question: "What are the symptoms of chikungunya?", sourceIds: ["who-chikungunya"] },
  { question: "How is chikungunya different from dengue?", sourceIds: ["who-chikungunya", "who-dengue"] },
  { question: "Is there a specific antiviral treatment for chikungunya?", sourceIds: ["who-chikungunya"] },
  { question: "Why should ibuprofen be avoided while dengue is possible?", sourceIds: ["who-chikungunya", "who-dengue"] },
  { question: "How long after a mosquito bite do symptoms appear?", sourceIds: ["who-chikungunya"] },
  { question: "How can I prevent mosquito breeding around my home?", sourceIds: ["who-chikungunya"] },
  { question: "Is chikungunya dangerous for newborn babies?", sourceIds: ["who-chikungunya"] },
  { question: "Can you get chikungunya more than once?", sourceIds: ["who-chikungunya"] },
];

export const CHIKUNGUNYA_LIMITATIONS = [
  "This page is a summary of what the named sources say. It is not a diagnosis, and it cannot tell you whether you or anyone else has chikungunya or dengue.",
  "Chikungunya, dengue and Zika overlap enough that the WHO fact sheet calls chikungunya easy to misdiagnose. Only testing can tell them apart.",
  "No medication doses are given, and nothing here advises starting, stopping or changing a medicine.",
  "The page does not describe chikungunya treatment available at any particular hospital, does not quote prices, and does not list clinics.",
  "The content has not been reviewed by a clinician. It reproduces and organises published public health guidance, and that distinction is recorded in the corpus documentation rather than blurred.",
];
