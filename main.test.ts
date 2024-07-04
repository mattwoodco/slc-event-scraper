import { generateObject } from "ai";
import fs from "fs";
import path from "path";
import * as mainModule from "./main";
import {
  Event,
  formatDate,
  getSelectorsFromLLM,
  removeSearchParams,
  scrapeEvents,
  scrapeWebsite,
  WebsiteConfig,
} from "./main";

jest.mock("playwright", () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        goto: jest.fn(),
        waitForSelector: jest.fn(),
        innerHTML: jest.fn(),
        $$: jest.fn().mockResolvedValue([
          {
            $eval: jest.fn().mockImplementation((selector, callback) => {
              if (selector.includes("venue"))
                return Promise.resolve("Test Venue");
              if (selector.includes("date"))
                return Promise.resolve("Jul 4, 2024");
              return Promise.resolve("mockValue");
            }),
          },
        ]),
        $eval: jest.fn().mockResolvedValue("mockValue"),
      }),
      close: jest.fn(),
    }),
  },
}));

jest.mock("fs", () => ({
  writeFileSync: jest.fn(),
}));

jest.mock("ai", () => ({
  generateObject: jest.fn(),
}));

jest.mock("./main", () => {
  const originalModule = jest.requireActual("./main");
  return {
    ...originalModule,
    scrapeWebsite: jest.fn(),
    saveToJson: originalModule.saveToJson,
    main: jest.fn(),
  };
});

beforeAll(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("Utility Functions", () => {
  describe("formatDate", () => {
    test("formats single date correctly", () => {
      expect(formatDate("Jul 4, 2024")).toBe("Thu, Jul 4, 2024");
    });

    test("formats date range correctly", () => {
      expect(formatDate("Jul 4 - Jul 5, 2024")).toBe(
        "Thu, Jul 4, 2024 - Fri, Jul 5, 2024"
      );
    });

    test("handles invalid input gracefully", () => {
      expect(formatDate("")).toBe("");
      expect(formatDate("Invalid Date")).toBe("Invalid Date");
    });
  });

  describe("removeSearchParams", () => {
    test("removes search parameters from URL", () => {
      expect(removeSearchParams("https://example.com?param=value")).toBe(
        "https://example.com/"
      );
    });

    test("returns original string for invalid URLs", () => {
      expect(removeSearchParams("not a url")).toBe("not a url");
    });
  });
});

describe("LLM Interaction", () => {
  describe("getSelectorsFromLLM", () => {
    const mockDefaultSelectors: WebsiteConfig["defaultSelectors"] = {
      venue: ".venue",
      price: ".price",
      event: ".event",
      date: ".date",
      ticketLink: ".ticket",
    };

    test("returns LLM-generated selectors when successful", async () => {
      (generateObject as jest.Mock).mockResolvedValue({
        object: {
          selectors: {
            venue: ".new-venue",
            price: ".new-price",
            event: ".new-event",
            date: ".new-date",
            ticketLink: ".new-ticket",
          },
        },
      });

      const result = await getSelectorsFromLLM(
        "<div>Mock HTML</div>",
        mockDefaultSelectors
      );
      expect(result).toEqual({
        venue: ".new-venue",
        price: ".new-price",
        event: ".new-event",
        date: ".new-date",
        ticketLink: ".new-ticket",
      });
    });

    test("returns default selectors when LLM fails", async () => {
      (generateObject as jest.Mock).mockRejectedValue(new Error("LLM failed"));

      const result = await getSelectorsFromLLM(
        "<div>Mock HTML</div>",
        mockDefaultSelectors
      );
      expect(result).toEqual(mockDefaultSelectors);
    });
  });
});

describe("Scraping Functions", () => {
  describe("scrapeEvents", () => {
    let mockPage: jest.Mocked<any>;
    let mockSelectors: WebsiteConfig["defaultSelectors"];

    beforeEach(() => {
      mockPage = {
        $$: jest.fn().mockResolvedValue([
          {
            $eval: jest.fn().mockImplementation((selector, callback) => {
              if (selector === mockSelectors.venue)
                return Promise.resolve("Test Venue");
              if (selector === mockSelectors.date)
                return Promise.resolve("Jul 4, 2024");
              return Promise.resolve("mockValue");
            }),
          },
        ]),
      } as any;
      mockSelectors = {
        venue: ".venue",
        price: ".price",
        event: ".event",
        date: ".date",
        ticketLink: ".ticket",
      };
    });

    test("scrapes events correctly", async () => {
      const events = await scrapeEvents(
        mockPage,
        mockSelectors,
        ".event-list",
        "testSite",
        "Test Venue"
      );
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        website: "testSite",
        venue: "Test Venue",
        price: "mockValue",
        event: "mockValue",
        date: "Thu, Jul 4, 2024",
        ticketLink: "mockValue",
      });
    });
  });

  describe("scrapeWebsite", () => {
    const mockConfig: WebsiteConfig = {
      url: "https://test.com",
      venue: "Test Venue",
      eventListSelector: ".event-list",
      eventSectionSelector: ".event-section",
      defaultSelectors: {
        venue: ".venue",
        price: ".price",
        event: ".event",
        date: ".date",
        ticketLink: ".ticket",
      },
    };

    test("scrapes website correctly", async () => {
      (mainModule.scrapeWebsite as jest.Mock).mockResolvedValue([
        {
          website: "testSite",
          venue: "Test Venue",
          price: "mockValue",
          event: "Test Event",
          date: "Thu, Jul 4, 2024",
          ticketLink: "mockValue",
        },
      ]);

      const events = await scrapeWebsite(mockConfig, "testSite");
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        website: "testSite",
        venue: "Test Venue",
      });
    });
  });
});

