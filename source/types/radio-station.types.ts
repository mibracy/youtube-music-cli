export interface RadioStation {
	id: string;
	name: string;
	streamUrl: string;
	region?: string;
	genre?: string;
	source?: 'builtin' | 'radio-browser' | 'live-catalog';
	stationuuid?: string;
}

export interface StreamNowPlaying {
	title: string | null;
	artist: string | null;
	raw: string | null;
}

export type PlaybackMode = 'youtube' | 'stream';

export type RadioCountryOption = {
	code: string;
	label: string;
};

export const RADIO_COUNTRY_OPTIONS: readonly RadioCountryOption[] = [
	{code: 'ALL', label: 'All countries'},
	{code: 'US', label: 'United States'},
	{code: 'GB', label: 'United Kingdom'},
	{code: 'DE', label: 'Germany'},
	{code: 'FR', label: 'France'},
	{code: 'NL', label: 'Netherlands'},
	{code: 'AT', label: 'Austria'},
	{code: 'CH', label: 'Switzerland'},
	{code: 'CA', label: 'Canada'},
	{code: 'BR', label: 'Brazil'},
	{code: 'MX', label: 'Mexico'},
	{code: 'AR', label: 'Argentina'},
	{code: 'IT', label: 'Italy'},
	{code: 'ES', label: 'Spain'},
	{code: 'SE', label: 'Sweden'},
	{code: 'PL', label: 'Poland'},
	{code: 'UA', label: 'Ukraine'},
	{code: 'NO', label: 'Norway'},
	{code: 'DK', label: 'Denmark'},
	{code: 'BE', label: 'Belgium'},
	{code: 'FI', label: 'Finland'},
	{code: 'IE', label: 'Ireland'},
	{code: 'PT', label: 'Portugal'},
	{code: 'JP', label: 'Japan'},
	{code: 'IN', label: 'India'},
	{code: 'CN', label: 'China'},
	{code: 'AU', label: 'Australia'},
] as const;

export type RadioBrowserCacheFile = {
	schemaVersion: number;
	updatedAt: string;
	entries: Record<
		string,
		{
			fetchedAt: string;
			stations: RadioStation[];
		}
	>;
};

export type RadioFavoritesFile = {
	schemaVersion: number;
	stations: RadioStation[];
	lastUpdated: string;
};
