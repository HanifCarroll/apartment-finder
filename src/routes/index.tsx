import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Loader2,
  Search,
  Settings2,
  WashingMachine,
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

export const Route = createFileRoute("/")({
  component: HomePage,
});

type FormState = {
  mode: "filters" | "url";
  provider: "zonaprop" | "argenprop" | "airbnb";
  searchUrl: string;
  neighborhoods: string;
  maxPriceUsd: string;
  ambientes: string;
  dormitorios: string;
  checkIn: string;
  checkOut: string;
  adults: string;
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
  neighborhoods: "nunez,las-canitas",
  maxPriceUsd: "1500",
  ambientes: "",
  dormitorios: "",
  checkIn: "2026-06-14",
  checkOut: "2026-08-23",
  adults: "1",
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
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <WashingMachine className="h-4 w-4" />
              Apartment Finder
            </div>
            <h1 className="max-w-3xl text-2xl font-semibold tracking-normal text-foreground md:text-3xl">
              Search listings for likely in-unit washers
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Zonaprop</Badge>
            <Badge variant="secondary">Argenprop</Badge>
            <Badge variant="secondary">Airbnb</Badge>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Search setup
              </CardTitle>
              <CardDescription>
                Build a provider URL from filters or paste a search URL directly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  searchMutation.mutate(form);
                }}
              >
                <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-1">
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
                      value={form.searchUrl}
                      placeholder="https://www.zonaprop.com.ar/..."
                      onChange={(event) => updateForm(setForm, { searchUrl: event.target.value })}
                    />
                  </Field>
                )}

                <div className="grid grid-cols-2 gap-3">
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

                <div className="grid gap-3 rounded-md border p-3">
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
                  <div className="grid gap-3 rounded-md border p-3">
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

                <Button className="w-full" type="submit" disabled={searchMutation.isPending}>
                  {searchMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {form.discoverOnly ? "Discover listings" : "Scan listings"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <ResultsPanel
            result={result}
            error={searchMutation.error}
            pending={searchMutation.isPending}
          />
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
  return (
    <div className="space-y-4">
      <Field label="Provider" htmlFor="provider">
        <select
          id="provider"
          className="h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={form.provider}
          onChange={(event) => updateForm(setForm, { provider: event.target.value as FormState["provider"] })}
        >
          <option value="zonaprop">Zonaprop</option>
          <option value="argenprop">Argenprop</option>
          <option value="airbnb">Airbnb</option>
        </select>
      </Field>

      <Field label="Neighborhoods" htmlFor="neighborhoods">
        <Input
          id="neighborhoods"
          value={form.neighborhoods}
          placeholder="nunez,las-canitas"
          onChange={(event) => updateForm(setForm, { neighborhoods: event.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Max USD" htmlFor="maxPriceUsd">
          <Input
            id="maxPriceUsd"
            type="number"
            min="1"
            value={form.maxPriceUsd}
            onChange={(event) => updateForm(setForm, { maxPriceUsd: event.target.value })}
          />
        </Field>
        <Field label="Adults" htmlFor="adults">
          <Input
            id="adults"
            type="number"
            min="1"
            value={form.adults}
            onChange={(event) => updateForm(setForm, { adults: event.target.value })}
          />
        </Field>
      </div>

      {form.provider === "airbnb" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in" htmlFor="checkIn">
            <Input
              id="checkIn"
              type="date"
              value={form.checkIn}
              onChange={(event) => updateForm(setForm, { checkIn: event.target.value })}
            />
          </Field>
          <Field label="Check-out" htmlFor="checkOut">
            <Input
              id="checkOut"
              type="date"
              value={form.checkOut}
              onChange={(event) => updateForm(setForm, { checkOut: event.target.value })}
            />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ambientes" htmlFor="ambientes">
            <Input
              id="ambientes"
              type="number"
              min="1"
              value={form.ambientes}
              onChange={(event) => updateForm(setForm, { ambientes: event.target.value })}
            />
          </Field>
          <Field label="Dormitorios" htmlFor="dormitorios">
            <Input
              id="dormitorios"
              type="number"
              min="1"
              value={form.dormitorios}
              onChange={(event) => updateForm(setForm, { dormitorios: event.target.value })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function ResultsPanel({
  result,
  error,
  pending,
}: {
  result?: SearchUiResult;
  error: Error | null;
  pending: boolean;
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-secondary-foreground" />
            {result.discoverOnly ? "Discovery complete" : "Scan complete"}
          </CardTitle>
          <CardDescription className="break-words">{result.searchUrl}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Provider" value={result.provider} />
            <Metric label="Listings" value={String(result.listingCount)} />
            <Metric label="Pages" value={String(result.pageUrls.length)} />
            <Metric label="In-unit" value={String(result.matchCount)} />
          </div>
          {result.warnings.length || result.ignored.length ? (
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              {[...result.warnings, ...result.ignored.map((item) => `${item} ignored for this provider`)].map((warning) => (
                <div key={warning} className="rounded-md bg-muted px-3 py-2">{warning}</div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {result.discoverOnly ? (
        <Card>
          <CardHeader>
            <CardTitle>Listings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {result.listingUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="block break-words rounded-md border px-3 py-2 text-sm hover:bg-muted">
                  {url}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
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
    <div className="space-y-2">
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
    <div className="flex items-center gap-3">
      <Checkbox id={id} checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
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
      className="h-9"
    >
      {children}
    </Button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
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
    <Card className="min-h-72">
      <CardContent className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-center">
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
    maxPriceUsd: optionalNumber(form.maxPriceUsd),
    ambientes: optionalNumber(form.ambientes),
    dormitorios: optionalNumber(form.dormitorios),
    checkIn: form.checkIn || undefined,
    checkOut: form.checkOut || undefined,
    adults: optionalNumber(form.adults) ?? 1,
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