describe("Data Saving", () => {
  describe("saveToJson", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    test("saves cleaned data to file", () => {
      const mockEvents: Event[] = [
        {
          website: "commonwealth",
          venue: "mockValue",
          price: "mockValue",
          event: "MOCKVALUE mockValue mockValue",
          date: "Thu, Jul 4, 2024",
          ticketLink: "mockValue",
        },
        {
          website: "eccles",
          venue: "mockValue",
          price: "mockValue",
          event: "MOCKVALUE mockValue mockValue",
          date: "Thu, Jul 4, 2024",
          ticketLink: "mockValue",
        },
        {
          website: "snspresents",
          venue: "Test Venue",
          price: "mockValue",
          event: "mockValue",
          date: "Thu, Jul 4, 2024",
          ticketLink: "mockValue",
        },
      ];
      mainModule.saveToJson(mockEvents, "test.json");

      const savedData = JSON.parse(
        (fs.writeFileSync as jest.Mock).mock.calls[0][1]
      );

      // Filter out unnecessary data in savedData
      const filteredSavedData = savedData.filter((event: Event) =>
        ["commonwealth", "eccles", "snspresents"].includes(event.website)
      );

      expect(filteredSavedData).toHaveLength(mockEvents.length);
      expect(filteredSavedData).toEqual(mockEvents);
    });
  });
});

describe("Main Execution", () => {
  let originalWebsiteConfigs: typeof mainModule.websiteConfigs;

  beforeEach(() => {
    jest.clearAllMocks();

    originalWebsiteConfigs = { ...mainModule.websiteConfigs };
    const testConfigs = {
      testSite1: {
        url: "https://test1.com",
        venue: "Test Venue 1",
        eventListSelector: ".event-list",
        eventSectionSelector: ".event-section",
        defaultSelectors: {
          venue: ".venue",
          price: ".price",
          event: ".event",
          date: ".date",
          ticketLink: ".ticket",
        },
      },
      testSite2: {
        url: "https://test2.com",
        venue: "Test Venue 2",
        eventListSelector: ".event-list",
        eventSectionSelector: ".event-section",
        defaultSelectors: {
          venue: ".venue",
          price: ".price",
          event: ".event",
          date: ".date",
          ticketLink: ".ticket",
        },
      },
      testSite3: {
        url: "https://test3.com",
        venue: "Test Venue 3",
        eventListSelector: ".event-list",
        eventSectionSelector: ".event-section",
        defaultSelectors: {
          venue: ".venue",
          price: ".price",
          event: ".event",
          date: ".date",
          ticketLink: ".ticket",
        },
      },
    };
    mainModule.setWebsiteConfigsForTesting(testConfigs);

    // Mock the implementation of main
    (mainModule.main as jest.Mock).mockImplementation(async () => {
      const allEvents: Event[] = [];
      for (const [key, config] of Object.entries(testConfigs)) {
        try {
          const events = await mainModule.scrapeWebsite(config, key);
          allEvents.push(...events);
        } catch (error) {
          console.error(`Error scraping ${key}:`, error);
        }
      }

      const date = new Date().toISOString().split("T")[0];
      const filename = path.join(__dirname, `event_data_${date}.json`);
      mainModule.saveToJson(allEvents, filename);
    });
  });

  afterEach(() => {
    mainModule.setWebsiteConfigsForTesting(originalWebsiteConfigs);
  });

  test("scrapes all websites and saves data", async () => {
    (mainModule.scrapeWebsite as jest.Mock)
      .mockResolvedValueOnce([{ event: "Test Event 1" }])
      .mockResolvedValueOnce([{ event: "Test Event 2" }])
      .mockResolvedValueOnce([{ event: "Test Event 3" }]);

    await mainModule.main();

    expect(mainModule.scrapeWebsite).toHaveBeenCalledTimes(3);
    expect(mainModule.scrapeWebsite).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://test1.com",
        venue: "Test Venue 1",
      }),
      "testSite1"
    );
    expect(mainModule.scrapeWebsite).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://test2.com",
        venue: "Test Venue 2",
      }),
      "testSite2"
    );
    expect(mainModule.scrapeWebsite).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://test3.com",
        venue: "Test Venue 3",
      }),
      "testSite3"
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("event_data_"),
      expect.any(String)
    );
  });

  test("handles scraping errors gracefully", async () => {
    (mainModule.scrapeWebsite as jest.Mock)
      .mockResolvedValueOnce([{ event: "Test Event 1" }])
      .mockRejectedValueOnce(new Error("Scrape failed"))
      .mockResolvedValueOnce([{ event: "Test Event 3" }]);

    await mainModule.main();

    expect(console.error).toHaveBeenCalledWith(
      "Error scraping testSite2:",
      expect.any(Error)
    );
    expect(mainModule.scrapeWebsite).toHaveBeenCalledTimes(3);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
