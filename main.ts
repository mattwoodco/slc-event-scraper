import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import fs from "fs";
import path from "path";
import { chromium, Page } from "playwright";
import { z } from "zod";

const openai = createOpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "",
});

const EventSchema = z.object({
  website: z.string(),
  venue: z.string(),
  price: z.string(),
  event: z.string(),
  date: z.string(),
  ticketLink: z.string(),
});

export type Event = z.infer<typeof EventSchema>;

const WebsiteConfigSchema = z.object({
  url: z.string().url(),
  venue: z.string(),
  upcomingEventsSelector: z.string().optional(),
  eventListSelector: z.string(),
  eventSectionSelector: z.string(),
  defaultSelectors: z.object({
    venue: z.string(),
    price: z.string(),
    event: z.string(),
    date: z.string(),
    ticketLink: z.string(),
    subtitle: z.string().optional(),
    pretitle: z.string().optional(),
  }),
});

export type WebsiteConfig = z.infer<typeof WebsiteConfigSchema>;

export let websiteConfigs: Record<string, WebsiteConfig> = {
  stateroompresents: {
    url: "https://thestateroompresents.com/stateroompresents",
    venue: "The State Room Presents",
    eventListSelector: ".d-flex.align-items-center.row",
    eventSectionSelector: ".mod-dpcalendar-upcoming-custom__events",
    defaultSelectors: {
      venue: ".up-pretitle",
      price: ".up-link a",
      event: ".up-title a",
      date: ".up-date",
      ticketLink: ".up-link a",
      subtitle: ".up-subtitle",
      pretitle: ".up-pretitle",
    },
  },
  deervalley: {
    url: "https://thestateroompresents.com/deer-valley",
    venue: "Deer Valley Concert Series",
    eventListSelector: ".d-flex.align-items-center.row",
    eventSectionSelector: ".mod-dpcalendar-upcoming-custom__events",
    defaultSelectors: {
      venue: ".up-pretitle",
      price: ".up-link a",
      event: ".up-title a",
      date: ".up-date",
      ticketLink: ".up-link a",
      subtitle: ".up-subtitle",
      pretitle: ".up-pretitle",
    },
  },
  stateroom: {
    url: "https://thestateroompresents.com/the-state-room",
    venue: "The State Room",
    eventListSelector: ".d-flex.align-items-center.row",
    eventSectionSelector: ".mod-dpcalendar-upcoming-custom__events",
    defaultSelectors: {
      venue: ".up-pretitle",
      price: ".up-link a",
      event: ".up-title a",
      date: ".up-date",
      ticketLink: ".up-link a",
      subtitle: ".up-subtitle",
      pretitle: ".up-pretitle",
    },
  },
  commonwealth: {
    url: "https://thestateroompresents.com/the-commonwealth-room",
    venue: "Commonwealth Room",
    eventListSelector: ".d-flex.align-items-center.row",
    eventSectionSelector: ".mod-dpcalendar-upcoming-custom__events",
    defaultSelectors: {
      venue: ".up-pretitle",
      price: ".up-link a",
      event: ".up-title a",
      date: ".up-date",
      ticketLink: ".up-link a",
      subtitle: ".up-subtitle",
      pretitle: ".up-pretitle",
    },
  },
  eccles: {
    url: "https://thestateroompresents.com/eccles-theater",
    venue: "Eccles Theater",
    eventListSelector: ".d-flex.align-items-center.row",
    eventSectionSelector: ".mod-dpcalendar-upcoming-custom__events",
    defaultSelectors: {
      venue: ".up-pretitle",
      price: ".up-link a",
      event: ".up-title a",
      date: ".up-date",
      ticketLink: ".up-link a",
      subtitle: ".up-subtitle",
      pretitle: ".up-pretitle",
    },
  },
  snspresents: {
    url: "https://snspresents.com/",
    venue: "SNS Presents",
    upcomingEventsSelector: "text=upcoming events",
    eventListSelector: "div.tix__widget",
    eventSectionSelector: "div.sqs-block-content",
    defaultSelectors: {
      venue: ".tix__venue",
      price: ".tix__widget--footer",
      event: ".tix__title--headliner",
      date: ".tix__date",
      ticketLink: ".tix__widget--footer a",
    },
  },
};

export async function getSelectorsFromLLM(
  html: string,
  defaultSelectors: WebsiteConfig["defaultSelectors"]
): Promise<WebsiteConfig["defaultSelectors"]> {
  const prompt = `Given the HTML snippet, provide CSS selectors for venue, price, event, date, ticketLink, subtitle, and pretitle elements for each event listed:\n\n${html}`;

  try {
    const { object } = await generateObject({
      model: openai("llama3:latest"),
      schema: z.object({
        selectors: z.object({
          venue: z.string(),
          price: z.string(),
          event: z.string(),
          date: z.string(),
          ticketLink: z.string(),
          subtitle: z.string().optional(),
          pretitle: z.string().optional(),
        }),
      }),
      prompt,
    });

    return object.selectors;
  } catch {
    return defaultSelectors;
  }
}

