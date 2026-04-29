import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { runSearch, type SearchUiResult } from "@/web/search.functions";
import { DEFAULT_ESCALATION_MODEL, DEFAULT_MAX_IMAGES, DEFAULT_MODEL } from "@/cli/args";
import { supportedNeighborhoodOptions, type SupportedNeighborhood } from "@/core/search-url-builder";

export const Route = createFileRoute("/")({
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

type FormState = {
  mode: "filters" | "url";
  provider: "zonaprop" | "argenprop" | "airbnb";
  searchUrl: string;
  neighborhoods: string[];
  minPriceUsd: string;
  maxPriceUsd: string;
  minAmbientes: string;
  maxAmbientes: string;
  minDormitorios: string;
  maxDormitorios: string;
  checkIn: string;
  checkOut: string;
  discoverOnly: boolean;
  includeAll: boolean;
  maxListings: string;
  maxPages: string;
  maxImages: string;
  model: string;
  escalationModel: string;
};

const defaultForm: FormState = {
  mode: "filters",
  provider: "zonaprop",
  searchUrl: "",
  neighborhoods: ["nunez", "las-canitas"],
  minPriceUsd: "",
  maxPriceUsd: "1500",
  minAmbientes: "",
  maxAmbientes: "",
  minDormitorios: "",
  maxDormitorios: "",
  checkIn: "2026-06-14",
  checkOut: "2026-08-23",
  discoverOnly: true,
  includeAll: false,
  maxListings: "20",
  maxPages: "3",
  maxImages: String(DEFAULT_MAX_IMAGES),
  model: DEFAULT_MODEL,
  escalationModel: DEFAULT_ESCALATION_MODEL,
};

function HomePage() {
  const runSearchFn = useServerFn(runSearch);
  const [form, setForm] = React.useState<FormState>(defaultForm);

  const searchMutation = useMutation({
    mutationKey: ["search-scan", form.mode, form.provider],
    mutationFn: async (payload: FormState) => runSearchFn({ data: toSearchPayload(payload) }),
  });

  const result = searchMutation.data;

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
                    <FilterFields form={form} setForm={setForm} />
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

                  <div className="grid gap-2 rounded-md border p-3">
                    <ToggleRow
                      id="discoverOnly"
                      checked={form.discoverOnly}
                      label="Discover listings only"
                      onChange={(checked) => updateForm(setForm, { discoverOnly: checked })}
                    />
                    <ToggleRow
                      id="includeAll"
                      checked={form.includeAll}
                      label="Show every scanned listing"
                      onChange={(checked) => updateForm(setForm, { includeAll: checked })}
                    />
                  </div>

                  {!form.discoverOnly ? (
                    <div className="grid gap-2 rounded-md border p-3">
                      <Field label="First-pass model" htmlFor="model">
                        <Input
                          id="model"
                          value={form.model}
                          onChange={(event) => updateForm(setForm, { model: event.target.value })}
                        />
                      </Field>
                      <Field label="Escalation model" htmlFor="escalationModel">
                        <Input
                          id="escalationModel"
                          value={form.escalationModel}
                          onChange={(event) => updateForm(setForm, { escalationModel: event.target.value })}
                        />
                      </Field>
                      <Field label="Max photos per listing" htmlFor="maxImages">
                        <Input
                          id="maxImages"
                          type="number"
                          min="1"
                          value={form.maxImages}
                          onChange={(event) => updateForm(setForm, { maxImages: event.target.value })}
                        />
                      </Field>
                    </div>
                  ) : null}
                </div>

                <div className="sticky bottom-0 mt-auto border-t bg-card pt-3">
                  <Button className="w-full" type="submit" disabled={searchMutation.isPending}>
                    {searchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    {form.discoverOnly ? "Discover listings" : "Scan listings"}
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
                    <p className="text-xs text-muted-foreground">Ready to run discovery</p>
                  )}
                </div>
                {result ? <ResultSummary result={result} /> : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <ResultsPanel
                  result={result}
                  error={searchMutation.error}
                  pending={searchMutation.isPending}
                  onScanDiscovered={(searchUrl) => {
                    const nextForm: FormState = {
                      ...form,
                      mode: "url",
                      searchUrl,
                      discoverOnly: false,
                    };
                    setForm(nextForm);
                    searchMutation.mutate(nextForm);
                  }}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
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

      {form.provider === "airbnb" ? (
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
      ) : (
        <div className="grid gap-2">
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
        </div>
      )}
    </div>
  );
}

function ResultsPanel({
  result,
  error,
  pending,
  onScanDiscovered,
}: {
  result?: SearchUiResult;
  error: Error | null;
  pending: boolean;
  onScanDiscovered: (searchUrl: string) => void;
}) {
  if (pending) {
    return (
      <StateCard
        icon={<Loader2 className="h-5 w-5 animate-spin" />}
        title="Working"
        text="The server is extracting result pages and listing evidence."
      />
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
        text="Run discovery first to confirm pagination and listing extraction before spending model calls."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary" className="gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {result.discoverOnly ? "Discovery complete" : "Scan complete"}
        </Badge>
        {result.discoverOnly ? (
          <Button
            type="button"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => onScanDiscovered(result.searchUrl)}
          >
            Scan these listings
          </Button>
        ) : null}
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

      {result.discoverOnly ? (
        <div className="overflow-hidden rounded-md border">
          <div className="grid grid-cols-[48px_minmax(0,1fr)_80px] border-b bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
            <div>#</div>
            <div>Listing</div>
            <div className="text-right">Action</div>
          </div>
          <div className="divide-y">
            {result.listingUrls.map((url, index) => (
              <ListingUrlRow key={url} url={url} index={index + 1} />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {result.items.map((item) => (
            <ListingResult key={item.listingUrl} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultSummary({ result }: { result: SearchUiResult }) {
  return (
    <div className="hidden shrink-0 items-center gap-2 md:flex">
      <SummaryPill label="Provider" value={result.provider} />
      <SummaryPill label="Listings" value={String(result.listingCount)} />
      <SummaryPill label="Pages" value={String(result.pageUrls.length)} />
      <SummaryPill label="In-unit" value={String(result.matchCount)} />
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

function ListingUrlRow({ url, index }: { url: string; index: number }) {
  const listing = describeListingUrl(url);

  return (
    <div className="grid grid-cols-[48px_minmax(0,1fr)_80px] items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50">
      <div className="font-mono text-xs text-muted-foreground">{index}</div>
      <div className="min-w-0">
        <a href={url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">
          {listing.title}
        </a>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">{listing.id || listing.host}</span>
          <span className="truncate">{listing.path}</span>
        </div>
      </div>
      <div className="text-right">
        <Button asChild variant="outline" size="sm" className="h-8 px-2.5">
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
        </Button>
      </div>
    </div>
  );
}

function ListingResult({ item }: { item: SearchUiResult["items"][number] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={item.decision === "IN_UNIT" ? "default" : item.failed ? "destructive" : "outline"}>
            {item.failed ? "FAILED" : item.decision || "UNKNOWN"}
          </Badge>
          {item.confidence ? <Badge variant="secondary">{item.confidence}</Badge> : null}
          {item.source ? <Badge variant="outline">{item.source}</Badge> : null}
        </div>
        <CardDescription>
          <a href={item.listingUrl} target="_blank" rel="noreferrer" className="break-words hover:underline">
            {item.listingUrl}
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.amenity ? <div className="text-sm text-muted-foreground">{item.amenity}</div> : null}
        <div className="text-sm text-muted-foreground">
          Gallery: {item.imageCount ?? "?"}/{item.galleryCount ?? "?"} photos {item.gallerySource || ""}
        </div>
        {item.error ? <div className="rounded-md bg-muted p-3 text-sm text-destructive">{item.error}</div> : null}
        {item.evidence.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {item.evidence.map((evidence) => (
              <a
                key={`${item.listingUrl}-${evidence.photo}-${evidence.imageUrl}`}
                href={evidence.imageUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border p-3 text-sm hover:bg-muted"
              >
                <div className="font-medium">Photo {evidence.photo ?? "?"}: {evidence.label || "UNKNOWN"}</div>
                <div className="text-muted-foreground">
                  {typeof evidence.confidence === "number" ? evidence.confidence.toFixed(2) : "no confidence"}
                  {evidence.washer ? " washer visible" : ""}
                </div>
              </a>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
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

function ToggleRow({
  id,
  checked,
  label,
  onChange,
}: {
  id: string;
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <Label htmlFor={id} className="text-sm">{label}</Label>
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

function describeListingUrl(url: string): { host: string; id: string; path: string; title: string } {
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
      title: titleFromSlug(slug),
    };
  } catch {
    return {
      host: "",
      id: "",
      path: url,
      title: url,
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

function updateForm(
  setForm: React.Dispatch<React.SetStateAction<FormState>>,
  patch: Partial<FormState>,
) {
  setForm((current) => ({ ...current, ...patch }));
}

function toSearchPayload(form: FormState) {
  return {
    mode: form.mode,
    searchUrl: form.searchUrl,
    provider: form.provider,
    neighborhoods: form.neighborhoods,
    minPriceUsd: optionalNumber(form.minPriceUsd),
    maxPriceUsd: optionalNumber(form.maxPriceUsd),
    minAmbientes: optionalNumber(form.minAmbientes),
    maxAmbientes: optionalNumber(form.maxAmbientes),
    minDormitorios: optionalNumber(form.minDormitorios),
    maxDormitorios: optionalNumber(form.maxDormitorios),
    checkIn: form.checkIn || undefined,
    checkOut: form.checkOut || undefined,
    discoverOnly: form.discoverOnly,
    includeAll: form.includeAll,
    maxListings: optionalNumber(form.maxListings) ?? 20,
    maxPages: optionalNumber(form.maxPages) ?? 3,
    maxImages: optionalNumber(form.maxImages) ?? DEFAULT_MAX_IMAGES,
    model: form.model || DEFAULT_MODEL,
    escalationModel: form.escalationModel || DEFAULT_ESCALATION_MODEL,
  };
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
