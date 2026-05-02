import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSearchScanJob, recordListingFeedback, startSearchScan, type SearchScanJob, type SearchUiResult } from "@/web/search.functions";
import {
  AIRBNB_FILTER_OPTIONS,
  ARGENPROP_FILTER_OPTIONS,
  ZONAPROP_FILTER_OPTIONS,
  supportedNeighborhoodOptions,
  type FilterOption,
  type SupportedNeighborhood,
} from "@/core/search-url-builder";

export const Route = createFileRoute("/")({
  loader: () => getInitialPreferences(),
  component: HomePage,
});

const COMMON_NEIGHBORHOOD_KEYS = [
  "nunez",
  "las-canitas",
  "belgrano",
  "palermo",
  "colegiales",
  "recoleta",
  "barrio-norte",
  "caballito",
];

type ResultFilter = "ALL" | "MATCH" | "NO_MATCH" | "REVIEW";
type ResultSort = "SCAN_ORDER" | "PRICE_ASC" | "PRICE_DESC";

type FormState = {
  mode: "filters" | "url";
  provider: "zonaprop" | "argenprop" | "airbnb";
  searchUrl: string;
  neighborhoods: string[];
  minPriceUsd: string;
  maxPriceUsd: string;
  minSurfaceM2: string;
  maxSurfaceM2: string;
  surfaceType: "covered" | "total";
  minBathrooms: string;
  minParking: string;
  minAmbientes: string;
  maxAmbientes: string;
  minDormitorios: string;
  maxDormitorios: string;
  furnished: boolean;
  propertySubtypes: string[];
  advertiserType: "all" | "agency" | "owner";
  publicationDate: "" | "yesterday" | "today" | "last-week";
  age: "" | "under-construction" | "new" | "up-to-5-years";
  roomTypes: string[];
  comforts: string[];
  propertyFeatures: string[];
  disposition: string[];
  services: string[];
  media: string[];
  argenpropGeneralServices: string[];
  checkIn: string;
  checkOut: string;
  adults: string;
  children: string;
  infants: string;
  pets: string;
  airbnbRoomTypes: string[];
  airbnbAmenityIds: string[];
  minBedrooms: string;
  minBeds: string;
  minAirbnbBathrooms: string;
  maxListings: string;
  maxPages: string;
};

const defaultForm: FormState = {
  mode: "filters",
  provider: "zonaprop",
  searchUrl: "",
  neighborhoods: ["nunez", "las-canitas"],
  minPriceUsd: "",
  maxPriceUsd: "1500",
  minSurfaceM2: "",
  maxSurfaceM2: "",
  surfaceType: "total",
  minBathrooms: "",
  minParking: "",
  minAmbientes: "",
  maxAmbientes: "",
  minDormitorios: "",
  maxDormitorios: "",
  furnished: true,
  propertySubtypes: [],
  advertiserType: "all",
  publicationDate: "",
  age: "",
  roomTypes: [],
  comforts: [],
  propertyFeatures: [],
  disposition: [],
  services: [],
  media: [],
  argenpropGeneralServices: ["amoblado"],
  checkIn: "2026-06-14",
  checkOut: "2026-08-23",
  adults: "1",
  children: "",
  infants: "",
  pets: "",
  airbnbRoomTypes: ["Entire home/apt"],
  airbnbAmenityIds: ["33"],
  minBedrooms: "",
  minBeds: "",
  minAirbnbBathrooms: "",
  maxListings: "20",
  maxPages: "3",
};

const LOADING_STAGES = [
  "Preparing the search",
  "Finding result pages",
  "Extracting listing photos and descriptions",
  "Checking for in-unit washers",
  "Ranking and filtering results",
];

const FORM_STORAGE_KEY = "apartment-finder.search-form.v1";
const RESULT_FILTER_STORAGE_KEY = "apartment-finder.result-filter.v1";
const FORM_COOKIE_KEY = "apartment_finder_search_form_v1";
const RESULT_FILTER_COOKIE_KEY = "apartment_finder_result_filter_v1";
const PREFERENCE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

const getInitialPreferences = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  return readInitialPreferencesFromCookieHeader(getRequestHeader("cookie") || "");
});