export function formatDate(dateString: string): string {
  if (!dateString.trim() || dateString === "mockValue") {
    // console.warn(`Invalid date string received: ${dateString}`);
    return dateString;
  }
  if (!dateString.trim()) {
    console.warn("Empty date string received");
    return dateString;
  }

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Helper function to parse a single date
  function parseSingleDate(date: string): string {
    const parts = date.split(/[,\s]+/).filter(Boolean);
    let dayOfWeek, month, day, year;

    // Determine which parts we have
    if (days.includes(parts[0])) {
      [dayOfWeek, month, day, year] = parts;
    } else if (months.includes(parts[0].slice(0, 3))) {
      [month, day, year] = parts;
    } else {
      console.warn(`Unrecognized date format: ${date}`);
      return date;
    }

    // Infer the year if it's missing
    if (!year) {
      year = new Date().getFullYear().toString();
    }

    // Remove any non-digit characters from day and year
    day = day?.replace(/\D/g, "");
    year = year?.replace(/\D/g, "");

    const monthIndex = months.findIndex(
      (m) => m.toLowerCase() === month.toLowerCase().slice(0, 3)
    );
    if (monthIndex === -1) {
      console.warn(`Invalid month in date: ${date}`);
      return date;
    }

    // Create a new Date object
    const dateObj = new Date(parseInt(year), monthIndex, parseInt(day));

    // Format the date
    return `${days[dateObj.getDay()]}, ${
      months[monthIndex]
    } ${dateObj.getDate()}, ${dateObj.getFullYear()}`;
  }

  // Handle single date and date range formats
  const dateParts = dateString
    .split("-")
    .map((d) => d.trim())
    .map(parseSingleDate);

  // If it's a date range, ensure both dates are formatted
  if (dateParts.length === 2) {
    return dateParts.join(" - ");
  } else {
    return dateParts[0]; // Single date
  }
}

export function removeSearchParams(url: string): string {
  try {
    const urlObject = new URL(url);
    urlObject.search = "";
    return urlObject.toString();
  } catch {
    return url;
  }
}
export async function scrapeEvents(
  page: Page,
  selectors: WebsiteConfig["defaultSelectors"],
  eventListSelector: string,
  websiteKey: string,
  venue: string
): Promise<Event[]> {
  const eventElements = await page.$$(eventListSelector);

  return Promise.all(
    eventElements.map(async (element) => {
      const eventData: Partial<Event> = { website: websiteKey };

      let presenter = "";
      let mainArtist = "";
      let supportingActs = "";

      for (const [key, selector] of Object.entries(selectors)) {
        if (!selector) continue;
        const text = await element
          .$eval(selector, (el) => el.textContent?.trim() || "")
          .catch(() => "");

        if (key === "price") {
          eventData[key] = text.toLowerCase().includes("sold out")
            ? "SOLD OUT"
            : text.match(/\$\d+(\.\d{2})?/)?.[0] || text.trim();
        } else if (key === "ticketLink") {
          eventData[key] = removeSearchParams(
            await element
              .$eval(selector, (el) => (el as HTMLAnchorElement).href)
              .catch(() => "")
          );
        } else if (key === "date") {
          eventData[key] = formatDate(text);
        } else if (key === "event") {
          mainArtist = text;
        } else if (key === "venue" && !text) {
          eventData[key as keyof Event] = venue;
        } else if (key === "pretitle") {
          presenter = text;
        } else if (key === "subtitle") {
          supportingActs = text;
        } else if (key !== "subtitle" && key !== "pretitle") {
          eventData[key as keyof Event] = text;
        }
      }

      // Construct the event title
      let eventTitle = [];
      if (presenter) eventTitle.push(presenter.toUpperCase());
      if (mainArtist) eventTitle.push(mainArtist);
      if (supportingActs) eventTitle.push(supportingActs);

      eventData["event"] = eventTitle.join(" ");

      return eventData as Event;
    })
  );
}

export async function scrapeWebsite(
  config: WebsiteConfig,
  websiteKey: string
): Promise<Event[]> {
  console.log(`Scraping ${config.url}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(config.url);

    if (config.upcomingEventsSelector) {
      await page.waitForSelector(config.upcomingEventsSelector, {
        state: "visible",
        timeout: 10000,
      });
    }

    await page.waitForSelector(config.eventListSelector, {
      state: "visible",
      timeout: 10000,
    });

    const eventsSectionHTML = await page.innerHTML(config.eventSectionSelector);
    const selectors = await getSelectorsFromLLM(
      eventsSectionHTML,
      config.defaultSelectors
    );

    return await scrapeEvents(
      page,
      selectors,
      config.eventListSelector,
      websiteKey,
      config.venue
    );
  } finally {
    await browser.close();
  }
}

export function saveToJson(data: Event[], filename: string) {
  const cleanedData = data.filter(
    (event) =>
      event.website &&
      event.venue &&
      event.price &&
      event.event &&
      event.date &&
      event.ticketLink
  );

  const jsonData = JSON.stringify(cleanedData, null, 2);
  fs.writeFileSync(filename, jsonData);
  console.log(`Data saved to ${filename}`);
  console.log(
    `Total raw events: ${data.length}, Cleaned events: ${cleanedData.length}`
  );
}

export async function main() {
  let allEvents: Event[] = [];

  for (const [key, config] of Object.entries(websiteConfigs)) {
    try {
      const events = await scrapeWebsite(config, key);
      allEvents = allEvents.concat(events);
    } catch (error) {
      console.error(`Error scraping ${key}:`, error);
    }
  }

  const date = new Date().toISOString().split("T")[0];
  const filename = path.join(__dirname, `event_data_${date}.json`);
  saveToJson(allEvents, filename);
}

main().catch(console.error);

export function setWebsiteConfigsForTesting(newConfigs: typeof websiteConfigs) {
  websiteConfigs = newConfigs;
}
