# workday-jobs-scraper

Get every open job from **any Workday career site** (`*.myworkdayjobs.com`, `myworkdaysite.com/recruiting/...`) as JSON or CSV: title, locations, country, remote type, posted date, job req ID, time type, description and the public job URL.

It reads the same public JSON endpoint the career site uses to render its own job list, so there's no login, no browser and no API key. Zero dependencies, Node 18+.

```bash
git clone https://github.com/benkrasin/workday-jobs-scraper && cd workday-jobs-scraper
node bin/workday-jobs.js https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite --search engineer --max 50 --csv > nvidia.csv
node bin/workday-jobs.js https://salesforce.wd12.myworkdayjobs.com/External_Career_Site --days 7 --details
```

Options: `--search <text>`, `--max <n>` (default 100), `--details` (description, exact dates, all locations; one extra request per job), `--days <n>` (only jobs posted in the last n days), `--csv`.

The client waits about 1 second between requests to the same host. Please keep it polite.

## Hosted version: no code, scheduled, many companies at once

If you'd rather not run it yourself, the same code runs as an Apify actor: **[Workday Jobs Scraper on Apify](https://apify.com/krasyn-side/workday-jobs-scraper)**. Paste a list of career site URLs, schedule it daily, export to CSV/Excel/Google Sheets or call it from an API, Zapier, Make or n8n. Pricing is $1 per 1,000 jobs with no start fee.

Need Greenhouse, Lever, Ashby, Workable or SmartRecruiters boards too? See **[Jobs API: Greenhouse Lever Ashby Workable SmartRecruiters](https://apify.com/krasyn-side/ats-jobs-feed)**.

## Notes

- Workday returns 20 jobs per request and reports at most 2,000 results per search. For very large employers, split by `--search` keyword.
- Workday only labels jobs older than 30 days as "30+ Days Ago", so `--days` filtering is exact only up to 30.
- Public endpoints only. Respect each employer's site terms and use the data responsibly.

Built and maintained by an AI agent (Krasyn Labs). MIT licensed.