function HomePage() {
  const startSearchScanFn = useServerFn(startSearchScan);
  const getSearchScanJobFn = useServerFn(getSearchScanJob);
  const recordListingFeedbackFn = useServerFn(recordListingFeedback);
  const initialPreferences = Route.useLoaderData();
  const [form, setForm] = React.useState<FormState>(() => readStoredForm(initialPreferences.form));
  const [resultFilter, setResultFilter] = React.useState<ResultFilter>(() => readStoredResultFilter(initialPreferences.resultFilter));
  const [resultSort, setResultSort] = React.useState<ResultSort>("SCAN_ORDER");
  const [lightbox, setLightbox] = React.useState<{ images: string[]; index: number; title: string } | null>(null);
  const [activeJobId, setActiveJobId] = React.useState<string | null>(null);

  const searchMutation = useMutation({
    mutationKey: ["search-scan", form.mode, form.provider],
    mutationFn: async (payload: FormState) => startSearchScanFn({ data: toSearchPayload(payload) }),
    onSuccess: ({ jobId }) => setActiveJobId(jobId),
  });
  const feedbackMutation = useMutation({
    mutationKey: ["listing-feedback"],
    mutationFn: async (payload: {
      listingUrl: string;
      expectedLocation: "IN_UNIT" | "SHARED_BUILDING" | "UNKNOWN" | "CONFLICTING";
      predictedLocation?: string;
      item: SearchUiResult["items"][number];
    }) => recordListingFeedbackFn({ data: { ...payload, source: "web" } }),
  });

  const jobQuery = useQuery({
    queryKey: ["search-scan-job", activeJobId],
    queryFn: async () => getSearchScanJobFn({ data: { jobId: activeJobId || "" } }),
    enabled: Boolean(activeJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 1000;
    },
  });

  const job = jobQuery.data;
  const result = job?.result;
  const isScanning = searchMutation.isPending || job?.status === "running";
  const scanError = (job?.status === "failed" && job.error)
    ? new Error(job.error)
    : searchMutation.error || jobQuery.error;
  const loadingStage = useLoadingStage(isScanning, job);

  React.useEffect(() => {
    window.localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(form));
    writePreferenceCookie(FORM_COOKIE_KEY, JSON.stringify(form));
  }, [form]);

  React.useEffect(() => {
    window.localStorage.setItem(RESULT_FILTER_STORAGE_KEY, resultFilter);
    writePreferenceCookie(RESULT_FILTER_COOKIE_KEY, resultFilter);
  }, [resultFilter]);

  return (
    <main className="h-screen overflow-hidden bg-background">
      <div className="mx-auto grid h-full w-full max-w-7xl grid-rows-[auto_minmax(0,1fr)] gap-3 px-4 py-3 sm:px-5">
        <header className="flex min-h-0 items-center justify-between gap-4 border-b pb-3">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase text-muted-foreground">Apartment Finder</div>
            <h1 className="truncate text-xl font-semibold tracking-normal text-foreground md:text-2xl">
              Search listings for likely in-unit washers
            </h1>
          </div>
        </header>

        <div className="grid min-h-0 gap-4 lg:grid-cols-[390px_minmax(0,1fr)]">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardHeader className="border-b p-4">
              <CardTitle className="text-sm">Search setup</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto p-4">
              <form
                className="flex min-h-full flex-col"
                onSubmit={(event) => {
                  event.preventDefault();
                  setActiveJobId(null);
                  searchMutation.mutate(form);
                }}
              >
                <div className="space-y-3 pb-4">
                  <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
                    <ModeButton active={form.mode === "filters"} onClick={() => updateForm(setForm, { mode: "filters" })}>
                      Filters
                    </ModeButton>
                    <ModeButton active={form.mode === "url"} onClick={() => updateForm(setForm, { mode: "url" })}>
                      URL
                    </ModeButton>
                  </div>

                  {form.mode === "filters" ? (
                    <>
                      <FilterFields form={form} setForm={setForm} />
                      <ActiveFilterSummary form={form} />
                    </>
                  ) : (
                    <Field label="Search URL" htmlFor="searchUrl">
                      <Textarea
                        id="searchUrl"
                        className="min-h-24 text-sm"
                        value={form.searchUrl}
                        placeholder="https://www.zonaprop.com.ar/..."
                        onChange={(event) => updateForm(setForm, { searchUrl: event.target.value })}
                      />
                    </Field>
                  )}

                  <ScanLimitFields form={form} setForm={setForm} />
                </div>

                <div className="sticky bottom-0 mt-auto border-t bg-card pt-3">
                  <Button className="w-full" type="submit" disabled={isScanning}>
                    {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Scan listings
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <section className="min-h-0 overflow-hidden rounded-lg border bg-card">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">Results</h2>
                  {result ? (
                    <a
                      href={result.searchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {result.searchUrl}
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">Ready to scan listings</p>
                  )}
                </div>
                {result ? <ResultSummary result={result} /> : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <ResultsPanel
                  result={result}
                  error={scanError}
                  pending={isScanning}
                  loadingStage={loadingStage}
                  filter={resultFilter}
                  sort={resultSort}
                  onFilterChange={setResultFilter}
                  onSortChange={setResultSort}
                  onOpenLightbox={(images, index, title) => setLightbox({ images, index, title })}
                  onFeedback={(item, expectedLocation) => feedbackMutation.mutate({
                    listingUrl: item.listingUrl,
                    expectedLocation,
                    predictedLocation: item.decision,
                    item,
                  })}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
      {lightbox ? (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          title={lightbox.title}
          onChangeIndex={(index) => setLightbox((current) => current ? { ...current, index } : current)}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </main>
  );
}

function FilterFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  const neighborhoodOptions = React.useMemo(() => supportedNeighborhoodOptions(), []);

  return (
    <div className="space-y-3">
      <FilterSection title="Basics" defaultOpen>
        <Field label="Provider" htmlFor="provider">
          <select
            id="provider"
            className="h-9 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={form.provider}
            onChange={(event) => updateForm(setForm, { provider: event.target.value as FormState["provider"] })}
          >
            <option value="zonaprop">Zonaprop</option>
            <option value="argenprop">Argenprop</option>
            <option value="airbnb">Airbnb</option>
          </select>
        </Field>

        <NeighborhoodTypeahead
          options={neighborhoodOptions}
          selectedKeys={form.neighborhoods}
          onChange={(neighborhoods) => updateForm(setForm, { neighborhoods })}
        />

        <div className="grid grid-cols-2 gap-2">
          <Field label="Min USD" htmlFor="minPriceUsd">
            <Input
              id="minPriceUsd"
              type="number"
              min="1"
              className="h-9"
              value={form.minPriceUsd}
              onChange={(event) => updateForm(setForm, { minPriceUsd: event.target.value })}
            />
          </Field>
          <Field label="Max USD" htmlFor="maxPriceUsd">
            <Input
              id="maxPriceUsd"
              type="number"
              min="1"
              className="h-9"
              value={form.maxPriceUsd}
              onChange={(event) => updateForm(setForm, { maxPriceUsd: event.target.value })}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={form.furnished}
            onChange={(event) => updateForm(setForm, { furnished: event.target.checked })}
          />
          Furnished / amoblado
        </label>
      </FilterSection>

      {form.provider === "airbnb" ? (
        <AirbnbFilterFields form={form} setForm={setForm} />
      ) : (
        <PortalFilterFields form={form} setForm={setForm} />
      )}
    </div>
  );
}

function ScanLimitFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  return (
    <FilterSection title="Scan limits" defaultOpen>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Max listings" htmlFor="maxListings">
          <Input
            id="maxListings"
            type="number"
            min="1"
            value={form.maxListings}
            onChange={(event) => updateForm(setForm, { maxListings: event.target.value })}
          />
        </Field>
        <Field label="Max pages" htmlFor="maxPages">
          <Input
            id="maxPages"
            type="number"
            min="1"
            value={form.maxPages}
            onChange={(event) => updateForm(setForm, { maxPages: event.target.value })}
          />
        </Field>
      </div>
    </FilterSection>
  );
}

function PortalFilterFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  return (
    <div className="space-y-3">
      <FilterSection title="Rooms" defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min ambientes" htmlFor="minAmbientes">
            <Input
              id="minAmbientes"
              type="number"
              min="1"
              className="h-9"
              value={form.minAmbientes}
              onChange={(event) => updateForm(setForm, { minAmbientes: event.target.value })}
            />
          </Field>
          <Field label="Max ambientes" htmlFor="maxAmbientes">
            <Input
              id="maxAmbientes"
              type="number"
              min="1"
              className="h-9"
              value={form.maxAmbientes}
              onChange={(event) => updateForm(setForm, { maxAmbientes: event.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min dormitorios" htmlFor="minDormitorios">
            <Input
              id="minDormitorios"
              type="number"
              min="1"
              className="h-9"
              value={form.minDormitorios}
              onChange={(event) => updateForm(setForm, { minDormitorios: event.target.value })}
            />
          </Field>
          <Field label="Max dormitorios" htmlFor="maxDormitorios">
            <Input
              id="maxDormitorios"
              type="number"
              min="1"
              className="h-9"
              value={form.maxDormitorios}
              onChange={(event) => updateForm(setForm, { maxDormitorios: event.target.value })}
            />
          </Field>
        </div>
      </FilterSection>

      <FilterSection title="Size and parking" defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min baños" htmlFor="minBathrooms">
            <Input
              id="minBathrooms"
              type="number"
              min="1"
              className="h-9"
              value={form.minBathrooms}
              onChange={(event) => updateForm(setForm, { minBathrooms: event.target.value })}
            />
          </Field>
          <Field label="Min cocheras" htmlFor="minParking">
            <Input
              id="minParking"
              type="number"
              min="0"
              className="h-9"
              value={form.minParking}
              onChange={(event) => updateForm(setForm, { minParking: event.target.value })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Field label="Min m²" htmlFor="minSurfaceM2">
            <Input
              id="minSurfaceM2"
              type="number"
              min="1"
              className="h-9"
              value={form.minSurfaceM2}
              onChange={(event) => updateForm(setForm, { minSurfaceM2: event.target.value })}
            />
          </Field>
          <Field label="Max m²" htmlFor="maxSurfaceM2">
            <Input
              id="maxSurfaceM2"
              type="number"
              min="1"
              className="h-9"
              value={form.maxSurfaceM2}
              onChange={(event) => updateForm(setForm, { maxSurfaceM2: event.target.value })}
            />
          </Field>
          <Field label="Type" htmlFor="surfaceType">
            <select
              id="surfaceType"
              className="h-9 rounded-md border bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.surfaceType}
              onChange={(event) => updateForm(setForm, { surfaceType: event.target.value as FormState["surfaceType"] })}
            >
              <option value="total">Total</option>
              <option value="covered">Covered</option>
            </select>
          </Field>
        </div>
      </FilterSection>

      {form.provider === "zonaprop" ? <ZonapropFilterFields form={form} setForm={setForm} /> : null}
      {form.provider === "argenprop" ? <ArgenpropFilterFields form={form} setForm={setForm} /> : null}
    </div>
  );
}

function ZonapropFilterFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  return (
    <FilterSection title="Zonaprop filters" defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Advertiser" htmlFor="advertiserType">
            <select
              id="advertiserType"
              className="h-9 w-full rounded-md border bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.advertiserType}
              onChange={(event) => updateForm(setForm, { advertiserType: event.target.value as FormState["advertiserType"] })}
            >
              <option value="all">All</option>
              <option value="agency">Inmobiliaria</option>
              <option value="owner">Dueño directo</option>
            </select>
          </Field>
          <Field label="Published" htmlFor="publicationDate">
            <select
              id="publicationDate"
              className="h-9 w-full rounded-md border bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.publicationDate}
              onChange={(event) => updateForm(setForm, { publicationDate: event.target.value as FormState["publicationDate"] })}
            >
              <option value="">Any</option>
              <option value="yesterday">Desde ayer</option>
              <option value="today">Hoy</option>
              <option value="last-week">Última semana</option>
            </select>
          </Field>
        </div>
        <Field label="Age" htmlFor="age">
          <select
            id="age"
            className="h-9 w-full rounded-md border bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={form.age}
            onChange={(event) => updateForm(setForm, { age: event.target.value as FormState["age"] })}
          >
            <option value="">Any</option>
            <option value="under-construction">En construcción</option>
            <option value="new">A estrenar</option>
            <option value="up-to-5-years">Hasta 5 años</option>
          </select>
        </Field>
        <CheckboxGroup title="Subtype" options={ZONAPROP_FILTER_OPTIONS.propertySubtypes} values={form.propertySubtypes} onChange={(propertySubtypes) => updateForm(setForm, { propertySubtypes })} />
        <CheckboxGroup title="Room types" options={ZONAPROP_FILTER_OPTIONS.roomTypes} values={form.roomTypes} onChange={(roomTypes) => updateForm(setForm, { roomTypes })} />
        <CheckboxGroup title="Comforts" options={ZONAPROP_FILTER_OPTIONS.comforts} values={form.comforts} onChange={(comforts) => updateForm(setForm, { comforts })} />
        <CheckboxGroup title="Property features" options={ZONAPROP_FILTER_OPTIONS.propertyFeatures} values={form.propertyFeatures} onChange={(propertyFeatures) => updateForm(setForm, { propertyFeatures })} />
        <CheckboxGroup title="Disposition" options={ZONAPROP_FILTER_OPTIONS.disposition} values={form.disposition} onChange={(disposition) => updateForm(setForm, { disposition })} />
        <CheckboxGroup title="Services" options={ZONAPROP_FILTER_OPTIONS.services} values={form.services} onChange={(services) => updateForm(setForm, { services })} />
        <CheckboxGroup title="Media" options={ZONAPROP_FILTER_OPTIONS.media} values={form.media} onChange={(media) => updateForm(setForm, { media })} />
    </FilterSection>
  );
}

function ArgenpropFilterFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  return (
    <FilterSection title="Argenprop filters" defaultOpen>
        <CheckboxGroup
          title="Servicios generales"
          options={ARGENPROP_FILTER_OPTIONS.generalServices}
          values={form.argenpropGeneralServices}
          onChange={(argenpropGeneralServices) => updateForm(setForm, { argenpropGeneralServices })}
        />
    </FilterSection>
  );
}

function AirbnbFilterFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  return (
    <div className="space-y-3">
      <FilterSection title="Stay dates" defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Check-in" htmlFor="checkIn">
            <Input
              id="checkIn"
              type="date"
              className="h-9"
              value={form.checkIn}
              onChange={(event) => updateForm(setForm, { checkIn: event.target.value })}
            />
          </Field>
          <Field label="Check-out" htmlFor="checkOut">
            <Input
              id="checkOut"
              type="date"
              className="h-9"
              value={form.checkOut}
              onChange={(event) => updateForm(setForm, { checkOut: event.target.value })}
            />
          </Field>
        </div>
      </FilterSection>

      <FilterSection title="Guests">
        <div className="grid grid-cols-4 gap-2">
          <Field label="Adults" htmlFor="adults">
            <Input id="adults" type="number" min="1" className="h-9" value={form.adults} onChange={(event) => updateForm(setForm, { adults: event.target.value })} />
          </Field>
          <Field label="Children" htmlFor="children">
            <Input id="children" type="number" min="0" className="h-9" value={form.children} onChange={(event) => updateForm(setForm, { children: event.target.value })} />
          </Field>
          <Field label="Infants" htmlFor="infants">
            <Input id="infants" type="number" min="0" className="h-9" value={form.infants} onChange={(event) => updateForm(setForm, { infants: event.target.value })} />
          </Field>
          <Field label="Pets" htmlFor="pets">
            <Input id="pets" type="number" min="0" className="h-9" value={form.pets} onChange={(event) => updateForm(setForm, { pets: event.target.value })} />
          </Field>
        </div>
      </FilterSection>

      <FilterSection title="Rooms">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Bedrooms" htmlFor="minBedrooms">
            <Input id="minBedrooms" type="number" min="1" className="h-9" value={form.minBedrooms} onChange={(event) => updateForm(setForm, { minBedrooms: event.target.value })} />
          </Field>
          <Field label="Beds" htmlFor="minBeds">
            <Input id="minBeds" type="number" min="1" className="h-9" value={form.minBeds} onChange={(event) => updateForm(setForm, { minBeds: event.target.value })} />
          </Field>
          <Field label="Bathrooms" htmlFor="minAirbnbBathrooms">
            <Input id="minAirbnbBathrooms" type="number" min="1" className="h-9" value={form.minAirbnbBathrooms} onChange={(event) => updateForm(setForm, { minAirbnbBathrooms: event.target.value })} />
          </Field>
        </div>
      </FilterSection>

      <FilterSection title="Airbnb filters" defaultOpen>
        <CheckboxGroup title="Default in-unit search" options={AIRBNB_FILTER_OPTIONS.roomTypes} values={form.airbnbRoomTypes} onChange={(airbnbRoomTypes) => updateForm(setForm, { airbnbRoomTypes })} />
        <CheckboxGroup title="Amenities" options={AIRBNB_FILTER_OPTIONS.amenities} values={form.airbnbAmenityIds} onChange={(airbnbAmenityIds) => updateForm(setForm, { airbnbAmenityIds })} />
      </FilterSection>
    </div>
  );
}

function CheckboxGroup({
  title,
  options,
  values,
  onChange,
}: {
  title: string;
  options: FilterOption[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const selected = new Set(values);
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase text-muted-foreground">{title}</div>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((option) => (
          <label key={option.value} className="flex min-h-8 items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-xs">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={selected.has(option.value)}
              onChange={(event) => {
                if (event.target.checked) onChange([...values, option.value]);
                else onChange(values.filter((value) => value !== option.value));
              }}
            />
            <span className="min-w-0 truncate" title={option.label}>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function FilterSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="rounded-md border bg-card p-3" open={defaultOpen}>
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

function ActiveFilterSummary({ form }: { form: FormState }) {
  const chips = activeFilterChips(form);
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase text-muted-foreground">Active filters</div>
        <Badge variant="outline" className="text-[11px]">{chips.length}</Badge>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.length ? (
          chips.map((chip) => (
            <Badge key={chip} variant="secondary" className="max-w-full truncate text-[11px]">
              {chip}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">No active filters</span>
        )}
      </div>
    </div>
  );
}

function activeFilterChips(form: FormState): string[] {
  const neighborhoods = supportedNeighborhoodOptions();
  const chips = [
    providerLabel(form.provider),
    ...form.neighborhoods.map((key) => neighborhoods.find((option) => option.key === key)?.label || key),
    form.minPriceUsd ? `Min $${form.minPriceUsd}` : "",
    form.maxPriceUsd ? `Max $${form.maxPriceUsd}` : "",
    form.furnished ? "Furnished" : "",
  ];

  if (form.provider === "airbnb") {
    chips.push(
      form.checkIn ? `Check-in ${form.checkIn}` : "",
      form.checkOut ? `Check-out ${form.checkOut}` : "",
      form.adults ? `${form.adults} adult${form.adults === "1" ? "" : "s"}` : "",
      form.children ? `${form.children} children` : "",
      form.pets ? `${form.pets} pets` : "",
      ...labelsForValues(AIRBNB_FILTER_OPTIONS.roomTypes, form.airbnbRoomTypes),
      ...labelsForValues(AIRBNB_FILTER_OPTIONS.amenities, form.airbnbAmenityIds),
      form.minBedrooms ? `${form.minBedrooms}+ bedrooms` : "",
      form.minBeds ? `${form.minBeds}+ beds` : "",
      form.minAirbnbBathrooms ? `${form.minAirbnbBathrooms}+ baths` : "",
    );
    return chips.filter(Boolean);
  }

  chips.push(
    form.minAmbientes ? `${form.minAmbientes}+ amb` : "",
    form.maxAmbientes ? `Max ${form.maxAmbientes} amb` : "",
    form.minDormitorios ? `${form.minDormitorios}+ dorm` : "",
    form.maxDormitorios ? `Max ${form.maxDormitorios} dorm` : "",
    form.minBathrooms ? `${form.minBathrooms}+ baths` : "",
    form.minParking ? `${form.minParking}+ parking` : "",
    form.minSurfaceM2 ? `${form.minSurfaceM2}+ m²` : "",
    form.maxSurfaceM2 ? `Max ${form.maxSurfaceM2} m²` : "",
  );

  if (form.provider === "argenprop") {
    chips.push(...labelsForValues(ARGENPROP_FILTER_OPTIONS.generalServices, form.argenpropGeneralServices));
  } else {
    chips.push(
      form.advertiserType !== "all" ? (form.advertiserType === "owner" ? "Dueño directo" : "Inmobiliaria") : "",
      form.publicationDate ? `Published ${form.publicationDate}` : "",
      form.age ? ageLabel(form.age) : "",
      ...labelsForValues(ZONAPROP_FILTER_OPTIONS.propertySubtypes, form.propertySubtypes),
      ...labelsForValues(ZONAPROP_FILTER_OPTIONS.roomTypes, form.roomTypes),
      ...labelsForValues(ZONAPROP_FILTER_OPTIONS.comforts, form.comforts),
      ...labelsForValues(ZONAPROP_FILTER_OPTIONS.propertyFeatures, form.propertyFeatures),
      ...labelsForValues(ZONAPROP_FILTER_OPTIONS.disposition, form.disposition),
      ...labelsForValues(ZONAPROP_FILTER_OPTIONS.services, form.services),
      ...labelsForValues(ZONAPROP_FILTER_OPTIONS.media, form.media),
    );
  }

  return chips.filter(Boolean);
}

function labelsForValues(options: FilterOption[], values: string[]): string[] {
  return values.map((value) => options.find((option) => option.value === value)?.label || value);
}

function providerLabel(provider: FormState["provider"]): string {
  if (provider === "zonaprop") return "Zonaprop";
  if (provider === "argenprop") return "Argenprop";
  return "Airbnb";
}

function ageLabel(age: Exclude<FormState["age"], "">): string {
  if (age === "under-construction") return "En construcción";
  if (age === "new") return "A estrenar";
  return "Hasta 5 años";
}

function ResultsPanel({
  result,
  error,
  pending,
  loadingStage,
  filter,
  sort,
  onFilterChange,
  onSortChange,
  onOpenLightbox,
  onFeedback,
}: {
  result?: SearchUiResult;
  error: Error | null;
  pending: boolean;
  loadingStage: { title: string; label: string };
  filter: ResultFilter;
  sort: ResultSort;
  onFilterChange: (filter: ResultFilter) => void;
  onSortChange: (sort: ResultSort) => void;
  onOpenLightbox: (images: string[], index: number, title: string) => void;
  onFeedback: (item: SearchUiResult["items"][number], expectedLocation: "IN_UNIT" | "SHARED_BUILDING" | "UNKNOWN" | "CONFLICTING") => void;
}) {
  if (pending && !result) {
    return (
      <LoadingProgressCard loadingStage={loadingStage} />
    );
  }

  if (error) {
    return (
      <StateCard
        icon={<AlertCircle className="h-5 w-5 text-destructive" />}
        title="Search failed"
        text={error.message}
      />
    );
  }

  if (!result) {
    return (
      <StateCard
        icon={<Building2 className="h-5 w-5" />}
        title="Ready"
        text="Build a search from filters or paste a search URL, then scan for apartments with an in-unit washer."
      />
    );
  }

  const filteredItems = sortResultItems(result.items.filter((item) => matchesResultFilter(item, filter)), sort);

  return (
    <div className="space-y-3">
      {pending ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{loadingStage.title}: {loadingStage.label}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <ResultFilterTabs result={result} value={filter} onChange={onFilterChange} />
        <ResultSortSelect value={sort} onChange={onSortChange} />
        {result.warnings.map((warning) => (
          <Badge key={warning} variant="outline" className="max-w-full truncate text-muted-foreground">
            {warning}
          </Badge>
        ))}
        {result.ignored.map((item) => (
          <Badge key={item} variant="outline" className="text-muted-foreground">
            {item} ignored
          </Badge>
        ))}
      </div>

      <div className="space-y-3">
        {filteredItems.length ? (
          filteredItems.map((item, index) => (
            <ListingResult
              key={item.listingUrl}
              item={item}
              index={index + 1}
              onOpenLightbox={onOpenLightbox}
              onFeedback={onFeedback}
            />
          ))
        ) : (
          <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
            No listings match this view.
          </div>
        )}
      </div>
    </div>
  );
}

function ResultSortSelect({
  value,
  onChange,
}: {
  value: ResultSort;
  onChange: (sort: ResultSort) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Sort
      <select
        className="h-8 rounded-md border bg-card px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        onChange={(event) => onChange(event.target.value as ResultSort)}
      >
        <option value="SCAN_ORDER">Scan order</option>
        <option value="PRICE_ASC">Lowest price</option>
        <option value="PRICE_DESC">Highest price</option>
      </select>
    </label>
  );
}

function ResultFilterTabs({
  result,
  value,
  onChange,
}: {
  result: SearchUiResult;
  value: ResultFilter;
  onChange: (filter: ResultFilter) => void;
}) {
  const counts = React.useMemo(() => countResultFilters(result.items), [result.items]);
  const options: Array<{ value: ResultFilter; label: string; count: number }> = [
    { value: "ALL", label: "All", count: result.items.length },
    { value: "MATCH", label: "Matches", count: counts.MATCH },
    { value: "NO_MATCH", label: "No match", count: counts.NO_MATCH },
    { value: "REVIEW", label: "Review", count: counts.REVIEW },
  ];

  return (
    <div className="flex rounded-md bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={[
            "rounded px-2.5 py-1 text-xs font-medium",
            value === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
          onClick={() => onChange(option.value)}
        >
          {option.label} {option.count}
        </button>
      ))}
    </div>
  );
}

function ResultSummary({ result }: { result: SearchUiResult }) {
  return (
    <div className="hidden shrink-0 items-center gap-2 md:flex">
      <SummaryPill label="Provider" value={result.provider} />
      <SummaryPill label="Listings" value={String(result.listingCount)} />
      <SummaryPill label="Pages" value={String(result.pageUrls.length)} />
      <SummaryPill label="Matches" value={String(result.matchCount)} />
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5">
      <div className="text-[10px] font-medium uppercase leading-none text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold leading-none">{value}</div>
    </div>
  );
}

function ListingResult({
  item,
  index,
  onOpenLightbox,
  onFeedback,
}: {
  item: SearchUiResult["items"][number];
  index: number;
  onOpenLightbox: (images: string[], index: number, title: string) => void;
  onFeedback: (item: SearchUiResult["items"][number], expectedLocation: "IN_UNIT" | "SHARED_BUILDING" | "UNKNOWN" | "CONFLICTING") => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const listing = describeListingUrl(item.listingUrl, item.title);
  const decision = item.failed ? "FAILED" : item.decision || "UNKNOWN";
  const reason = item.rejectionReason ? formatRejectionReason(item.rejectionReason) : "";
  const decisionText = formatDecision(decision);

  return (
    <Card
      className="result-enter overflow-hidden shadow-none transition-colors hover:border-ring/60"
      style={{ animationDelay: `${Math.min(index - 1, 8) * 35}ms` }}
    >
      <button
        type="button"
        className="grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 p-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setExpanded((current) => !current)}
      >
        <div className="font-mono text-xs text-muted-foreground">{index}</div>
        <div className="min-w-0">
          <div className="mb-1 text-xs font-semibold text-foreground">{decisionText}</div>
          <div className="truncate font-medium" title={listing.title}>{listing.title}</div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-muted-foreground/90">{listing.id || listing.host}</span>
            {formatPrice(item) ? <span>{formatPrice(item)}</span> : null}
            {item.neighborhood ? <span>{item.neighborhood}</span> : null}
            {formatArea(item) ? <span>{formatArea(item)}</span> : null}
            {formatRooms(item) ? <span>{formatRooms(item)}</span> : null}
            <span>{item.imageCount ?? item.imageUrls.length}/{item.galleryCount ?? "?"} photos</span>
            {item.source ? <span>{item.source}</span> : null}
            {!item.inUnitMatch && reason ? <span>{reason}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={item.inUnitMatch ? "default" : item.failed ? "destructive" : "outline"}>
            {decisionText}
          </Badge>
          {item.confidence ? <Badge variant="secondary">{formatConfidence(item.confidence)}</Badge> : null}
        </div>
      </button>

      {expanded ? (
        <CardContent className="space-y-4 border-t p-3">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="h-8 px-2.5">
              <a href={item.listingUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Open listing
              </a>
            </Button>
            {formatPrice(item) ? <Badge variant="outline">{formatPrice(item)}</Badge> : null}
            {item.neighborhood ? <Badge variant="outline">{item.neighborhood}</Badge> : null}
            {formatArea(item) ? <Badge variant="outline">{formatArea(item)}</Badge> : null}
            {formatRooms(item) ? <Badge variant="outline">{formatRooms(item)}</Badge> : null}
            {typeof item.bathrooms === "number" ? <Badge variant="outline">{item.bathrooms} baño{item.bathrooms === 1 ? "" : "s"}</Badge> : null}
            {typeof item.ageYears === "number" ? <Badge variant="outline">{item.ageYears} años</Badge> : null}
            {item.amenity ? <Badge variant="outline">{item.amenity}</Badge> : null}
            <Badge variant="outline">{item.imageCount ?? item.imageUrls.length} Photos</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
            <span className="text-xs font-medium text-muted-foreground">Mark correct label</span>
            {(["IN_UNIT", "SHARED_BUILDING", "UNKNOWN"] as const).map((label) => (
              <Button
                key={label}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onFeedback(item, label)}
              >
                {formatDecision(label)}
              </Button>
            ))}
          </div>

          {item.description ? (
            <p className="max-w-4xl text-sm leading-6 text-muted-foreground">{item.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No description extracted for this listing.</p>
          )}

          {item.error ? <div className="rounded-md bg-muted p-3 text-sm text-destructive">{item.error}</div> : null}

          {item.features.length || item.amenities.length ? (
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Listing details</summary>
              {item.features.length ? (
                <div className="mt-3 space-y-2">
                  <div className="text-xs font-medium uppercase text-muted-foreground">Property Features</div>
                  <div className="flex flex-wrap gap-2">
                    {item.features.map((feature) => (
                      <Badge key={`${item.listingUrl}-${feature}`} variant="outline">{feature}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {item.amenities.length ? (
                <div className="mt-3 space-y-3">
                  <div className="text-xs font-medium uppercase text-muted-foreground">Amenities</div>
                  {item.amenities.map((group) => (
                    <div key={`${item.listingUrl}-${group.group}`} className="space-y-1.5">
                      <div className="text-sm font-medium">{group.group}</div>
                      <div className="flex flex-wrap gap-2">
                        {group.items.map((amenity) => (
                          <Badge key={`${item.listingUrl}-${group.group}-${amenity}`} variant="secondary">{amenity}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </details>
          ) : null}

          {item.evidence.length ? (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase text-muted-foreground">Washer Evidence</div>
              <div className="grid gap-2 md:grid-cols-2">
                {item.evidence.map((evidence) => (
                  <a
                    key={`${item.listingUrl}-${evidence.photo}-${evidence.imageUrl}`}
                    href={evidence.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border p-3 text-sm hover:bg-muted"
                  >
                    <div className="font-medium">Photo {typeof evidence.photo === "number" ? evidence.photo + 1 : "?"}: {evidence.label || "UNKNOWN"}</div>
                    <div className="text-muted-foreground">
                      {typeof evidence.confidence === "number" ? evidence.confidence.toFixed(2) : "no confidence"}
                      {evidence.washer ? " washer visible" : ""}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {item.imageUrls.length ? (
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase text-muted-foreground">Listing Photos</div>
              <div className="grid grid-cols-3 gap-2 md:grid-cols-5 xl:grid-cols-6">
                {item.imageUrls.map((url, photoIndex) => (
                  <button
                    key={`${item.listingUrl}-${url}`}
                    type="button"
                    aria-label={`Open photo ${photoIndex + 1}`}
                    onClick={() => onOpenLightbox(item.imageUrls, photoIndex, listing.title)}
                    className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
                  >
                    <img src={url} alt={`${listing.title} photo ${photoIndex + 1}`} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                    <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">
                      {photoIndex + 1}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function matchesResultFilter(item: SearchUiResult["items"][number], filter: ResultFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "MATCH") return item.inUnitMatch;
  if (filter === "REVIEW") return item.failed || item.decision === "CONFLICTING";
  return !item.inUnitMatch && !item.failed && item.decision !== "CONFLICTING";
}

function formatRooms(item: SearchUiResult["items"][number]): string {
  return [
    typeof item.ambientes === "number" ? `${item.ambientes} amb` : "",
    typeof item.dormitorios === "number" ? `${item.dormitorios} dorm` : "",
  ].filter(Boolean).join(" · ");
}

function formatPrice(item: SearchUiResult["items"][number]): string {
  return [
    item.price || "",
    item.expenses ? `expensas ${item.expenses}` : "",
  ].filter(Boolean).join(" + ");
}

function sortResultItems(items: SearchUiResult["items"], sort: ResultSort): SearchUiResult["items"] {
  if (sort === "SCAN_ORDER") return items;
  const missingValue = sort === "PRICE_ASC" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const direction = sort === "PRICE_ASC" ? 1 : -1;
  return [...items].sort((a, b) => {
    const aPrice = a.priceAmountUsd ?? missingValue;
    const bPrice = b.priceAmountUsd ?? missingValue;
    return (aPrice - bPrice) * direction;
  });
}

function formatDecision(decision: string): string {
  if (decision === "IN_UNIT") return "In-unit washer";
  if (decision === "SHARED_BUILDING") return "No in-unit washer";
  if (decision === "CONFLICTING") return "Needs review";
  if (decision === "FAILED") return "Scan failed";
  return "No in-unit evidence";
}

function formatRejectionReason(reason: string): string {
  if (reason === "shared_building_only") return "shared laundry only";
  if (reason === "no_in_unit_evidence") return "no in-unit evidence";
  if (reason === "insufficient_evidence") return "insufficient evidence";
  if (reason === "conflicting_evidence") return "conflicting evidence";
  return reason.replace(/_/g, " ");
}

function formatConfidence(confidence: string): string {
  if (confidence === "high") return "High confidence";
  if (confidence === "medium") return "Medium confidence";
  if (confidence === "low") return "Low confidence";
  return confidence;
}

function formatArea(item: SearchUiResult["items"][number]): string {
  return [
    typeof item.totalAreaM2 === "number" ? `${item.totalAreaM2} m² tot` : "",
    typeof item.coveredAreaM2 === "number" ? `${item.coveredAreaM2} m² cub` : "",
  ].filter(Boolean).join(" · ");
}

function countResultFilters(items: SearchUiResult["items"]): Record<ResultFilter, number> {
  const counts: Record<ResultFilter, number> = {
    ALL: items.length,
    MATCH: 0,
    NO_MATCH: 0,
    REVIEW: 0,
  };
  for (const item of items) {
    if (item.inUnitMatch) counts.MATCH += 1;
    else if (item.failed || item.decision === "CONFLICTING") counts.REVIEW += 1;
    else counts.NO_MATCH += 1;
  }
  return counts;
}

function useLoadingStage(active: boolean, job?: SearchScanJob): { title: string; label: string } {
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);

  React.useEffect(() => {
    if (!active) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => window.clearInterval(interval);
  }, [active]);

  const index = elapsedSeconds < 2
    ? 0
    : elapsedSeconds < 6
      ? 1
      : elapsedSeconds < 14
        ? 2
        : elapsedSeconds < 28
          ? 3
          : 4;

  if (job?.status === "running" && job.totalListings > 0) {
    if (job.completedListings === 0) {
      return {
        title: "Scanning listings",
        label: `Checking ${job.totalListings} listings. Results will appear as each one finishes.`,
      };
    }

    return {
      title: "Scanning listings",
      label: `${job.completedListings} of ${job.totalListings} listings checked. More results will appear as they finish.`,
    };
  }

  return {
    title: active ? "Working" : "Ready",
    label: job?.stage || LOADING_STAGES[index],
  };
}

function ImageLightbox({
  images,
  index,
  title,
  onChangeIndex,
  onClose,
}: {
  images: string[];
  index: number;
  title: string;
  onChangeIndex: (index: number) => void;
  onClose: () => void;
}) {
  const activeIndex = Math.min(Math.max(index, 0), images.length - 1);
  const activeImage = images[activeIndex];

  const goTo = React.useCallback((nextIndex: number) => {
    if (images.length === 0) return;
    onChangeIndex((nextIndex + images.length) % images.length);
  }, [images.length, onChangeIndex]);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") goTo(activeIndex - 1);
      if (event.key === "ArrowRight") goTo(activeIndex + 1);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, goTo, onClose]);

  if (!activeImage) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 p-3 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} photo viewer`}
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="text-xs text-white/70">Photo {activeIndex + 1} of {images.length}</div>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
          Close
        </Button>
      </div>

      <div className="relative min-h-0 flex-1" onClick={(event) => event.stopPropagation()}>
        <img
          src={activeImage}
          alt={`${title} photo ${activeIndex + 1}`}
          className="h-full w-full object-contain"
        />
        {images.length > 1 ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute left-3 top-1/2 -translate-y-1/2"
              aria-label="Previous photo"
              onClick={() => goTo(activeIndex - 1)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-3 top-1/2 -translate-y-1/2"
              aria-label="Next photo"
              onClick={() => goTo(activeIndex + 1)}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="mt-3 shrink-0 overflow-x-auto pb-1" onClick={(event) => event.stopPropagation()}>
          <div className="mx-auto flex w-max gap-2">
            {images.map((url, photoIndex) => (
              <button
                key={`${url}-${photoIndex}`}
                type="button"
                className={[
                  "h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-white/10",
                  photoIndex === activeIndex ? "border-white" : "border-white/20 opacity-70 hover:opacity-100",
                ].join(" ")}
                aria-label={`Show photo ${photoIndex + 1}`}
                onClick={() => onChangeIndex(photoIndex)}
              >
                <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function NeighborhoodTypeahead({
  options,
  selectedKeys,
  onChange,
}: {
  options: SupportedNeighborhood[];
  selectedKeys: string[];
  onChange: (selectedKeys: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = selectedKeys
    .map((key) => options.find((option) => option.key === key))
    .filter((option): option is SupportedNeighborhood => Boolean(option));
  const preferredOptions = query.trim()
    ? options
    : [
      ...COMMON_NEIGHBORHOOD_KEYS
        .map((key) => options.find((option) => option.key === key))
        .filter((option): option is SupportedNeighborhood => Boolean(option)),
      ...options,
    ];
  const filtered = dedupeNeighborhoods(preferredOptions)
    .filter((option) => !selectedKeys.includes(option.key))
    .filter((option) => matchesNeighborhood(option, query))
    .slice(0, 8);
  const showOptions = open || Boolean(query.trim());

  function addNeighborhood(key: string) {
    onChange([...selectedKeys, key]);
    setQuery("");
    setOpen(true);
  }

  function removeNeighborhood(key: string) {
    onChange(selectedKeys.filter((selectedKey) => selectedKey !== key));
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="neighborhood-typeahead">Neighborhoods</Label>
        <Badge variant="outline" className="text-[11px]">{selectedKeys.length} selected</Badge>
      </div>

      <div className="relative">
        <div className="rounded-md border bg-card px-2 py-1.5">
        <div className="flex min-h-9 flex-wrap items-center gap-1.5">
          {selected.map((neighborhood) => (
            <Badge key={neighborhood.key} variant="secondary" className="gap-1 py-0.5 text-[11px]">
              {neighborhood.label}
              <button
                type="button"
                className="rounded-sm outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remove ${neighborhood.label}`}
                onClick={() => removeNeighborhood(neighborhood.key)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <input
            id="neighborhood-typeahead"
            value={query}
            placeholder={selected.length ? "Add another..." : "Type a neighborhood..."}
            className="min-w-32 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && filtered[0]) {
                event.preventDefault();
                addNeighborhood(filtered[0].key);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                setQuery("");
              }
              if (event.key === "Backspace" && query === "" && selectedKeys.length > 0) {
                removeNeighborhood(selectedKeys[selectedKeys.length - 1]);
              }
            }}
          />
        </div>
        </div>

        {showOptions ? (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-md border bg-card p-1 shadow-lg">
            {filtered.length ? (
              filtered.map((neighborhood) => (
                <button
                  key={neighborhood.key}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => addNeighborhood(neighborhood.key)}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <span>
                    <span className="font-medium">{neighborhood.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{neighborhood.group}</span>
                  </span>
                  <Plus className="h-4 w-4 text-muted-foreground" />
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                {query ? "No matching neighborhoods" : "All listed neighborhoods are selected"}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function dedupeNeighborhoods(options: SupportedNeighborhood[]): SupportedNeighborhood[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.key)) return false;
    seen.add(option.key);
    return true;
  });
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      onClick={onClick}
      className="h-8 text-sm"
    >
      {children}
    </Button>
  );
}

function matchesNeighborhood(option: SupportedNeighborhood, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return [
    option.label,
    option.key,
    option.group,
  ].some((value) => normalizeSearchText(value).includes(normalizedQuery));
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function describeListingUrl(url: string, title?: string): { host: string; id: string; path: string; title: string } {
  try {
    const parsed = new URL(url);
    const finalSegment = parsed.pathname.split("/").filter(Boolean).at(-1) || parsed.hostname;
    const withoutExtension = finalSegment.replace(/\.html$/, "");
    const idMatch = withoutExtension.match(/(?:--|-)(\d{6,})$/);
    const id = idMatch?.[1] || "";
    const slug = id ? withoutExtension.slice(0, -id.length).replace(/-+$/, "") : withoutExtension;
    return {
      host: parsed.hostname.replace(/^www\./, ""),
      id,
      path: parsed.pathname,
      title: title || titleFromSlug(slug),
    };
  } catch {
    return {
      host: "",
      id: "",
      path: url,
      title: title || url,
    };
  }
}

function titleFromSlug(value: string): string {
  const cleaned = value
    .replace(/^(teclapin|teclappa)-/, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Listing";
  return cleaned
    .split(" ")
    .map((word) => {
      if (/^(av|avda|rbb)$/i.test(word)) return word.toUpperCase();
      if (/^\d+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function StateCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Card className="h-full min-h-[320px] border-0 shadow-none">
      <CardContent className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 p-5 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-card">{icon}</div>
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-1 max-w-md text-sm text-muted-foreground">{text}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingProgressCard({ loadingStage }: { loadingStage: { title: string; label: string } }) {
  const steps = [
    "Build search URL",
    "Fetch result pages",
    "Extract listing media",
    "Classify washer evidence",
    "Render results",
  ];
  const label = loadingStage.label.toLowerCase();
  const currentIndex = loadingStage.title === "Scanning listings" ? 3
    : label.includes("finding") || label.includes("result pages") ? 1
      : label.includes("extract") || label.includes("photos") ? 2
        : label.includes("washer") || label.includes("checking") ? 3
          : label.includes("ranking") || label.includes("render") ? 4
            : 0;

  return (
    <Card className="h-full min-h-[320px] border-0 shadow-none">
      <CardContent className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 p-5 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-card">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
        <div>
          <div className="font-semibold">{loadingStage.title}</div>
          <div className="mt-1 max-w-md text-sm text-muted-foreground">{loadingStage.label}</div>
        </div>
        <div className="grid w-full max-w-xl gap-2 text-left">
          {steps.map((step, index) => (
            <div key={step} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs">
              <span className={[
                "h-2 w-2 rounded-full",
                index <= currentIndex ? "bg-foreground" : "bg-muted",
              ].join(" ")} />
              <span className={index === currentIndex ? "font-medium text-foreground" : "text-muted-foreground"}>{step}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function updateForm(
  setForm: React.Dispatch<React.SetStateAction<FormState>>,
  patch: Partial<FormState>,
) {
  setForm((current) => ({ ...current, ...patch }));
}

function isResultFilter(value: string | null): value is ResultFilter {
  return value === "ALL" || value === "MATCH" || value === "NO_MATCH" || value === "REVIEW";
}

function readStoredResultFilter(fallback: ResultFilter = "ALL"): ResultFilter {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(RESULT_FILTER_STORAGE_KEY);
  return isResultFilter(stored) ? stored : fallback;
}

function readStoredForm(fallback: FormState = defaultForm): FormState {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FORM_STORAGE_KEY) || "null") as Partial<FormState> | null;
    return normalizeStoredForm(parsed, fallback);
  } catch {
    return fallback;
  }
}

function normalizeStoredForm(value: Partial<FormState> | null, fallback: FormState = defaultForm): FormState {
  if (!value || typeof value !== "object") return fallback;
  return {
    ...fallback,
    ...value,
    mode: value.mode === "url" ? "url" : "filters",
    provider: value.provider === "argenprop" || value.provider === "airbnb" ? value.provider : "zonaprop",
    neighborhoods: Array.isArray(value.neighborhoods)
      ? value.neighborhoods.filter((item) => typeof item === "string")
      : fallback.neighborhoods,
    propertySubtypes: normalizeStringArray(value.propertySubtypes),
    roomTypes: normalizeStringArray(value.roomTypes),
    comforts: normalizeStringArray(value.comforts),
    propertyFeatures: normalizeStringArray(value.propertyFeatures),
    disposition: normalizeStringArray(value.disposition),
    services: normalizeStringArray(value.services),
    media: normalizeStringArray(value.media),
    argenpropGeneralServices: normalizeStringArray(value.argenpropGeneralServices, fallback.argenpropGeneralServices),
    airbnbRoomTypes: normalizeStringArray(value.airbnbRoomTypes, fallback.airbnbRoomTypes),
    airbnbAmenityIds: normalizeStringArray(value.airbnbAmenityIds, fallback.airbnbAmenityIds),
  };
}

function normalizeStringArray(value: unknown, fallback: string[] = []): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

function parseCookieHeader(header: string): Record<string, string> {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");
        if (separatorIndex === -1) return [part, ""];
        return [part.slice(0, separatorIndex), part.slice(separatorIndex + 1)];
      }),
  );
}

function readInitialPreferencesFromCookieHeader(cookieHeader: string): { form: FormState; resultFilter: ResultFilter } {
  const cookies = parseCookieHeader(cookieHeader);
  let form = defaultForm;
  let resultFilter: ResultFilter = "ALL";

  try {
    const rawForm = cookies[FORM_COOKIE_KEY] ? decodeURIComponent(cookies[FORM_COOKIE_KEY]) : "";
    form = normalizeStoredForm(JSON.parse(rawForm || "null") as Partial<FormState> | null);
  } catch {
    form = defaultForm;
  }

  try {
    const rawFilter = cookies[RESULT_FILTER_COOKIE_KEY] ? decodeURIComponent(cookies[RESULT_FILTER_COOKIE_KEY]) : "";
    resultFilter = isResultFilter(rawFilter) ? rawFilter : "ALL";
  } catch {
    resultFilter = "ALL";
  }

  return { form, resultFilter };
}

function writePreferenceCookie(name: string, value: string) {
  document.cookie = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${PREFERENCE_COOKIE_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
  ].join("; ");
}

function toSearchPayload(form: FormState) {
  const payload = {
    mode: form.mode,
    searchUrl: form.searchUrl,
    provider: form.provider,
    neighborhoods: form.neighborhoods,
    minPriceUsd: optionalNumber(form.minPriceUsd),
    maxPriceUsd: optionalNumber(form.maxPriceUsd),
    furnished: form.furnished,
    maxListings: optionalNumber(form.maxListings) ?? 20,
    maxPages: optionalNumber(form.maxPages) ?? 3,
  };

  if (form.provider === "airbnb") {
    return {
      ...payload,
      checkIn: form.checkIn || undefined,
      checkOut: form.checkOut || undefined,
      adults: optionalNumber(form.adults),
      children: optionalNumber(form.children),
      infants: optionalNumber(form.infants),
      pets: optionalNumber(form.pets),
      airbnbRoomTypes: form.airbnbRoomTypes,
      airbnbAmenityIds: form.airbnbAmenityIds,
      minBedrooms: optionalNumber(form.minBedrooms),
      minBeds: optionalNumber(form.minBeds),
      minAirbnbBathrooms: optionalNumber(form.minAirbnbBathrooms),
    };
  }

  const portalPayload = {
    ...payload,
    minSurfaceM2: optionalNumber(form.minSurfaceM2),
    maxSurfaceM2: optionalNumber(form.maxSurfaceM2),
    surfaceType: form.surfaceType,
    minBathrooms: optionalNumber(form.minBathrooms),
    minParking: optionalNumber(form.minParking),
    minAmbientes: optionalNumber(form.minAmbientes),
    maxAmbientes: optionalNumber(form.maxAmbientes),
    minDormitorios: optionalNumber(form.minDormitorios),
    maxDormitorios: optionalNumber(form.maxDormitorios),
  };

  if (form.provider === "argenprop") {
    return {
      ...portalPayload,
      argenpropGeneralServices: form.argenpropGeneralServices,
    };
  }

  return {
    ...portalPayload,
    propertySubtypes: form.propertySubtypes,
    advertiserType: form.advertiserType,
    publicationDate: form.publicationDate || undefined,
    age: form.age || undefined,
    roomTypes: form.roomTypes,
    comforts: form.comforts,
    propertyFeatures: form.propertyFeatures,
    disposition: form.disposition,
    services: form.services,
    media: form.media,
  };
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
