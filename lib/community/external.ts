/**
 * Verified external patient-community directory.
 *
 * Every entry here was opened and read on the date recorded in `checkedOn`. The
 * notes state what could actually be established: whether the group exists and is
 * relevant, whether it can be read without an account, and what activity was
 * visible. Nothing is scraped, mirrored, or embedded. These are ordinary outbound
 * links, and UltimateHealth has no partnership with, or endorsement from, any
 * organisation listed.
 *
 * Rules for editing this file:
 *
 *  1. Open the canonical URL yourself. Do not add an entry from a search result,
 *     a directory listing, or another site's description.
 *  2. Update `checkedOn` when you re-check it, and change the activity note if
 *     what is visible has changed.
 *  3. If a dedicated group cannot be verified, do not invent one. Say so on the
 *     disease page and link to medical information instead, clearly labelled as
 *     information rather than a community.
 *  4. Never add member counts, testimonials, or activity claims you did not see.
 */

export type ExternalResourceKind =
  | "peer-community"
  | "patient-organisation"
  | "support-service"
  | "medical-information";

export type ExternalActivity =
  | "active"
  | "new-and-small"
  | "not-established"
  | "not-applicable";

export type ExternalResource = {
  id: string;
  name: string;
  platform: string;
  kind: ExternalResourceKind;
  diseaseIds: readonly string[];
  /** The condition or support need the resource addresses. */
  addresses: string;
  description: string;
  url: string;
  /** ISO date the page was last opened and read. */
  checkedOn: string;
  activity: ExternalActivity;
  activityNote: string;
  /** Registration, geography, or other access limits. Null when there are none to note. */
  accessNote: string | null;
  whyUseful: string;
};

export const VERIFIED_ON = "2026-10-20";

