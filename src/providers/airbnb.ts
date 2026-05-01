import type { ListingExtraction } from "../types";
import { classifyAirbnbDescriptionLaundrySignal, classifyAirbnbLaundryAmenitySignal } from "../laundry-metadata";
import { deriveListingDetails } from "../listing/details";

const AIRBNB_API_KEY = "d306zoyjsyarp7ifhu67rjxn52tv0t20";
const AIRBNB_STAYS_PDP_SECTIONS_HASH = "b9f31776706a7a799ed2ea0d1fff357808b574b832be21285377404ab59d3f77";

type AirbnbExtractionAdapter = "api" | "html";

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\\u0026/g, "&");
}

function decodeAirbnbGlobalId(typeName: "StayListing" | "DemandStayListing", roomId: string): string {
  return Buffer.from(`${typeName}:${roomId}`).toString("base64");
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0 apartment-finder/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`Airbnb fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchAirbnbJsonApi(listingUrl: string, roomId: string): Promise<unknown> {
  const parsed = new URL(listingUrl);
  const checkIn = parsed.searchParams.get("check_in") || parsed.searchParams.get("checkin");
  const checkOut = parsed.searchParams.get("check_out") || parsed.searchParams.get("checkout");
  const adults = parsed.searchParams.get("adults") || "1";
  const children = parsed.searchParams.get("children") || "0";
  const infants = parsed.searchParams.get("infants") || "0";
  const pets = parsed.searchParams.get("pets") || "0";
  const p3ImpressionId = parsed.searchParams.get("source_impression_id") || `p3_${Date.now()}_apartmentFinder`;
  const amenityIds = parsed.searchParams.getAll("amenities[]")
    .map((value) => Number(value))
    .filter(Number.isFinite);

  const variables = {
    id: decodeAirbnbGlobalId("StayListing", roomId),
    demandStayListingId: decodeAirbnbGlobalId("DemandStayListing", roomId),
    pdpSectionsRequest: {
      adults,
      amenityFilters: amenityIds,
      bypassTargetings: false,
      categoryTag: null,
      causeId: null,
      children,
      disasterId: null,
      discountedGuestFeeVersion: null,
      federatedSearchId: parsed.searchParams.get("federated_search_id"),
      forceBoostPriorityMessageType: null,
      hostPreview: false,
      infants,
      interactionType: null,
      layouts: ["SIDEBAR", "SINGLE_COLUMN"],
      pets: Number(pets),
      pdpTypeOverride: null,
      photoId: null,
      preview: false,
      previousStateCheckIn: null,
      previousStateCheckOut: null,
      priceDropSource: null,
      privateBooking: false,
      promotionUuid: null,
      relaxedAmenityIds: null,
      searchId: null,
      selectedCancellationPolicyId: null,
      selectedRatePlanId: null,
      splitStays: null,
      staysBookingMigrationEnabled: false,
      translateUgc: null,
      useNewSectionWrapperApi: false,
      sectionIds: null,
      checkIn,
      checkOut,
      p3ImpressionId,
    },
    categoryTag: null,
    federatedSearchId: parsed.searchParams.get("federated_search_id"),
    federatedSearchSessionId: null,
    p3ImpressionId,
    photoId: null,
    amenityIds,
    dateRange: checkIn && checkOut ? { startDate: checkIn, endDate: checkOut } : null,
    guestCounts: {
      numberOfAdults: Number(adults),
      numberOfChildren: Number(children),
      numberOfInfants: Number(infants),
      numberOfPets: Number(pets),
    },
    numberOfChildren: Number(children),
    numberOfInfants: Number(infants),
    numberOfPets: Number(pets),
    includePdpMigrationBookItNavFragment: false,
    includeGpBookItFragment: true,
    includePdpMigrationAmenitiesFragment: false,
    includeGpAmenitiesFragment: true,
    includePdpMigrationDescriptionFragment: false,
    includeGpDescriptionFragment: true,
    includePdpMigrationHeroFragment: false,
    includeGpHeroFragment: true,
    includePdpMigrationHighlightsFragment: false,
    includeGpHighlightsFragment: true,
    includePdpMigrationLocationPdpFragment: false,
    includeGpLocationPdpFragment: true,
    includePdpMigrationMeetYourHostFragment: false,
    includeGpMeetYourHostFragment: true,
    includePdpMigrationNavFragment: false,
    includeGpNavFragment: true,
    includePdpMigrationNavMobileFragment: false,
    includeGpNavMobileFragment: true,
    includePdpMigrationBookItFloatingFooterFragment: false,
    includePdpMigrationBookItCalendarSheetFragment: false,
    includePdpMigrationBookItNonExperiencedGuestFragment: false,
    includeGpBookItNonExperiencedGuestFragment: true,
    includePdpMigrationOverviewV2Fragment: false,
    includeGpOverviewV2Fragment: true,
    includePdpMigrationReviewsHighlightBannerFragment: false,
    includeGpReviewsHighlightBannerFragment: true,
    includeGpNonExperiencedGuestLearnMoreModalFragment: true,
    includePdpMigrationReportToAirbnbFragment: false,
    includeGpReportToAirbnbFragment: true,
    includePdpMigrationReviewsFragment: false,
    includeGpReviewsFragment: true,
    includePdpMigrationReviewsEmptyFragment: false,
    includeGpReviewsEmptyFragment: true,
    includePdpMigrationTitleFragment: false,
    includeGpTitleFragment: true,
    includePdpMigrationPoliciesFragment: false,
    includeGpPoliciesFragment: true,
    includePdpMigrationMarqueeBookItFloatingFooterFragment: false,
    includeGpMarqueeBookItFloatingFooterFragment: true,
    includePdpMigrationMarqueeBookItNavFragment: false,
    includeGpMarqueeBookItNavFragment: true,
    includePdpMigrationMarqueeBookItSidebarFragment: false,
    includeGpMarqueeBookItSidebarFragment: true,
  };

  const response = await fetch(
    `https://www.airbnb.com/api/v3/StaysPdpSections/${AIRBNB_STAYS_PDP_SECTIONS_HASH}?operationName=StaysPdpSections&locale=en&currency=USD`,
    {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 apartment-finder/0.1",
        "x-airbnb-api-key": AIRBNB_API_KEY,
        "x-airbnb-graphql-platform": "web",
        "x-airbnb-graphql-platform-client": "minimalist-niobe",
        "x-csrf-without-token": "1",
      },
      body: JSON.stringify({
        operationName: "StaysPdpSections",
        variables,
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: AIRBNB_STAYS_PDP_SECTIONS_HASH,
          },
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Airbnb API fetch failed for ${listingUrl}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function parseRoomId(listingUrl: string): string {
  const roomId = new URL(listingUrl).pathname.match(/\/rooms\/(\d+)/)?.[1];
  if (!roomId) throw new Error(`Could not find Airbnb room id in ${listingUrl}`);
  return roomId;
}

function parsePictureCount(html: string): number | null {
  const match = html.match(/"pictureCount"\s*:\s*(\d{1,4})/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function cleanText(text: string): string {
  return normalizeAmenityText(text)
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMetaContent(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern)?.[1];
    if (match) return cleanText(decodeHtmlEntities(match));
  }
  return "";
}

function normalizeAmenityText(text: string): string {
  return decodeHtmlEntities(text)
    .replace(/\\u00a0/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[–—-]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAirbnbLaundryAmenity(html: string): Pick<
  ListingExtraction,
  "airbnb_laundry_amenity_label" | "airbnb_laundry_amenity_text"
> {
  const washerTitles = new Set<string>();

  const washerAmenityPattern = /"title"\s*:\s*"([^"]*washer[^"]*)"[\s\S]{0,220}?"icon"\s*:\s*"SYSTEM_WASHER"|"icon"\s*:\s*"SYSTEM_WASHER"[\s\S]{0,220}?"title"\s*:\s*"([^"]*washer[^"]*)"/gi;
  for (const match of html.matchAll(washerAmenityPattern)) {
    const title = normalizeAmenityText(match[1] || match[2] || "");
    if (title) washerTitles.add(title);
  }

  if (washerTitles.size === 0) {
    for (const match of html.matchAll(/"title"\s*:\s*"([^"]*washer[^"]*)"/gi)) {
      const title = normalizeAmenityText(match[1] || "");
      if (title) washerTitles.add(title);
    }
  }

  const text = Array.from(washerTitles).join("; ");
  const lower = text.toLowerCase();
  if (!text) return { airbnb_laundry_amenity_label: "NONE", airbnb_laundry_amenity_text: "" };
  if (lower.includes("in building")) {
    return { airbnb_laundry_amenity_label: "WASHER_IN_BUILDING", airbnb_laundry_amenity_text: text };
  }
  if (lower.includes("in unit")) {
    return { airbnb_laundry_amenity_label: "WASHER_IN_UNIT", airbnb_laundry_amenity_text: text };
  }
  return { airbnb_laundry_amenity_label: "WASHER", airbnb_laundry_amenity_text: text };
}

function normalizeAirbnbImageUrl(rawUrl: string): string {
  return decodeHtmlEntities(rawUrl).replace(/[?#].*$/, "");
}

function photoId(url: string): string {
  return normalizeAirbnbImageUrl(url).match(/\/([^/?#]+)\.(?:jpe?g|png|webp)$/i)?.[1] || url;
}

export function uniqueAirbnbImageUrls(urls: string[], roomId: string, maxImages: number): string[] {
  const byId = new Map<string, string>();
  const hostingPath = `/Hosting-${roomId}/`;
  const encodedHostingPhotoPattern = /a0\.muscache\.com\/im\/pictures\/hosting\/Hosting-[A-Za-z0-9_-]+\/original\/[^/?#]+\.(?:jpe?g|png|webp)(?:[?#].*)?$/i;
  const directListingPhotoPattern = /a0\.muscache\.com\/im\/pictures\/[0-9a-f-]+\.(?:jpe?g|png|webp)(?:[?#].*)?$/i;

  for (const rawUrl of urls) {
    if (!rawUrl.includes("a0.muscache.com/im/pictures/")) continue;
    const url = normalizeAirbnbImageUrl(rawUrl);
    const isRoomHostingPhoto = url.includes(hostingPath);
    const isEncodedHostingPhoto = encodedHostingPhotoPattern.test(url);
    const isDirectListingPhoto = directListingPhotoPattern.test(url);
    if (!isRoomHostingPhoto && !isEncodedHostingPhoto && !isDirectListingPhoto) continue;
    byId.set(photoId(url), url);
  }

  return Array.from(byId.values()).slice(0, maxImages);
}

function extractImageUrls(html: string): string[] {
  const urls = new Set<string>();
  const pattern = /https:\/\/a0\.muscache\.com\/im\/pictures\/[^"'\\<> ]+\.(?:jpe?g|png|webp)(?:\?[^"'\\<> ]*)?/gi;
  for (const match of html.matchAll(pattern)) {
    urls.add(match[0]);
  }
  return Array.from(urls);
}

function parseAirbnbAmenities(html: string): ListingExtraction["listing_amenities"] {
  const byGroup = new Map<string, Set<string>>();
  const rowPattern = /id=["']pdp_v3_([^"'_]+(?:_[^"'_]+)*)_\d+_[^"']*row-title["'][^>]*>([\s\S]*?)<\/div>/gi;

  for (const match of html.matchAll(rowPattern)) {
    const group = cleanText(match[1].replace(/_/g, " "))
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
    const item = cleanText(match[2]).replace(/^Unavailable:\s*/i, "");
    if (!group || !item || item.length > 120) continue;
    const items = byGroup.get(group) || new Set<string>();
    items.add(item);
    byGroup.set(group, items);
  }

  if (byGroup.size === 0) {
    const items = new Set<string>();
    const amenityPattern = /\b(wifi|kitchen|washer|dryer|tv|air conditioning|heating|bathtub|hair dryer|cleaning products|soap|bidet|hot water|hangers|bed linens|pillows|blankets|shades|iron|drying rack|clothing storage|refrigerator|microwave|cooking basics|dishes|silverware|freezer|stove|oven|kettle|coffee maker|toaster|patio|balcony|outdoor|parking|elevator|workspace|fire extinguisher|self check-in|keypad)\b/i;
    for (const match of html.matchAll(/"title"\s*:\s*"([^"]+)"/gi)) {
      const item = cleanText(match[1]);
      if (!item || item.length > 120) continue;
      if (!amenityPattern.test(item)) continue;
      if (/^(what this place offers|not included|show all|where you'll sleep)$/i.test(item)) continue;
      if (/^(bathroom|bedroom and laundry|entertainment|heating and cooling|home safety|internet and office|kitchen and dining|outdoor|parking and facilities|services)$/i.test(item)) continue;
      items.add(item.replace(/^Unavailable:\s*/i, ""));
    }
    if (items.size > 0) byGroup.set("Amenities", items);
  }

  return Array.from(byGroup.entries())
    .map(([group, items]) => ({ group, items: Array.from(items).slice(0, 24) }))
    .filter((group) => group.items.length > 0);
}

function parseAirbnbPrice(html: string): string | undefined {
  const text = cleanText(html);
  const match = text.match(/\b(?:USD|US\$|\$)\s*([\d.,]+)\b/i);
  if (!match) return undefined;
  return match[0].startsWith("$") ? `USD ${match[1]}` : match[0];
}

function walkUnknown(value: unknown, visit: (value: Record<string, unknown>) => void): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkUnknown(item, visit);
    return;
  }
  const record = value as Record<string, unknown>;
  visit(record);
  for (const child of Object.values(record)) walkUnknown(child, visit);
}

function extractApiSections(json: unknown): Array<Record<string, unknown>> {
  const sections: Array<Record<string, unknown>> = [];
  walkUnknown(json, (record) => {
    if (typeof record.sectionComponentType === "string" && record.section && typeof record.section === "object") {
      sections.push(record);
    }
  });
  return sections;
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function parseApiAmenities(sections: Array<Record<string, unknown>>): ListingExtraction["listing_amenities"] {
  const amenitiesSection = sections.find((section) => section.sectionComponentType === "AMENITIES_DEFAULT")?.section;
  const groups: ListingExtraction["listing_amenities"] = [];
  if (!amenitiesSection || typeof amenitiesSection !== "object") return groups;

  const seenGroups = new Set<string>();
  const collectGroup = (group: Record<string, unknown>, fallbackTitle: string) => {
    const title = stringField(group, "title") || fallbackTitle;
    const amenities = Array.isArray(group.amenities) ? group.amenities : [];
    const items = amenities
      .filter((amenity): amenity is Record<string, unknown> => Boolean(amenity) && typeof amenity === "object")
      .filter((amenity) => amenity.available !== false)
      .map((amenity) => stringField(amenity, "title") || "")
      .map(cleanText)
      .filter(Boolean);
    if (items.length === 0) return;
    const key = `${title}:${items.join("|")}`;
    if (seenGroups.has(key)) return;
    seenGroups.add(key);
    groups.push({ group: title, items: items.slice(0, 24) });
  };

  const section = amenitiesSection as Record<string, unknown>;
  for (const key of ["previewAmenitiesGroups", "seeAllAmenitiesGroups"]) {
    const rawGroups = Array.isArray(section[key]) ? section[key] : [];
    for (const rawGroup of rawGroups) {
      if (rawGroup && typeof rawGroup === "object") collectGroup(rawGroup as Record<string, unknown>, "Amenities");
    }
  }

  return groups;
}

function parseApiLaundryAmenity(amenityGroups: ListingExtraction["listing_amenities"]): Pick<
  ListingExtraction,
  "airbnb_laundry_amenity_label" | "airbnb_laundry_amenity_text"
> {
  const washerTitles = new Set<string>();
  for (const group of amenityGroups || []) {
    for (const item of group.items) {
      if (/washer/i.test(item)) washerTitles.add(item);
    }
  }

  const text = Array.from(washerTitles).join("; ");
  const lower = text.toLowerCase();
  if (!text) return { airbnb_laundry_amenity_label: "NONE", airbnb_laundry_amenity_text: "" };
  if (lower.includes("in building")) {
    return { airbnb_laundry_amenity_label: "WASHER_IN_BUILDING", airbnb_laundry_amenity_text: text };
  }
  if (lower.includes("in unit")) {
    return { airbnb_laundry_amenity_label: "WASHER_IN_UNIT", airbnb_laundry_amenity_text: text };
  }
  return { airbnb_laundry_amenity_label: "WASHER", airbnb_laundry_amenity_text: text };
}

function textFromHtml(html: string | undefined): string {
  return cleanText(
    decodeHtmlEntities(html || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

async function extractAirbnbListingWithApi(
  listingUrl: string,
  maxImages: number,
): Promise<ListingExtraction> {
  const roomId = parseRoomId(listingUrl);
  const json = await fetchAirbnbJsonApi(listingUrl, roomId);
  const sections = extractApiSections(json);
  const photoTourSection = sections.find((section) => section.sectionComponentType === "PHOTO_TOUR_SCROLLABLE")?.section as
    | Record<string, unknown>
    | undefined;
  const mediaItems = Array.isArray(photoTourSection?.mediaItems) ? photoTourSection.mediaItems : [];
  const rawImageUrls = mediaItems
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => stringField(item, "baseUrl") || "")
    .filter(Boolean);
  const imageUrls = uniqueAirbnbImageUrls(rawImageUrls, roomId, maxImages);
  if (imageUrls.length === 0) throw new Error("Airbnb API returned no listing photos.");

  const titleSection = sections.find((section) => section.sectionComponentType === "TITLE_DEFAULT")?.section as
    | Record<string, unknown>
    | undefined;
  const descriptionSection = sections.find((section) => section.sectionComponentType === "DESCRIPTION_DEFAULT")?.section as
    | Record<string, unknown>
    | undefined;
  const htmlDescription = descriptionSection?.htmlDescription && typeof descriptionSection.htmlDescription === "object"
    ? descriptionSection.htmlDescription as Record<string, unknown>
    : undefined;
  const shareSave = titleSection?.shareSave && typeof titleSection.shareSave === "object"
    ? titleSection.shareSave as Record<string, unknown>
    : undefined;
  const sharingConfig = shareSave?.sharingConfig && typeof shareSave.sharingConfig === "object"
    ? shareSave.sharingConfig as Record<string, unknown>
    : undefined;
  const amenityGroups = parseApiAmenities(sections);
  const laundryAmenity = parseApiLaundryAmenity(amenityGroups);
  const airbnbSignal = laundryAmenity.airbnb_laundry_amenity_text
    ? classifyAirbnbLaundryAmenitySignal(laundryAmenity.airbnb_laundry_amenity_text)
    : null;
  const listingDescription = textFromHtml(stringField(htmlDescription, "htmlText")) || stringField(titleSection, "title") || "";
  const descriptionSignal = classifyAirbnbDescriptionLaundrySignal(listingDescription);

  const baseExtraction = {
    provider: "airbnb",
    listing_title: stringField(sharingConfig, "title") || stringField(titleSection, "title"),
    listing_description: listingDescription,
    listing_amenities: amenityGroups,
    ...laundryAmenity,
    metadata_laundry_signals: [airbnbSignal, descriptionSignal].filter((signal): signal is NonNullable<typeof signal> => Boolean(signal)),
    listing_url: listingUrl,
    page_url: new URL(`/rooms/${roomId}`, "https://www.airbnb.com").href,
    image_urls: imageUrls,
    clicked_gallery: false,
    gallery_count: mediaItems.length || null,
    gallery_count_matches_extracted: mediaItems.length === 0 ? null : mediaItems.length === imageUrls.length,
    gallery_text: mediaItems.length ? `${mediaItems.length} photos` : "",
  } satisfies ListingExtraction;

  return {
    ...baseExtraction,
    ...deriveListingDetails(baseExtraction),
  };
}

async function extractAirbnbListingWithHtml(
  listingUrl: string,
  maxImages: number,
): Promise<ListingExtraction> {
  const roomId = parseRoomId(listingUrl);
  const html = await fetchText(listingUrl);
  const galleryCount = parsePictureCount(html);
  const imageUrls = uniqueAirbnbImageUrls(extractImageUrls(html), roomId, maxImages);
  const laundryAmenity = parseAirbnbLaundryAmenity(html);
  const airbnbSignal = laundryAmenity.airbnb_laundry_amenity_text
    ? classifyAirbnbLaundryAmenitySignal(laundryAmenity.airbnb_laundry_amenity_text)
    : null;
  const listingDescription = parseMetaContent(html, "og:description") || parseMetaContent(html, "description");
  const descriptionSignal = classifyAirbnbDescriptionLaundrySignal(listingDescription);

  const baseExtraction = {
    provider: "airbnb",
    listing_title: parseMetaContent(html, "og:title"),
    listing_description: listingDescription,
    listing_price_text: parseAirbnbPrice(html),
    listing_amenities: parseAirbnbAmenities(html),
    ...laundryAmenity,
    metadata_laundry_signals: [airbnbSignal, descriptionSignal].filter((signal): signal is NonNullable<typeof signal> => Boolean(signal)),
    listing_url: listingUrl,
    page_url: new URL(`/rooms/${roomId}`, "https://www.airbnb.com").href,
    image_urls: imageUrls,
    clicked_gallery: false,
    gallery_count: galleryCount,
    gallery_count_matches_extracted: galleryCount === null ? null : galleryCount === imageUrls.length,
    gallery_text: galleryCount === null ? "" : `${galleryCount} photos`,
  } satisfies ListingExtraction;

  return {
    ...baseExtraction,
    ...deriveListingDetails(baseExtraction),
  };
}

export async function extractAirbnbListingImageUrls(
  listingUrl: string,
  maxImages: number,
): Promise<ListingExtraction> {
  const adapter = (process.env.AIRBNB_EXTRACTION_ADAPTER || "api").toLowerCase() as AirbnbExtractionAdapter;
  if (adapter === "html") {
    return extractAirbnbListingWithHtml(listingUrl, maxImages);
  }
  try {
    return await extractAirbnbListingWithApi(listingUrl, maxImages);
  } catch (error) {
    if (process.env.AIRBNB_EXTRACTION_ADAPTER === "api") throw error;
    return extractAirbnbListingWithHtml(listingUrl, maxImages);
  }
}
