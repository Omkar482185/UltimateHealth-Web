# Podcasts and videos

A curated catalogue of health videos published by named health authorities, on their
own YouTube channels. It is the one part of this platform that shows third-party
content, so what is listed, how it was checked, and what a listing does **not** mean
are all recorded here rather than left to the interface.

## Where it lives

| File | What it holds |
| --- | --- |
| `lib/podcasts/catalogue.ts` | The 36 entries, the publisher classification, and the search, filter and related-episode functions. |
| `lib/profile/options.ts` | The topic vocabulary, and which profile interest maps to which topics. |
| `app/podcasts/page.tsx` | The tab: catalogue, filters, profile-driven suggestions. |
| `app/podcasts/[id]/page.tsx` | One episode: embedded player, direct link, metadata, related episodes. |
| `components/PodcastBrowser.tsx` | Search, topic filters, language filter, empty state, save control. |
| `scripts/check-podcasts.ts` | Structural checks, selection behaviour, and `--live` verification against YouTube. |

## How each entry was verified

Every entry was added from the publisher's own channel, and the video id, title,
channel name, upload date and duration were read from that video's own watch page and
oEmbed record, not written from memory. `pnpm check:podcasts --live` re-reads all of
them and fails on any drift, so a video that is renamed, moved to another channel or
removed becomes a failing check rather than a card that opens the wrong thing.

The live check caught two real errors during development and is the reason the
catalogue holds exact values:

- three titles use a typographic apostrophe (`CDC’s`, `Let’s`, `WHO’s`) and had been
  written with a plain one, so the entry did not match the published title;
- the Indian Ministry of Health and Family Welfare channel is named
  `Ministry of Health & Family Welfare`, and the catalogue had added `(India)` and
  expanded `NVBDCP MoH&FW`. The publisher field now holds exactly what the channel
  says, and the country is explained in the project-written summary instead.

`pnpm check:podcasts` (offline) asserts the structural properties: unique slugs and
videos, the watch URL and thumbnail both naming the entry's own video id, a real
publication date and duration, topics drawn from the filter's own vocabulary, and a
summary written in plain ASCII. It exits 2 when the network prevents the live pass, so
"could not test" is never read as "verified".

## What a listing means, and what it does not

- It means the video is published by a recognised health authority on its own channel.
  Each entry records which kind of body that is: an international health agency, a
  national public health agency, a national health service, or a professional medical
  society.
- It does **not** mean this project has clinically reviewed the episode. It has not.
  The interface says so on the tab and on every episode page, and
  `CATALOGUE_VERIFICATION.scopeNote` records it in the data.
- Nothing is inferred about medical suitability. Suggestions are matched by topic to
  the interests and goals a person selected, and the reason given names that interest
  or goal. No episode is ever described as appropriate for a condition.
- Episodes tied to a campaign or outbreak that has passed carry a `datedNote` and are
  labelled as dated in the interface. The June 2021 COVID-19 vaccination episode is
  the clearest example: it is not current vaccination guidance for any country.

## What is deliberately absent

- No view counts, ratings, "most popular" ordering or testimonials. Popularity is not
  an editorial claim this project is in a position to make.
- No scraping. The catalogue is a static module; the only network access is the
  verification script, which reads each video's own page once per run.
- No YouTube API key. The watch page and oEmbed record are public, which is enough for
  the fields held here.
- No summarisation of video content. `summary` restates what the published title and
  publisher establish, and the video is the authoritative content.

## Adding an episode

1. Find the video on the publisher's own channel and confirm the channel is one of the
   four kinds above.
2. Read the video id, title, channel name, upload date and duration from the watch page.
3. Add an entry to `PODCAST_ENTRIES` with those exact values, a project-written
   `summary`, one or more topics from `PODCAST_TOPIC_LABELS`, and `datedNote` when the
   episode is tied to a past campaign.
4. Run `pnpm check:podcasts --live`. The live pass compares the title, channel, date and
   duration you entered against YouTube and fails on any difference, which is also how
   a typo in a video id is caught.

## Player and fallback

The episode page embeds `https://www.youtube-nocookie.com/embed/<id>` and always shows
a **Watch on YouTube** link beside it. The direct link is not hidden behind an error
state: some publishers disable embedding and some browsers and networks block it, so
the reliable route to the content is visible before anything is attempted. The listing
page embeds nothing, so a catalogue of 36 episodes costs no player requests.

## Limits

- Videos are played from YouTube, so watching one is subject to YouTube's terms and
  privacy practices, not this project's. No YouTube cookie is set before a reader opens
  an episode.
- The catalogue covers what these publishers have produced in English and Hindi. Most
  of it is from the WHO, the CDC, the NHS, UKHSA, the American Heart Association, the
  British Heart Foundation, and India's Ministry of Health and Family Welfare, MyGov
  India and the Central TB Division.
- Topics with no published video from an authority are absent from the catalogue rather
  than filled from an unofficial channel. Kidney health is the clearest gap: the
  corpus covers it, and no episode from one of these publishers does.