export const EXTERNAL_RESOURCES: readonly ExternalResource[] = [
  {
    id: "healthcircle-chikungunya",
    name: "Chikungunya Support",
    platform: "HealthCircle",
    kind: "peer-community",
    diseaseIds: ["chikungunya"],
    addresses: "Chikungunya recovery and lasting joint symptoms",
    description:
      "A condition-specific community page for people recovering from chikungunya and for carers. Posts are organised under the community's own topics rather than a general health feed.",
    url: "https://healthcircle.life/community/chikungunya",
    checkedOn: VERIFIED_ON,
    activity: "new-and-small",
    activityNote:
      "Readable without signing in when checked. The page displayed 2 members and 1 discussion, so it is new and very small. It is a place to start a conversation, not an established active community.",
    accessNote:
      "Reading appears public. An account is required to join or post, and HealthCircle's own community guidelines and privacy policy apply.",
    whyUseful:
      "It was the only dedicated chikungunya community found that could be read and checked without an account. A small space can still be the right place to ask a first question.",
  },
  {
    id: "patientslikeme-chikungunya",
    name: "Chikungunya infection",
    platform: "PatientsLikeMe",
    kind: "peer-community",
    diseaseIds: ["chikungunya"],
    addresses: "Chikungunya symptoms and member-reported experiences",
    description:
      "A condition page on a general patient network that reports how many members say they have chikungunya and summarises their member-reported symptoms and treatments.",
    url: "https://www.patientslikeme.com/conditions/chikungunya-infection",
    checkedOn: VERIFIED_ON,
    activity: "not-established",
    activityNote:
      "The public page displayed 5 members reporting this condition when checked. No public discussion activity could be established, and taking part requires an account, so this is listed as a condition page rather than as an active community.",
    accessNote:
      "The condition page is readable without signing in. A PatientsLikeMe account is required to join, track, or take part.",
    whyUseful:
      "Worth knowing about if you already use PatientsLikeMe for tracking, or want to see how a large patient network structures symptom reports. It is a condition page with member-reported data, not a verified active discussion group.",
  },
  {
    id: "endometriosis-uk-support",
    name: "Endometriosis UK support groups",
    platform: "Endometriosis UK",
    kind: "peer-community",
    diseaseIds: ["endometriosis"],
    addresses: "Endometriosis peer support across the UK",
    description:
      "The support-group directory of a UK endometriosis charity, listing local groups across England, Scotland, Wales and Northern Ireland, plus online groups and private Facebook groups run by some local groups.",
    url: "https://www.endometriosis-uk.org/support-groups",
    checkedOn: VERIFIED_ON,
    activity: "active",
    activityNote:
      "The directory listed local groups in all four UK nations and an online support group when checked. Individual meeting schedules were not verified.",
    accessNote:
      "No account is needed to read the directory. Joining a group uses that group's mailing list, and some groups use a private Facebook group.",
    whyUseful:
      "A route to moderated peer support and local groups rather than a general health feed. Availability depends on location; the online group may suit people without a local meeting.",
  },
  {
    id: "pdmds-india",
    name: "Parkinson's Disease and Movement Disorder Society",
    platform: "PDMDS India",
    kind: "patient-organisation",
    diseaseIds: ["parkinsons-disease"],
    addresses: "Parkinson's support, rehabilitation and caregiving in India",
    description:
      "A not-for-profit patient organisation in India focused on Parkinson's and other movement disorders. Its site describes support and rehabilitation, awareness work, caregiver information, and a network of support centres across Indian states.",
    url: "https://www.parkinsonssocietyindia.com/",
    checkedOn: VERIFIED_ON,
    activity: "not-applicable",
    activityNote:
      "A patient organisation and support-centre network, not an online discussion forum. Individual centre activity was not verified on this check.",
    accessNote:
      "The public site is readable without an account. Contact and referral arrangements for a local support centre were not verified.",
    whyUseful:
      "Useful for people in India who want to find a local support centre or rehabilitation-focused organisation. It is not a substitute for the peer discussions on this page.",
  },
  {
    id: "kidneycareuk-support",
    name: "Kidney Care UK support services",
    platform: "Kidney Care UK",
    kind: "support-service",
    diseaseIds: ["chronic-kidney-disease"],
    addresses: "Chronic kidney disease information, counselling and practical support",
    description:
      "A UK kidney patient charity offering a support line, counselling, patient advocacy, financial grants, and information for people with CKD and their families.",
    url: "https://kidneycareuk.org/get-support/",
    checkedOn: VERIFIED_ON,
    activity: "not-applicable",
    activityNote:
      "A patient support service, not an online peer discussion forum. No community activity is claimed.",
    accessNote:
      "The charity describes its support as free and confidential. It is UK-based; availability of individual services was not independently verified.",
    whyUseful:
      "A route to practical and emotional support from a kidney patient charity, including counselling and benefits advice. It is support rather than clinical advice.",
  },
  {
    id: "who-chikungunya",
    name: "Chikungunya",
    platform: "World Health Organization",
    kind: "medical-information",
    diseaseIds: ["chikungunya"],
    addresses: "Chikungunya medical information",
    description:
      "The WHO topic page on chikungunya, including its fact sheet on transmission, symptoms, diagnosis, treatment and prevention.",
    url: "https://www.who.int/health-topics/chikungunya",
    checkedOn: VERIFIED_ON,
    activity: "not-applicable",
    activityNote: "Reference information, not a patient community.",
    accessNote: null,
    whyUseful:
      "Reliable background information to read before a conversation or take to an appointment. It is medical information, not peer support.",
  },
  {
    id: "who-dengue",
    name: "Dengue and severe dengue",
    platform: "World Health Organization",
    kind: "medical-information",
    diseaseIds: ["dengue"],
    addresses: "Dengue medical information",
    description:
      "The WHO topic page and fact sheet on dengue, including warning signs, transmission and prevention.",
    url: "https://www.who.int/health-topics/dengue-and-severe-dengue",
    checkedOn: VERIFIED_ON,
    activity: "not-applicable",
    activityNote: "Reference information, not a patient community.",
    accessNote: null,
    whyUseful:
      "Reliable background information on dengue and its warning signs. It is medical information, not peer support.",
  },
  {
    id: "who-hypertension",
    name: "Hypertension",
    platform: "World Health Organization",
    kind: "medical-information",
    diseaseIds: ["high-blood-pressure"],
    addresses: "High blood pressure medical information",
    description:
      "The WHO topic page and fact sheet on hypertension: measurement, risks, and what can be done about it.",
    url: "https://www.who.int/health-topics/hypertension",
    checkedOn: VERIFIED_ON,
    activity: "not-applicable",
    activityNote: "Reference information, not a patient community.",
    accessNote: null,
    whyUseful:
      "Reliable background information on high blood pressure. It is medical information, not peer support.",
  },
  {
    id: "who-diabetes",
    name: "Diabetes",
    platform: "World Health Organization",
    kind: "medical-information",
    diseaseIds: ["type-2-diabetes"],
    addresses: "Diabetes medical information",
    description:
      "The WHO topic page and fact sheet on diabetes, including type 2 diabetes, complications and prevention.",
    url: "https://www.who.int/health-topics/diabetes",
    checkedOn: VERIFIED_ON,
    activity: "not-applicable",
    activityNote: "Reference information, not a patient community.",
    accessNote: null,
    whyUseful:
      "Reliable background information on diabetes. It is medical information, not peer support.",
  },
];

export function externalResourcesFor(diseaseId: string): ExternalResource[] {
  return EXTERNAL_RESOURCES.filter((resource) => resource.diseaseIds.includes(diseaseId));
}

export function peerCommunitiesFor(diseaseId: string): ExternalResource[] {
  return externalResourcesFor(diseaseId).filter(
    (resource) => resource.kind === "peer-community",
  );
}

/**
 * Platform-level findings from the check on `VERIFIED_ON`. Kept in code so the
 * reasons a candidate was not listed are reviewable next to the directory, not
 * only in a commit message.
 */
export const PLATFORM_FINDINGS = [
  {
    platform: "PatientsLikeMe",
    url: "https://www.patientslikeme.com/all_communities",
    finding:
      "The chikungunya condition page is reachable and reports 5 members with the condition. Participation requires an account, and no public discussion activity could be established, so it is listed as a condition page rather than an active community.",
  },
  {
    platform: "HealthUnlocked",
    url: "https://healthunlocked.com/",
    finding:
      "The site returned HTTP 403 to a direct read during the check, so neither its community pages nor their activity could be verified. Nothing from HealthUnlocked is listed until it can be checked directly.",
  },
  {
    platform: "HealthCircle",
    url: "https://healthcircle.life/communities",
    finding:
      "The platform is reachable and the dedicated Chikungunya Support page was read. It is a new platform and the group is very small, so only that page is listed, with its activity stated plainly.",
  },
] as const;

/** A dedicated chikungunya community was found, but it is new and small. */
export const CHIKUNGUNYA_DEDICATED_FINDING =
  "A dedicated chikungunya community page was verified on HealthCircle, but it is new and very small. It is listed above with that limitation stated, not described as an established community.";
