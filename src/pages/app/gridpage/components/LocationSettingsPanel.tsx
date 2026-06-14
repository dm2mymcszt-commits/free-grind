import { Crosshair, Loader2, Bookmark, MapPin, Search, Trash2, ListPlus, Play, Navigation, ChevronDown, Timer, Route, Plane, Car, Bike, Footprints, Train, Globe } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import toast from "react-hot-toast";
import type { GeocodeResult, SelectedLocation } from "../../GridPage.types";
import { LeafletLocationPicker } from "./LeafletLocationPicker";
import type { SavedLocation } from "../../BrowseLocationPage";
import { ConfirmDialog } from "../../../../components/ui/confirm-dialog";
import { COUNTRY_CENTERS } from "./countryCenters";

const ALL_COUNTRIES = [
    { code: "AF", name: "Afghanistan" },
    { code: "AL", name: "Albania" },
    { code: "DZ", name: "Algeria" },
    { code: "AS", name: "American Samoa" },
    { code: "AD", name: "Andorra" },
    { code: "AO", name: "Angola" },
    { code: "AI", name: "Anguilla" },
    { code: "AQ", name: "Antarctica" },
    { code: "AG", name: "Antigua and Barbuda" },
    { code: "AR", name: "Argentina" },
    { code: "AM", name: "Armenia" },
    { code: "AW", name: "Aruba" },
    { code: "AU", name: "Australia" },
    { code: "AT", name: "Austria" },
    { code: "AZ", name: "Azerbaijan" },
    { code: "BS", name: "Bahamas" },
    { code: "BH", name: "Bahrain" },
    { code: "BD", name: "Bangladesh" },
    { code: "BB", name: "Barbados" },
    { code: "BY", name: "Belarus" },
    { code: "BE", name: "Belgium" },
    { code: "BZ", name: "Belize" },
    { code: "BJ", name: "Benin" },
    { code: "BM", name: "Bermuda" },
    { code: "BT", name: "Bhutan" },
    { code: "BO", name: "Bolivia" },
    { code: "BA", name: "Bosnia and Herzegovina" },
    { code: "BW", name: "Botswana" },
    { code: "BR", name: "Brazil" },
    { code: "IO", name: "British Indian Ocean Territory" },
    { code: "VG", name: "British Virgin Islands" },
    { code: "BN", name: "Brunei" },
    { code: "BG", name: "Bulgaria" },
    { code: "BF", name: "Burkina Faso" },
    { code: "BI", name: "Burundi" },
    { code: "KH", name: "Cambodia" },
    { code: "CM", name: "Cameroon" },
    { code: "CA", name: "Canada" },
    { code: "CV", name: "Cape Verde" },
    { code: "KY", name: "Cayman Islands" },
    { code: "CF", name: "Central African Republic" },
    { code: "TD", name: "Chad" },
    { code: "CL", name: "Chile" },
    { code: "CN", name: "China" },
    { code: "CX", name: "Christmas Island" },
    { code: "CC", name: "Cocos Islands" },
    { code: "CO", name: "Colombia" },
    { code: "KM", name: "Comoros" },
    { code: "CK", name: "Cook Islands" },
    { code: "CR", name: "Costa Rica" },
    { code: "HR", name: "Croatia" },
    { code: "CU", name: "Cuba" },
    { code: "CW", name: "Curaçao" },
    { code: "CY", name: "Cyprus" },
    { code: "CZ", name: "Czech Republic" },
    { code: "CD", name: "Democratic Republic of the Congo" },
    { code: "DK", name: "Denmark" },
    { code: "DJ", name: "Djibouti" },
    { code: "DM", name: "Dominica" },
    { code: "DO", name: "Dominican Republic" },
    { code: "EC", name: "Ecuador" },
    { code: "EG", name: "Egypt" },
    { code: "SV", name: "El Salvador" },
    { code: "GQ", name: "Equatorial Guinea" },
    { code: "ER", name: "Eritrea" },
    { code: "EE", name: "Estonia" },
    { code: "SZ", name: "Eswatini" },
    { code: "ET", name: "Ethiopia" },
    { code: "FK", name: "Falkland Islands" },
    { code: "FO", name: "Faroe Islands" },
    { code: "FJ", name: "Fiji" },
    { code: "FI", name: "Finland" },
    { code: "FR", name: "France" },
    { code: "GF", name: "French Guiana" },
    { code: "PF", name: "French Polynesia" },
    { code: "GA", name: "Gabon" },
    { code: "GM", name: "Gambia" },
    { code: "GE", name: "Georgia" },
    { code: "DE", name: "Germany" },
    { code: "GH", name: "Ghana" },
    { code: "GI", name: "Gibraltar" },
    { code: "GR", name: "Greece" },
    { code: "GL", name: "Greenland" },
    { code: "GD", name: "Grenada" },
    { code: "GP", name: "Guadeloupe" },
    { code: "GU", name: "Guam" },
    { code: "GT", name: "Guatemala" },
    { code: "GG", name: "Guernsey" },
    { code: "GN", name: "Guinea" },
    { code: "GW", name: "Guinea-Bissau" },
    { code: "GY", name: "Guyana" },
    { code: "HT", name: "Haiti" },
    { code: "HN", name: "Honduras" },
    { code: "HK", name: "Hong Kong" },
    { code: "HU", name: "Hungary" },
    { code: "IS", name: "Iceland" },
    { code: "IN", name: "India" },
    { code: "ID", name: "Indonesia" },
    { code: "IR", name: "Iran" },
    { code: "IQ", name: "Iraq" },
    { code: "IE", name: "Ireland" },
    { code: "IM", name: "Isle of Man" },
    { code: "IL", name: "Israel" },
    { code: "IT", name: "Italy" },
    { code: "CI", name: "Ivory Coast" },
    { code: "JM", name: "Jamaica" },
    { code: "JP", name: "Japan" },
    { code: "JE", name: "Jersey" },
    { code: "JO", name: "Jordan" },
    { code: "KZ", name: "Kazakhstan" },
    { code: "KE", name: "Kenya" },
    { code: "KI", name: "Kiribati" },
    { code: "XK", name: "Kosovo" },
    { code: "KW", name: "Kuwait" },
    { code: "KG", name: "Kyrgyzstan" },
    { code: "LA", name: "Laos" },
    { code: "LV", name: "Latvia" },
    { code: "LB", name: "Lebanon" },
    { code: "LS", name: "Lesotho" },
    { code: "LR", name: "Liberia" },
    { code: "LY", name: "Libya" },
    { code: "LI", name: "Liechtenstein" },
    { code: "LT", name: "Lithuania" },
    { code: "LU", name: "Luxembourg" },
    { code: "MO", name: "Macao" },
    { code: "MG", name: "Madagascar" },
    { code: "MW", name: "Malawi" },
    { code: "MY", name: "Malaysia" },
    { code: "MV", name: "Maldives" },
    { code: "ML", name: "Mali" },
    { code: "MT", name: "Malta" },
    { code: "MH", name: "Marshall Islands" },
    { code: "MQ", name: "Martinique" },
    { code: "MR", name: "Mauritania" },
    { code: "MU", name: "Mauritius" },
    { code: "YT", name: "Mayotte" },
    { code: "MX", name: "Mexico" },
    { code: "FM", name: "Micronesia" },
    { code: "MD", name: "Moldova" },
    { code: "MC", name: "Monaco" },
    { code: "MN", name: "Mongolia" },
    { code: "ME", name: "Montenegro" },
    { code: "MS", name: "Montserrat" },
    { code: "MA", name: "Morocco" },
    { code: "MZ", name: "Mozambique" },
    { code: "MM", name: "Myanmar" },
    { code: "NA", name: "Namibia" },
    { code: "NR", name: "Nauru" },
    { code: "NP", name: "Nepal" },
    { code: "NL", name: "Netherlands" },
    { code: "NC", name: "New Caledonia" },
    { code: "NZ", name: "New Zealand" },
    { code: "NI", name: "Nicaragua" },
    { code: "NE", name: "Niger" },
    { code: "NG", name: "Nigeria" },
    { code: "NU", name: "Niue" },
    { code: "KP", name: "North Korea" },
    { code: "MK", name: "North Macedonia" },
    { code: "MP", name: "Northern Mariana Islands" },
    { code: "NO", name: "Norway" },
    { code: "OM", name: "Oman" },
    { code: "PK", name: "Pakistan" },
    { code: "PW", name: "Palau" },
    { code: "PS", name: "Palestine" },
    { code: "PA", name: "Panama" },
    { code: "PG", name: "Papua New Guinea" },
    { code: "PY", name: "Paraguay" },
    { code: "PE", name: "Peru" },
    { code: "PH", name: "Philippines" },
    { code: "PN", name: "Pitcairn" },
    { code: "PL", name: "Poland" },
    { code: "PT", name: "Portugal" },
    { code: "PR", name: "Puerto Rico" },
    { code: "QA", name: "Qatar" },
    { code: "CG", name: "Republic of the Congo" },
    { code: "RE", name: "Réunion" },
    { code: "RO", name: "Romania" },
    { code: "RU", name: "Russia" },
    { code: "RW", name: "Rwanda" },
    { code: "WS", name: "Samoa" },
    { code: "SM", name: "San Marino" },
    { code: "ST", name: "São Tomé and Príncipe" },
    { code: "SA", name: "Saudi Arabia" },
    { code: "SN", name: "Senegal" },
    { code: "RS", name: "Serbia" },
    { code: "SC", name: "Seychelles" },
    { code: "SL", name: "Sierra Leone" },
    { code: "SG", name: "Singapore" },
    { code: "SX", name: "Sint Maarten" },
    { code: "SK", name: "Slovakia" },
    { code: "SI", name: "Slovenia" },
    { code: "SB", name: "Solomon Islands" },
    { code: "SO", name: "Somalia" },
    { code: "ZA", name: "South Africa" },
    { code: "KR", name: "South Korea" },
    { code: "SS", name: "South Sudan" },
    { code: "ES", name: "Spain" },
    { code: "LK", name: "Sri Lanka" },
    { code: "BL", name: "Saint Barthélemy" },
    { code: "SH", name: "Saint Helena" },
    { code: "KN", name: "Saint Kitts and Nevis" },
    { code: "LC", name: "Saint Lucia" },
    { code: "MF", name: "Saint Martin" },
    { code: "PM", name: "Saint Pierre and Miquelon" },
    { code: "VC", name: "Saint Vincent and the Grenadines" },
    { code: "SD", name: "Sudan" },
    { code: "SR", name: "Suriname" },
    { code: "SJ", name: "Svalbard and Jan Mayen" },
    { code: "SE", name: "Sweden" },
    { code: "CH", name: "Switzerland" },
    { code: "SY", name: "Syria" },
    { code: "TW", name: "Taiwan" },
    { code: "TJ", name: "Tajikistan" },
    { code: "TZ", name: "Tanzania" },
    { code: "TH", name: "Thailand" },
    { code: "TL", name: "Timor-Leste" },
    { code: "TG", name: "Togo" },
    { code: "TK", name: "Tokelau" },
    { code: "TO", name: "Tonga" },
    { code: "TT", name: "Trinidad and Tobago" },
    { code: "TN", name: "Tunisia" },
    { code: "TR", name: "Turkey" },
    { code: "TM", name: "Turkmenistan" },
    { code: "TC", name: "Turks and Caicos Islands" },
    { code: "TV", name: "Tuvalu" },
    { code: "VI", name: "U.S. Virgin Islands" },
    { code: "UG", name: "Uganda" },
    { code: "UA", name: "Ukraine" },
    { code: "AE", name: "United Arab Emirates" },
    { code: "GB", name: "United Kingdom" },
    { code: "US", name: "United States" },
    { code: "UY", name: "Uruguay" },
    { code: "UZ", name: "Uzbekistan" },
    { code: "VU", name: "Vanuatu" },
    { code: "VA", name: "Vatican City" },
    { code: "VE", name: "Venezuela" },
    { code: "VN", name: "Vietnam" },
    { code: "WF", name: "Wallis and Futuna" },
    { code: "EH", name: "Western Sahara" },
    { code: "YE", name: "Yemen" },
    { code: "ZM", name: "Zambia" },
    { code: "ZW", name: "Zimbabwe" }
];

const formatDwellTime = (m: number) => {
    if (m === 1440) return "1 Day";
    if (m >= 60) {
        const h = m / 60;
        return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
    }
    return `${m} mins`;
};

function SearchableCountrySelector({ 
    value, 
    onChange 
}: { 
    value: string; 
    onChange: (code: string) => void; 
}) {
    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Sync input query with parent value
    useEffect(() => {
        const country = ALL_COUNTRIES.find(c => c.code === value);
        if (country) {
            setQuery(country.name);
        }
    }, [value]);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                // Revert query to current selection
                const country = ALL_COUNTRIES.find(c => c.code === value);
                if (country) {
                    setQuery(country.name);
                }
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [value]);

    const filtered = query.trim() === ""
        ? ALL_COUNTRIES
        : ALL_COUNTRIES.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));

    return (
        <div ref={containerRef} className="relative w-full">
            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder="Search country..."
                    className="w-full appearance-none rounded-xl border border-white/10 bg-black/20 py-3 pl-4 pr-10 text-sm font-semibold text-white outline-none focus:border-[var(--accent)]"
                />
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            </div>

            {isOpen && (
                <div className="absolute left-0 right-0 mt-2 z-[2000] max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-[#131821] p-1.5 shadow-2xl backdrop-blur-md">
                    {filtered.length === 0 ? (
                        <div className="px-4 py-3 text-xs font-semibold text-[var(--text-muted)]">No countries found</div>
                    ) : (
                        filtered.map((country) => (
                            <button
                                key={country.code}
                                type="button"
                                onClick={() => {
                                    onChange(country.code);
                                    setQuery(country.name);
                                    setIsOpen(false);
                                }}
                                className={`w-full rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-all hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] ${
                                    value === country.code ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-white"
                                }`}
                            >
                                {country.name}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function DwellTimeInput({ 
    value, 
    onChange 
}: { 
    value: number; 
    onChange: (val: number) => void; 
}) {
    const [isFocused, setIsFocused] = useState(false);
    const [inputValue, setInputValue] = useState("");

    useEffect(() => {
        if (!isFocused) {
            setInputValue(formatDwellTime(value));
        }
    }, [value, isFocused]);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        setInputValue(String(value));
        setTimeout(() => e.target.select(), 0);
    };

    const handleBlur = () => {
        setIsFocused(false);
        const clean = inputValue.trim().toLowerCase();
        
        const numMatch = clean.match(/^([0-9]+(?:\.[0-9]+)?)\s*(.*)$/);
        
        if (!numMatch) {
            setInputValue(formatDwellTime(value));
            return;
        }

        const numVal = parseFloat(numMatch[1]);
        const suffix = numMatch[2].trim();

        if (isNaN(numVal) || numVal < 0.001) {
            setInputValue(formatDwellTime(value));
            return;
        }

        let parsedMinutes = numVal;

        if (suffix.includes("day") || suffix.startsWith("d")) {
            parsedMinutes = numVal * 1440;
        } else if (suffix.includes("hour") || suffix.startsWith("h")) {
            parsedMinutes = numVal * 60;
        } else if (suffix.includes("min") || suffix.startsWith("m")) {
            parsedMinutes = numVal;
        } else {
            parsedMinutes = numVal;
        }

        const finalVal = Math.max(1, Math.round(parsedMinutes));
        onChange(finalVal);
    };

    return (
        <input
            type="text"
            value={inputValue}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={(e) => setInputValue(e.target.value)}
            className="w-full bg-transparent py-2.5 px-3 text-center text-xs font-bold text-white outline-none"
            placeholder="E.g., 1h, 45m"
        />
    );
}

const GLASS_BTN_GHOST = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/20 px-4 text-sm font-bold text-white transition-all duration-300 hover:scale-[1.02] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_35%,transparent)] active:scale-95 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:bg-black/20 disabled:hover:border-white/20 disabled:hover:text-white disabled:hover:shadow-none";
const PRIMARY_BTN_GHOST = "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-transparent px-4 text-sm font-bold text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_20%,transparent)] transition-all duration-300 hover:scale-[1.02] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] hover:shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_50%,transparent)] active:scale-95 disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none disabled:hover:bg-transparent disabled:hover:text-[var(--accent)]";

const PRESET_COUNTRIES: Record<string, { name: string; cities: Omit<SavedLocation, "id">[] }> = {
    FR: {
        name: "France",
        cities: [
            { lat: 48.8566, lon: 2.3522, label: "Paris", tier: "metropolis" },
            { lat: 50.6292, lon: 3.0573, label: "Lille", tier: "medium" },
            { lat: 49.2583, lon: 4.0317, label: "Reims", tier: "small" },
            { lat: 48.5734, lon: 7.7521, label: "Strasbourg", tier: "medium" },
            { lat: 47.3220, lon: 5.0415, label: "Dijon", tier: "small" },
            { lat: 45.7640, lon: 4.8357, label: "Lyon", tier: "metropolis" },
            { lat: 43.7102, lon: 7.2620, label: "Nice", tier: "medium" },
            { lat: 43.2965, lon: 5.3698, label: "Marseille", tier: "metropolis" },
            { lat: 43.6108, lon: 3.8767, label: "Montpellier", tier: "medium" },
            { lat: 43.6047, lon: 1.4442, label: "Toulouse", tier: "medium" },
            { lat: 44.8378, lon: -0.5792, label: "Bordeaux", tier: "metropolis" },
            { lat: 47.2184, lon: -1.5536, label: "Nantes", tier: "medium" },
            { lat: 48.1173, lon: -1.6778, label: "Rennes", tier: "medium" },
            { lat: 49.4431, lon: 1.0993, label: "Rouen", tier: "medium" }
        ]
    },
    US: {
        name: "United States",
        cities: [
            { lat: 40.7128, lon: -74.0060, label: "New York City", tier: "metropolis" },
            { lat: 42.3601, lon: -71.0589, label: "Boston", tier: "medium" },
            { lat: 39.9526, lon: -75.1652, label: "Philadelphia", tier: "medium" },
            { lat: 38.9072, lon: -77.0369, label: "Washington D.C.", tier: "metropolis" },
            { lat: 35.2271, lon: -80.8431, label: "Charlotte", tier: "medium" },
            { lat: 32.0809, lon: -81.0912, label: "Savannah", tier: "small" },
            { lat: 25.7617, lon: -80.1918, label: "Miami", tier: "metropolis" },
            { lat: 33.7490, lon: -84.3880, label: "Atlanta", tier: "medium" },
            { lat: 29.9511, lon: -90.0715, label: "New Orleans", tier: "medium" },
            { lat: 29.7604, lon: -95.3698, label: "Houston", tier: "metropolis" },
            { lat: 30.2672, lon: -97.7431, label: "Austin", tier: "medium" },
            { lat: 34.8697, lon: -111.7601, label: "Sedona", tier: "small" },
            { lat: 36.1716, lon: -115.1398, label: "Las Vegas", tier: "medium" },
            { lat: 34.0522, lon: -118.2437, label: "Los Angeles", tier: "metropolis" },
            { lat: 37.7749, lon: -122.4194, label: "San Francisco", tier: "metropolis" },
            { lat: 45.5152, lon: -122.6784, label: "Portland", tier: "small" },
            { lat: 47.6062, lon: -122.3321, label: "Seattle", tier: "medium" },
            { lat: 39.7392, lon: -104.9903, label: "Denver", tier: "medium" },
            { lat: 41.8781, lon: -87.6298, label: "Chicago", tier: "metropolis" }
        ]
    },
    GB: {
        name: "United Kingdom",
        cities: [
            { lat: 51.5074, lon: -0.1278, label: "London", tier: "metropolis" },
            { lat: 51.7520, lon: -1.2577, label: "Oxford", tier: "small" },
            { lat: 51.3758, lon: -2.3599, label: "Bath", tier: "small" },
            { lat: 51.4545, lon: -2.5879, label: "Bristol", tier: "medium" },
            { lat: 51.4816, lon: -3.1791, label: "Cardiff", tier: "medium" },
            { lat: 52.4862, lon: -1.8904, label: "Birmingham", tier: "metropolis" },
            { lat: 53.4084, lon: -2.9916, label: "Liverpool", tier: "medium" },
            { lat: 53.4808, lon: -2.2426, label: "Manchester", tier: "metropolis" },
            { lat: 53.8008, lon: -1.5491, label: "Leeds", tier: "medium" },
            { lat: 54.9783, lon: -1.6178, label: "Newcastle", tier: "medium" },
            { lat: 55.9533, lon: -3.1883, label: "Edinburgh", tier: "metropolis" },
            { lat: 55.8642, lon: -4.2518, label: "Glasgow", tier: "metropolis" },
            { lat: 54.5973, lon: -5.9301, label: "Belfast", tier: "medium" },
            { lat: 50.8225, lon: -0.1372, label: "Brighton", tier: "small" }
        ]
    },
    DE: {
        name: "Germany",
        cities: [
            { lat: 52.5200, lon: 13.4050, label: "Berlin", tier: "metropolis" },
            { lat: 52.3989, lon: 13.0657, label: "Potsdam", tier: "small" },
            { lat: 53.5511, lon: 9.9937, label: "Hamburg", tier: "metropolis" },
            { lat: 53.0793, lon: 8.8017, label: "Bremen", tier: "medium" },
            { lat: 50.9375, lon: 6.9603, label: "Cologne", tier: "metropolis" },
            { lat: 51.2271, lon: 6.7735, label: "Düsseldorf", tier: "medium" },
            { lat: 50.1109, lon: 8.6821, label: "Frankfurt", tier: "metropolis" },
            { lat: 49.3988, lon: 8.6724, label: "Heidelberg", tier: "small" },
            { lat: 48.7758, lon: 9.1829, label: "Stuttgart", tier: "medium" },
            { lat: 48.1351, lon: 11.5820, label: "Munich", tier: "metropolis" },
            { lat: 49.4521, lon: 11.0767, label: "Nuremberg", tier: "medium" },
            { lat: 50.9803, lon: 11.3265, label: "Weimar", tier: "small" },
            { lat: 51.3397, lon: 12.3731, label: "Leipzig", tier: "medium" },
            { lat: 51.0504, lon: 13.7373, label: "Dresden", tier: "medium" }
        ]
    },
    JP: {
        name: "Japan",
        cities: [
            { lat: 35.6762, lon: 139.6503, label: "Tokyo", tier: "metropolis" },
            { lat: 35.4437, lon: 139.6380, label: "Yokohama", tier: "metropolis" },
            { lat: 35.2324, lon: 139.1033, label: "Hakone", tier: "small" },
            { lat: 34.9756, lon: 138.3828, label: "Shizuoka", tier: "medium" },
            { lat: 35.1815, lon: 136.9066, label: "Nagoya", tier: "metropolis" },
            { lat: 35.0116, lon: 135.7681, label: "Kyoto", tier: "metropolis" },
            { lat: 34.6851, lon: 135.8048, label: "Nara", tier: "small" },
            { lat: 34.6937, lon: 135.5023, label: "Osaka", tier: "metropolis" },
            { lat: 34.6901, lon: 135.1955, label: "Kobe", tier: "medium" },
            { lat: 34.3853, lon: 132.4553, label: "Hiroshima", tier: "medium" },
            { lat: 33.5904, lon: 130.4017, label: "Fukuoka", tier: "metropolis" },
            { lat: 36.5613, lon: 136.6562, label: "Kanazawa", tier: "small" },
            { lat: 38.2682, lon: 140.8694, label: "Sendai", tier: "medium" },
            { lat: 43.0618, lon: 141.3545, label: "Sapporo", tier: "metropolis" }
        ]
    }
};

function BookmarkPromptDialog({ location, onClose, onSave }: { location: SelectedLocation | null; onClose: () => void; onSave: (name: string) => void; }) {
    const dialogRef = useRef<HTMLDialogElement | null>(null);
    const [isClosing, setIsClosing] = useState(false);
    const [name, setName] = useState("");

    useEffect(() => {
        if (location) {
            setName(location.label);
            setIsClosing(false);
            if (!dialogRef.current?.open) { try { dialogRef.current?.showModal(); } catch { dialogRef.current?.show(); } }
        } else if (dialogRef.current?.open) {
            setIsClosing(true);
            const timer = setTimeout(() => { dialogRef.current?.close(); setIsClosing(false); }, 250);
            return () => clearTimeout(timer);
        }
    }, [location]);

    return (
        <>
            {location && (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) && (
                <div 
                    className="fixed inset-0 bg-black/55 backdrop-blur-[12px] pointer-events-none"
                    style={{
                        zIndex: 9990,
                        animation: isClosing 
                            ? "backdrop-fade-out 0.25s ease-in forwards" 
                            : "backdrop-fade-in 0.3s ease-out forwards"
                    }}
                />
            )}
            <dialog ref={dialogRef} className={`fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-[2rem] border border-white/10 dark:border-white/5 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-0 text-[var(--text)] shadow-[0_20px_60px_rgba(0,0,0,0.6),_inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[30px] ${isClosing ? "dialog-closing" : ""}`} onClick={(e) => { if (e.target === dialogRef.current) onClose(); }} style={{ zIndex: 9995 }}>
            <style>{`
                dialog[open]:not(.dialog-closing) { animation: dialog-spring-in 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.1) forwards; }
                dialog[open]:not(.dialog-closing)::backdrop { animation: backdrop-fade-in 0.3s ease-out forwards; backdrop-filter: blur(12px); }
                dialog[open].dialog-closing { animation: dialog-spring-out 0.25s ease-in forwards; }
                dialog[open].dialog-closing::backdrop { animation: backdrop-fade-out 0.25s ease-in forwards; backdrop-filter: blur(12px); }
                @keyframes dialog-spring-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                @keyframes dialog-spring-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.95); } }
                @keyframes backdrop-fade-in { from { background-color: rgba(0, 0, 0, 0); } to { background-color: rgba(0, 0, 0, 0.55); } }
                @keyframes backdrop-fade-out { from { background-color: rgba(0, 0, 0, 0.55); } to { background-color: rgba(0, 0, 0, 0); } }
            `}</style>
            <div className="p-5 sm:p-6">
                <p className="text-lg font-bold text-[var(--text)] drop-shadow-sm">Name this Bookmark</p>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="E.g. Home, Work, Paris..." className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-semibold text-white outline-none focus:border-[var(--accent)] focus:bg-black/40 focus:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all" autoFocus />
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-[var(--text-muted)] transition hover:text-white active:scale-95">Cancel</button>
                    <button type="button" onClick={() => onSave(name)} disabled={!name.trim()} className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-6 text-sm font-bold text-[var(--accent-contrast)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_40%,transparent)] transition hover:brightness-110 active:scale-95 disabled:opacity-50">Save Bookmark</button>
                </div>
            </div>
        </dialog>
    </>
    );
}

function SwipeableRow({ children, onDelete }: { children: React.ReactNode; onDelete: (complete: () => void, revert: () => void) => void; }) {
    const [startX, setStartX] = useState<number | null>(null);
    const [currentX, setCurrentX] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const [isAnimatingOut, setIsAnimatingOut] = useState(false);

    const handlePointerDown = (e: React.PointerEvent) => { if (e.button !== 0) return; setStartX(e.clientX); setIsSwiping(true); };
    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isSwiping || startX === null) return;
        const deltaX = e.clientX - startX;
        if (deltaX < 0) {
            if (deltaX < -140) setCurrentX(-140 + (deltaX + 140) * 0.2);
            else setCurrentX(deltaX);
        } else setCurrentX(0);
    };
    const triggerDelete = () => onDelete(() => { setIsAnimatingOut(true); setCurrentX(-500); }, () => { setIsAnimatingOut(false); setCurrentX(0); });
    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isSwiping) return;
        setIsSwiping(false); setStartX(null);
        if (currentX < -90) triggerDelete();
        else setCurrentX(0);
        if (Math.abs(currentX) > 10) { e.stopPropagation(); e.preventDefault(); }
    };

    return (
        <div className="relative overflow-hidden shrink-0 rounded-2xl border border-white/5 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] select-none touch-pan-y" style={{ height: isAnimatingOut ? "0px" : "auto", minHeight: isAnimatingOut ? "0px" : "64px", opacity: isAnimatingOut ? 0 : 1, transform: isAnimatingOut ? "scaleY(0.8)" : "none", transformOrigin: "center top" }}>
            {currentX < 0 && <div className="absolute inset-y-0 right-0 bg-gradient-to-r from-red-600/15 to-red-600/80 backdrop-blur-md z-0 cursor-pointer" style={{ width: `${Math.abs(currentX)}px` }} onClick={triggerDelete} />}
            {currentX < -60 && (
                <div className="absolute inset-y-0 right-0 flex items-center justify-end px-6 text-white z-20 pointer-events-none transition-opacity duration-200" style={{ width: `${Math.abs(currentX)}px` }}>
                    <div className="flex flex-col items-center gap-1">
                        <Trash2 className="h-5 w-5 text-red-100 drop-shadow-[0_2px_8px_rgba(239,68,68,0.6)] animate-pulse" />
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-100">Delete</span>
                    </div>
                </div>
            )}
            <div onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} className="relative bg-transparent w-full h-full z-10 shrink-0 select-none cursor-grab active:cursor-grabbing" style={{ transform: `translateX(${currentX}px)`, filter: currentX < 0 ? `blur(${Math.min(6, Math.abs(currentX) / 25)}px)` : "none", opacity: currentX < 0 ? Math.max(0.3, 1 - Math.abs(currentX) / 250) : 1, transition: isSwiping ? "none" : "transform 0.25s cubic-bezier(0.25, 1, 0.5, 1), filter 0.25s ease, opacity 0.25s ease" }}>
                {children}
            </div>
        </div>
    );
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
}

function samplePointsEquidistant(points: { lat: number; lon: number }[], count: number = 8) {
    if (points.length === 0) return [];
    if (points.length === 1) {
        return Array(count).fill(points[0]);
    }
    
    const cumulativeDistances: number[] = [0];
    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
        const d = getDistance(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
        totalDistance += d;
        cumulativeDistances.push(totalDistance);
    }
    
    if (totalDistance === 0) {
        const result: { lat: number; lon: number }[] = [];
        const step = (points.length - 1) / (count - 1);
        for (let i = 0; i < count; i++) {
            const index = Math.round(i * step);
            result.push(points[index]);
        }
        return result;
    }
    
    const sampled: { lat: number; lon: number }[] = [];
    for (let i = 0; i < count; i++) {
        const target = totalDistance * (i / (count - 1));
        
        let segmentIndex = 0;
        for (let j = 0; j < cumulativeDistances.length - 1; j++) {
            if (cumulativeDistances[j] <= target && target <= cumulativeDistances[j + 1]) {
                segmentIndex = j;
                break;
            }
        }
        
        const p1 = points[segmentIndex];
        const p2 = points[segmentIndex + 1];
        const d1 = cumulativeDistances[segmentIndex];
        const d2 = cumulativeDistances[segmentIndex + 1];
        
        const segmentLen = d2 - d1;
        if (segmentLen === 0) {
            sampled.push({ lat: p1.lat, lon: p1.lon });
        } else {
            const fraction = (target - d1) / segmentLen;
            sampled.push({
                lat: p1.lat + fraction * (p2.lat - p1.lat),
                lon: p1.lon + fraction * (p2.lon - p1.lon)
            });
        }
    }
    return sampled;
}

type LocationSettingsPanelProps = {
    mode: "static" | "dynamic" | "route";
    onModeChange: (m: "static" | "dynamic" | "route") => void;
    isDetectingLocation: boolean;
    onUseCurrentLocation: () => void;
    locationQuery: string;
    onLocationQueryChange: (value: string) => void;
    isSearchingLocation: boolean;
    locationResults: GeocodeResult[];
    onStageLocation: (lat: number, lon: number, label: string) => void;
    selectedLocation: SelectedLocation | null;
    isMapPickerOpen: boolean;
    mapPickerError: string | null;
    onToggleMapPicker: () => void;
    onMapPick: (lat: number, lon: number) => void;
    onMapPickerError: (message: string) => void;
    onTeleport: (lat: number, lon: number, label: string) => void;
    initialCenter?: [number, number];
    bookmarks: SavedLocation[];
    queue: SavedLocation[];
    queueInterval: number;
    queueIndex?: number;
    queueTimestamp?: number;
    onAddBookmark: (loc: SavedLocation) => void;
    onDeleteBookmark: (id: string) => void;
    onAddQueue: (loc: SavedLocation) => void;
    onDeleteQueue: (id: string) => void;
    onClearQueue: () => void;
    onChangeInterval: (interval: number) => void;
    onUpdateQueue: (q: SavedLocation[]) => void;
    routeWaypoints: SavedLocation[];
    routePolyline: {lat: number, lon: number}[];
    routeSpeed: number;
    routeTransport: string;
    routeActive: boolean;
    routeProgress: number;
    onUpdateRouteWaypoints: (w: SavedLocation[]) => void;
    onUpdateRouteSpeed: (s: number) => void;
    onUpdateRouteTransport: (t: string) => void;
    onStartRoute: () => void;
    onStopRoute: (clearPolyline?: boolean) => void;
};

export function LocationSettingsPanel({
    mode, onModeChange,
    isDetectingLocation, onUseCurrentLocation,
    locationQuery, onLocationQueryChange, isSearchingLocation, locationResults,
    onStageLocation, selectedLocation,
    isMapPickerOpen, mapPickerError, onToggleMapPicker, onMapPick, onMapPickerError,
    onTeleport, initialCenter,
    bookmarks, queue, queueInterval, queueIndex = 0, queueTimestamp = Date.now(),
    onAddBookmark, onDeleteBookmark, onAddQueue, onDeleteQueue, onClearQueue, onChangeInterval, onUpdateQueue,
    routeWaypoints, routePolyline, routeSpeed, routeTransport, routeActive, routeProgress,
    onUpdateRouteWaypoints, onUpdateRouteSpeed, onUpdateRouteTransport, onStartRoute, onStopRoute
}: LocationSettingsPanelProps) {
    const [now, setNow] = useState(Date.now());
    const [bookmarkPromptLocation, setBookmarkPromptLocation] = useState<SelectedLocation | null>(null);
    const [confirmClearQueue, setConfirmClearQueue] = useState(false);
    const [confirmClearRoute, setConfirmClearRoute] = useState(false);
    const [pendingModeSwitch, setPendingModeSwitch] = useState<"static" | "dynamic" | "route" | null>(null);
    const [pendingOverride, setPendingOverride] = useState<"teleport" | "queue" | null>(null);

    // Dynamic mode settings state
    const [dynamicMode, setDynamicMode] = useState<"manual" | "country">(() => {
        return (window.localStorage.getItem("fg-location-dynamic-mode") as "manual" | "country") || "manual";
    });
    const [dynamicCountry, setDynamicCountry] = useState(() => {
        return window.localStorage.getItem("fg-location-dynamic-country") || "FR";
    });
    const [dynamicStrategy, setDynamicStrategy] = useState<"random" | "sequential">(() => {
        return (window.localStorage.getItem("fg-location-dynamic-strategy") as "random" | "sequential") || "random";
    });
    const [useTieredDwell, setUseTieredDwell] = useState(() => {
        return window.localStorage.getItem("fg-location-use-tiered-dwell") === "true";
    });
    const [dwellMetropolis, setDwellMetropolis] = useState(() => {
        return Number(window.localStorage.getItem("fg-location-dwell-metropolis") || "1440");
    });
    const [dwellMedium, setDwellMedium] = useState(() => {
        return Number(window.localStorage.getItem("fg-location-dwell-medium") || "180");
    });
    const [dwellSmall, setDwellSmall] = useState(() => {
        return Number(window.localStorage.getItem("fg-location-dwell-small") || "60");
    });
    const [isDrawingRoute, setIsDrawingRoute] = useState(false);
    const [drawingPoints, setDrawingPoints] = useState<{ lat: number; lon: number }[]>([]);
    const [isSnapping, setIsSnapping] = useState(false);

    useEffect(() => {
        if (mode === "dynamic" && dynamicMode === "country") {
            const country = ALL_COUNTRIES.find(c => c.code === dynamicCountry);
            if (!country) return;

            const center = COUNTRY_CENTERS[dynamicCountry];
            if (center) {
                onStageLocation(center.lat, center.lon, country.name);
            } else if (PRESET_COUNTRIES[dynamicCountry]) {
                const cities = PRESET_COUNTRIES[dynamicCountry].cities;
                if (cities.length > 0) {
                    let sumLat = 0, sumLon = 0;
                    cities.forEach(c => { sumLat += c.lat; sumLon += c.lon; });
                    onStageLocation(sumLat / cities.length, sumLon / cities.length, country.name);
                }
            }
        }
    }, [dynamicCountry, dynamicMode, mode]);

    useEffect(() => {
        window.localStorage.setItem("fg-location-dynamic-mode", dynamicMode);
    }, [dynamicMode]);

    useEffect(() => {
        window.localStorage.setItem("fg-location-dynamic-country", dynamicCountry);
    }, [dynamicCountry]);

    useEffect(() => {
        window.localStorage.setItem("fg-location-dynamic-strategy", dynamicStrategy);
    }, [dynamicStrategy]);

    useEffect(() => {
        window.localStorage.setItem("fg-location-use-tiered-dwell", String(useTieredDwell));
        window.dispatchEvent(new Event("fg-engine-tick"));
    }, [useTieredDwell]);

    useEffect(() => {
        window.localStorage.setItem("fg-location-dwell-metropolis", String(dwellMetropolis));
        window.dispatchEvent(new Event("fg-engine-tick"));
    }, [dwellMetropolis]);

    useEffect(() => {
        window.localStorage.setItem("fg-location-dwell-medium", String(dwellMedium));
        window.dispatchEvent(new Event("fg-engine-tick"));
    }, [dwellMedium]);

    useEffect(() => {
        window.localStorage.setItem("fg-location-dwell-small", String(dwellSmall));
        window.dispatchEvent(new Event("fg-engine-tick"));
    }, [dwellSmall]);

    const handleModeSwitch = (newMode: "static" | "dynamic" | "route") => {
        if (newMode === mode) return;
        if (mode === "route" && routeActive) {
            setPendingModeSwitch(newMode);
        } else {
            onModeChange(newMode);
        }
    };

    useEffect(() => {
        if (confirmClearQueue) {
            const timer = setTimeout(() => setConfirmClearQueue(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [confirmClearQueue]);

    useEffect(() => {
        if (confirmClearRoute) {
            const timer = setTimeout(() => setConfirmClearRoute(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [confirmClearRoute]);

    useEffect(() => {
        if (mode === "static") return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [mode]);

    const generateId = () => Math.random().toString(36).substr(2, 9);

    const getRemainingTime = () => {
        if (mode !== "dynamic") return "PAUSED";
        const currentLoc = queue[queueIndex];
        let activeInterval = queueInterval;
        if (useTieredDwell && currentLoc && currentLoc.tier) {
            if (currentLoc.tier === "metropolis") activeInterval = dwellMetropolis;
            else if (currentLoc.tier === "medium") activeInterval = dwellMedium;
            else if (currentLoc.tier === "small") activeInterval = dwellSmall;
        }
        const targetTime = queueTimestamp + (activeInterval * 60 * 1000);
        const diff = Math.max(0, targetTime - now);
        if (diff === 0) return "Switching...";
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / 1000 / 60) % 60);
        const s = Math.floor((diff / 1000) % 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m ${s}s`;
    };

    const handleSaveStagedToQueue = () => {
        if (!selectedLocation) return;
        onAddQueue({ id: generateId(), lat: selectedLocation.lat, lon: selectedLocation.lon, label: selectedLocation.label });
    };

    const handleAddStagedToRoute = () => {
        if (!selectedLocation) return;
        onUpdateRouteWaypoints([...routeWaypoints, { id: generateId(), lat: selectedLocation.lat, lon: selectedLocation.lon, label: selectedLocation.label }]);
    };

    const handleDrawingComplete = useCallback(async (points: { lat: number; lon: number }[]) => {
        setIsDrawingRoute(false);
        if (points.length < 2) {
            toast.error("Draw a longer line to generate a route queue.");
            return;
        }

        setIsSnapping(true);
        const sampled = samplePointsEquidistant(points, 8);
        const country = ALL_COUNTRIES.find(c => c.code === dynamicCountry);
        const countryName = country ? country.name : "";

        const toastId = toast.loading("Snapping path and generating regional stops...");

        try {
            // Generate the internal around clauses for the 8 points
            const aroundClauses = sampled.map(point => 
                `  node[place~"city|town|village|hamlet"](around:15000, ${point.lat}, ${point.lon});`
            ).join('\n');

            // Wrap them inside a single Overpass QL union block (...) and request tags & coordinates (out;)
            const query = `[out:json][timeout:10];\n(\n${aroundClauses}\n);\nout;`;

            // Instantiate a completely local controller isolated from component state
            const localController = new AbortController();
            const timeoutId = setTimeout(() => localController.abort(), 10000);

            let nodes: any[] = [];
            try {
                const response = await fetch("https://overpass-api.de/api/interpreter", {
                    method: "POST",
                    body: new URLSearchParams({ data: query }),
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    signal: localController.signal
                });
                clearTimeout(timeoutId);
                if (response.ok) {
                    const data = (await response.json()) as any;
                    const nodesList = data.elements || [];
                    nodes = nodesList;
                }
            } catch (e: any) {
                clearTimeout(timeoutId);
                if (e.name === "AbortError") return;
                console.error("Overpass bulk query failed:", e);
            }

            const newStops: SavedLocation[] = [];

            for (let i = 0; i < sampled.length; i++) {
                const pt = sampled[i];
                let snappedLat = pt.lat;
                let snappedLon = pt.lon;
                let label = "";
                let tier: "metropolis" | "medium" | "small" = "small";

                if (nodes.length > 0) {
                    const places = nodes.map((el: any) => {
                        const distance = getDistance(pt.lat, pt.lon, el.lat, el.lon);
                        return {
                            name: el.tags?.name || el.tags?.name_en || el.tags?.official_name || "",
                            place: el.tags?.place || "",
                            lat: el.lat,
                            lon: el.lon,
                            distance: el.lat !== undefined && el.lon !== undefined 
                                ? distance
                                : Infinity
                        };
                    }).filter((p: any) => {
                        const distance = p.distance;
                        return p.name !== "" && distance <= 15000;
                    });

                    places.sort((a: any, b: any) => a.distance - b.distance);

                    const majorPlace = places.find((p: any) => p.place === "city" || p.place === "town");
                    if (majorPlace) {
                        snappedLat = majorPlace.lat;
                        snappedLon = majorPlace.lon;
                        label = majorPlace.name;
                        tier = majorPlace.place === "city" ? "metropolis" : "medium";
                    } else {
                        const villagePlace = places.find((p: any) => p.place === "village" || p.place === "hamlet" || p.place === "suburb");
                        if (villagePlace) {
                            snappedLat = villagePlace.lat;
                            snappedLon = villagePlace.lon;
                            label = villagePlace.name;
                            tier = "small";
                        }
                    }
                }

                if (!label) {
                    label = `Route Stop [${pt.lat.toFixed(4)}, ${pt.lon.toFixed(4)}]`;
                    tier = "small";
                } else if (countryName && !label.includes(countryName)) {
                    label = `${countryName} - ${label}`;
                }

                newStops.push({
                    id: generateId(),
                    lat: snappedLat,
                    lon: snappedLon,
                    label: label,
                    tier: tier
                });
            }

            // Deduplicate consecutive stops that snap to the same location
            const deduplicatedQueue = newStops.filter((stop, index, array) => {
                if (index === 0) return true;
                return stop.label !== array[index - 1].label;
            });

            if (dynamicStrategy === "random") {
                for (let i = deduplicatedQueue.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [deduplicatedQueue[i], deduplicatedQueue[j]] = [deduplicatedQueue[j], deduplicatedQueue[i]];
                }
            }

            onUpdateQueue(deduplicatedQueue);
            
            window.localStorage.setItem("fg-location-queue-index", "0");
            window.localStorage.setItem("fg-location-queue-timestamp", String(Date.now()));
            window.dispatchEvent(new Event("fg-engine-tick"));

            toast.success(`Successfully generated ${deduplicatedQueue.length} travel stops!`, { id: toastId });
        } catch (error) {
            toast.error("Failed to generate queue from route.", { id: toastId });
        } finally {
            setIsSnapping(false);
        }
    }, [dynamicCountry, dynamicStrategy, onUpdateQueue]);

    const handleFinishRoute = () => {
        if (drawingPoints.length < 2) {
            toast.error("Draw a longer line to generate a route queue.");
            return;
        }
        void handleDrawingComplete(drawingPoints);
    };

    const handleCancelDrawing = () => {
        setDrawingPoints([]);
        setIsDrawingRoute(false);
    };

    const presets = [
        { id: "walking", icon: Footprints, speed: 5 },
        { id: "biking", icon: Bike, speed: 20 },
        { id: "driving", icon: Car, speed: 60 },
        { id: "train", icon: Train, speed: 120 },
        { id: "plane", icon: Plane, speed: 800 }
    ];

    return (
        <div className="flex flex-col gap-6">
            
            <div className="mx-auto grid w-full max-w-[500px] grid-cols-3 items-center rounded-[1.2rem] bg-black/40 p-1.5 backdrop-blur-xl shadow-inner border border-white/5">
                <button type="button" onClick={() => handleModeSwitch("static")} className={`relative rounded-xl py-3 text-sm font-bold transition-all duration-300 z-10 flex flex-col items-center justify-center gap-1 ${mode === "static" ? "text-white" : "text-[var(--text-muted)] hover:text-white"}`}>
                    <span className="relative z-20 flex items-center justify-center gap-1.5"><MapPin className="h-4 w-4" /> Static</span>
                    <span className="relative z-20 text-[9px] font-black uppercase tracking-widest">{mode === "static" ? <span className="text-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)] px-2 py-0.5 rounded-sm">Active</span> : <span className="opacity-50">Disabled</span>}</span>
                    {mode === "static" && <div className="absolute inset-0 z-10 rounded-xl bg-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_50%,transparent)]" />}
                </button>
                <button type="button" onClick={() => handleModeSwitch("dynamic")} className={`relative rounded-xl py-3 text-sm font-bold transition-all duration-300 z-10 flex flex-col items-center justify-center gap-1 ${mode === "dynamic" ? "text-white" : "text-[var(--text-muted)] hover:text-white"}`}>
                    <span className="relative z-20 flex items-center justify-center gap-1.5"><Play className="h-4 w-4" fill={mode === "dynamic" ? "currentColor" : "none"} /> Dynamic</span>
                    <span className="relative z-20 text-[9px] font-black uppercase tracking-widest">{mode === "dynamic" ? <span className="text-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)] px-2 py-0.5 rounded-sm">Active</span> : <span className="opacity-50">Disabled</span>}</span>
                    {mode === "dynamic" && <div className="absolute inset-0 z-10 rounded-xl bg-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_50%,transparent)]" />}
                </button>
                <button type="button" onClick={() => handleModeSwitch("route")} className={`relative rounded-xl py-3 text-sm font-bold transition-all duration-300 z-10 flex flex-col items-center justify-center gap-1 ${mode === "route" ? "text-white" : "text-[var(--text-muted)] hover:text-white"}`}>
                    <span className="relative z-20 flex items-center justify-center gap-1.5"><Route className="h-4 w-4" /> Route</span>
                    <span className="relative z-20 text-[9px] font-black uppercase tracking-widest">{mode === "route" ? <span className="text-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)] px-2 py-0.5 rounded-sm">Active</span> : <span className="opacity-50">Disabled</span>}</span>
                    {mode === "route" && <div className="absolute inset-0 z-10 rounded-xl bg-[var(--accent)] shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_50%,transparent)]" />}
                </button>
            </div>

            <div className="rounded-[2rem] border border-white/10 dark:border-white/5 bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] shadow-[0_20px_60px_rgba(0,0,0,0.6),_inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[30px] overflow-hidden p-5 sm:p-6">
                
                <div className="mb-8 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-[var(--text)] drop-shadow-sm">
                            {mode === "static" ? "Find Location" : mode === "dynamic" ? "Add to Queue" : "Add to Route"}
                        </h2>
                        <button type="button" onClick={onUseCurrentLocation} disabled={isDetectingLocation} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[color-mix(in_srgb,var(--surface)_80%,black)] border border-[var(--accent)]/50 px-4 text-xs font-bold text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] active:scale-95 disabled:opacity-50">
                            {isDetectingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} GPS
                        </button>
                    </div>

                    <div className="relative">
                        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                            {isSearchingLocation ? <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" /> : <Search className="h-5 w-5" />}
                        </div>
                        <input type="text" value={locationQuery} onChange={(e) => onLocationQueryChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} placeholder="Search city, area, or zip code..." className="w-full appearance-none rounded-2xl border border-white/10 bg-black/20 py-3.5 pl-12 pr-4 text-sm font-semibold text-[var(--text)] transition-all outline-none focus:border-[var(--accent)] focus:bg-black/40 focus:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)] placeholder:font-medium" />
                    </div>

                    {locationResults.length > 0 && (
                        <div className="grid max-h-52 gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-2 shadow-inner">
                            {locationResults.map((result) => (
                                <button key={`${result.lat}:${result.lon}:${result.display_name}`} type="button" onClick={() => onStageLocation(Number(result.lat), Number(result.lon), result.display_name)} className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] transition-all hover:border-[var(--accent)] hover:bg-[var(--accent)]/20 hover:text-white">
                                    {result.display_name}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="overflow-hidden rounded-2xl border border-white/10 shadow-inner relative">
                        <div className="flex items-center justify-between gap-2 border-b border-white/5 bg-black/30 p-3">
                            <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Manual Pin Drop</p>
                            <button type="button" onClick={onToggleMapPicker} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold transition hover:bg-white/10 hover:text-white">{isMapPickerOpen ? "Close Map" : "Open Map"}</button>
                        </div>
                        {isMapPickerOpen ? (
                            mapPickerError ? <div className="p-4 text-center text-sm font-semibold text-red-400 bg-red-500/10">{mapPickerError}</div> : (
                                <div className={`relative w-full ${isDrawingRoute ? "select-none" : ""}`}>
                                    <LeafletLocationPicker 
                                        selectedLocation={selectedLocation} 
                                        onPick={onMapPick} 
                                        onError={onMapPickerError} 
                                        defaultZoom={11} 
                                        initialCenter={initialCenter} 
                                        routePolyline={mode === "route" ? routePolyline : undefined}
                                        routeWaypoints={mode === "route" ? routeWaypoints : undefined}
                                        autoPan={mode !== "route"}
                                        isDrawing={isDrawingRoute}
                                        onDrawingComplete={setDrawingPoints}
                                        isQueueEmpty={queue.length === 0}
                                    />
                                    {mode === "dynamic" && dynamicMode === "country" && (
                                        <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-1.5">
                                            {isDrawingRoute ? (
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleFinishRoute}
                                                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-[var(--accent)] px-4.5 text-xs font-black backdrop-blur-md transition hover:scale-[1.03] active:scale-95 shadow-[0_4px_15px_rgba(0,0,0,0.5),_0_0_10px_color-mix(in_srgb,var(--accent)_20%,transparent)]"
                                                    >
                                                        Finish Route
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleCancelDrawing}
                                                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-white px-4.5 text-xs font-black backdrop-blur-md transition hover:scale-[1.03] hover:border-red-500/50 hover:text-red-400 active:scale-95 shadow-[0_4px_15px_rgba(0,0,0,0.5)]"
                                                    >
                                                        Cancel Drawing
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDrawingPoints([]);
                                                        setIsDrawingRoute(true);
                                                    }}
                                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-[var(--accent)] px-4.5 text-xs font-black backdrop-blur-md transition hover:scale-[1.03] active:scale-95 shadow-[0_4px_15px_rgba(0,0,0,0.5),_0_0_10px_color-mix(in_srgb,var(--accent)_20%,transparent)]"
                                                >
                                                    <Route className="h-4 w-4" /> Draw Route
                                                </button>
                                            )}
                                            <span className="max-w-[185px] text-right text-[9px] font-bold text-white/90 bg-black/70 px-2.5 py-1.5 rounded-lg border border-white/5 backdrop-blur-md shadow-lg pointer-events-none leading-tight animate-in fade-in duration-300">
                                                {isDrawingRoute 
                                                    ? "Click/touch and drag your finger/mouse multiple times to paint a path, then click Finish."
                                                    : "Draw a line on the map to automatically snap and generate a regional travel queue."
                                                }
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )
                        ) : null}
                    </div>

                    {selectedLocation && (
                        <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 shadow-inner p-4 animate-in fade-in zoom-in-95 duration-300">
                            <p className="mb-3 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Selected Location</p>
                            <p className="mb-4 text-sm font-semibold text-white">{selectedLocation.label}</p>
                             <div className="flex gap-2">
                                {mode === "static" ? (
                                    <>
                                        <button type="button" onClick={() => setBookmarkPromptLocation(selectedLocation)} className={GLASS_BTN_GHOST} title="Save to Bookmarks"><Bookmark className="h-5 w-5" /> Save</button>
                                        <button type="button" onClick={() => {
                                            if (routeActive) setPendingOverride("teleport");
                                            else onTeleport(selectedLocation.lat, selectedLocation.lon, selectedLocation.label);
                                        }} className={PRIMARY_BTN_GHOST}><Navigation className="h-5 w-5 fill-current" /> Teleport Here</button>
                                    </>
                                ) : mode === "dynamic" ? (
                                    <button type="button" onClick={() => {
                                        if (routeActive) setPendingOverride("queue");
                                        else handleSaveStagedToQueue();
                                    }} className={PRIMARY_BTN_GHOST}><ListPlus className="h-5 w-5" /> Add to Queue</button>
                                ) : (
                                    <button type="button" onClick={handleAddStagedToRoute} className={PRIMARY_BTN_GHOST}><Route className="h-5 w-5" /> Add to Route</button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="my-6 border-t border-white/10" />

                {/* -------------------- MODE: STATIC -------------------- */}
                {mode === "static" && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2"><Bookmark className="h-4 w-4" /> Saved Bookmarks</h3>
                        </div>
                        {bookmarks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-8 text-center opacity-60">
                                <Bookmark className="mb-2 h-8 w-8 text-[var(--text-muted)]" />
                                <p className="text-sm font-semibold text-[var(--text-muted)]">No bookmarks yet</p>
                                <p className="text-xs font-medium text-[var(--text-muted)]/70">Stage a location above and hit Save.</p>
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                {bookmarks.map((bookmark) => (
                                    <SwipeableRow key={bookmark.id} onDelete={(comp) => { comp(); onDeleteBookmark(bookmark.id); }}>
                                        <div className="flex h-full w-full items-center justify-between rounded-2xl border border-white/5 bg-black/20 p-4 transition-all hover:bg-black/40">
                                            <div className="min-w-0 pr-4">
                                                <p className="truncate text-sm font-bold text-white mb-0.5">{bookmark.label}</p>
                                                <p className="text-xs font-medium text-[var(--text-muted)]">{bookmark.lat.toFixed(4)}, {bookmark.lon.toFixed(4)}</p>
                                            </div>
                                            <button type="button" onClick={() => onTeleport(bookmark.lat, bookmark.lon, bookmark.label)} className="shrink-0 rounded-xl bg-[color-mix(in_srgb,var(--surface)_80%,black)] border border-[var(--accent)]/50 px-4 py-2 text-xs font-bold text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)] transition-all hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] hover:scale-105 active:scale-95">Teleport</button>
                                        </div>
                                    </SwipeableRow>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* -------------------- MODE: DYNAMIC -------------------- */}
                {mode === "dynamic" && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {/* Dynamic Sub-mode Switcher */}
                        <div className="mb-6 mx-auto grid w-full grid-cols-2 items-center rounded-xl bg-black/40 p-1.5 backdrop-blur-md shadow-inner border border-white/5">
                            <button
                                type="button"
                                onClick={() => setDynamicMode("manual")}
                                className={`relative rounded-lg py-2 text-xs font-bold transition-all duration-300 z-10 flex items-center justify-center gap-1.5 ${dynamicMode === "manual" ? "text-white" : "text-[var(--text-muted)] hover:text-white"}`}
                            >
                                <span className="relative z-20 flex items-center justify-center gap-1.5"><ListPlus className="h-3.5 w-3.5" /> Manual Queue</span>
                                {dynamicMode === "manual" && <div className="absolute inset-0 z-10 rounded-lg bg-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_30%,transparent)]" />}
                            </button>
                            <button
                                type="button"
                                onClick={() => setDynamicMode("country")}
                                className={`relative rounded-lg py-2 text-xs font-bold transition-all duration-300 z-10 flex items-center justify-center gap-1.5 ${dynamicMode === "country" ? "text-white" : "text-[var(--text-muted)] hover:text-white"}`}
                            >
                                <span className="relative z-20 flex items-center justify-center gap-1.5"><Globe className="h-3.5 w-3.5" /> Country Travel</span>
                                {dynamicMode === "country" && <div className="absolute inset-0 z-10 rounded-lg bg-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_30%,transparent)]" />}
                            </button>
                        </div>

                        {/* Country Travel Preset Settings */}
                        {dynamicMode === "country" && (
                            <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-4 shadow-inner backdrop-blur-md flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Designated Country</label>
                                    <SearchableCountrySelector
                                        value={dynamicCountry}
                                        onChange={setDynamicCountry}
                                    />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Movement Strategy</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setDynamicStrategy("random")}
                                            className={`rounded-xl border p-3 text-center transition-all duration-300 flex flex-col items-center justify-center gap-1 ${dynamicStrategy === "random" ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_20%,transparent)]" : "border-white/5 bg-black/20 text-[var(--text-muted)] hover:bg-black/40 hover:text-white"}`}
                                        >
                                            <span className="text-xs font-bold">Randomized</span>
                                            <span className="text-[9px] font-medium opacity-80">City Teleportation</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDynamicStrategy("sequential")}
                                            className={`rounded-xl border p-3 text-center transition-all duration-300 flex flex-col items-center justify-center gap-1 ${dynamicStrategy === "sequential" ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_20%,transparent)]" : "border-white/5 bg-black/20 text-[var(--text-muted)] hover:bg-black/40 hover:text-white"}`}
                                        >
                                            <span className="text-xs font-bold">Sequential</span>
                                            <span className="text-[9px] font-medium opacity-80">Regional Routing</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Standard Queue Dwell Settings */}
                        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 shadow-inner backdrop-blur-md">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)]">
                                    <Timer className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white drop-shadow-sm">Cycle Interval</h3>
                                    <p className="text-xs font-medium text-[var(--text-muted)]">Time spent at each location</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="relative flex items-center rounded-xl border border-[var(--accent)]/40 bg-black/40 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_30%,transparent)] transition-all overflow-hidden">
                                    <input type="number" min={1} value={queueInterval >= 1440 && queueInterval % 1440 === 0 ? queueInterval / 1440 : queueInterval >= 60 && queueInterval % 60 === 0 ? queueInterval / 60 : queueInterval} onChange={(e) => { const val = Math.max(1, Number(e.target.value) || 1); if (queueInterval >= 1440 && queueInterval % 1440 === 0) onChangeInterval(val * 1440); else if (queueInterval >= 60 && queueInterval % 60 === 0) onChangeInterval(val * 60); else onChangeInterval(val); }} className="w-16 bg-transparent py-2.5 pl-3 text-center text-sm font-bold text-white outline-none appearance-none m-0" />
                                    <div className="relative flex h-full items-center border-l border-white/10 bg-[var(--surface)]/50">
                                        <select value={queueInterval >= 1440 && queueInterval % 1440 === 0 ? "days" : queueInterval >= 60 && queueInterval % 60 === 0 ? "hours" : "mins"} onChange={(e) => { const currentNumeric = queueInterval >= 1440 && queueInterval % 1440 === 0 ? queueInterval / 1440 : queueInterval >= 60 && queueInterval % 60 === 0 ? queueInterval / 60 : queueInterval; if (e.target.value === "days") onChangeInterval(currentNumeric * 1440); else if (e.target.value === "hours") onChangeInterval(currentNumeric * 60); else onChangeInterval(currentNumeric); }} className="h-full w-full cursor-pointer appearance-none bg-transparent py-2.5 pl-3 pr-8 text-sm font-bold text-[var(--accent)] outline-none">
                                            <option value="mins" className="bg-[#101216]">Mins</option>
                                            <option value="hours" className="bg-[#101216]">Hours</option>
                                            <option value="days" className="bg-[#101216]">Days</option>
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--accent)]" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tiered Dwell Times Customizer */}
                        <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-4 shadow-inner backdrop-blur-md flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)]">
                                        <Timer className="h-5 w-5 animate-pulse" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-white drop-shadow-sm">Tiered Dwell Times</h3>
                                        <p className="text-xs font-medium text-[var(--text-muted)]">Configure stay duration by city tier</p>
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => setUseTieredDwell(!useTieredDwell)}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${useTieredDwell ? "bg-[var(--accent)]" : "bg-black/50"}`}
                                    >
                                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${useTieredDwell ? "translate-x-5" : "translate-x-0"}`} />
                                    </button>
                                </div>
                            </div>

                            {useTieredDwell && (
                                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-purple-400">Metropolis</span>
                                        <div className="relative flex items-center rounded-xl border border-white/10 bg-black/40">
                                            <DwellTimeInput
                                                value={dwellMetropolis}
                                                onChange={setDwellMetropolis}
                                            />
                                        </div>
                                        <span className="text-[10px] font-bold text-purple-400/80 text-center select-none">{formatDwellTime(dwellMetropolis)}</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-blue-400">Medium</span>
                                        <div className="relative flex items-center rounded-xl border border-white/10 bg-black/40">
                                            <DwellTimeInput
                                                value={dwellMedium}
                                                onChange={setDwellMedium}
                                            />
                                        </div>
                                        <span className="text-[10px] font-bold text-blue-400/80 text-center select-none">{formatDwellTime(dwellMedium)}</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Small</span>
                                        <div className="relative flex items-center rounded-xl border border-white/10 bg-black/40">
                                            <DwellTimeInput
                                                value={dwellSmall}
                                                onChange={setDwellSmall}
                                            />
                                        </div>
                                        <span className="text-[10px] font-bold text-emerald-400/80 text-center select-none">{formatDwellTime(dwellSmall)}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Active Queue Display */}
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2"><ListPlus className="h-4 w-4" /> Active Queue</h3>
                            <div className="flex items-center gap-2">
                                {queue.length > 0 && (
                                    <button type="button" onClick={() => { if (confirmClearQueue) { onClearQueue(); setIsDrawingRoute(false); setConfirmClearQueue(false); } else { setConfirmClearQueue(true); } }} className={`rounded-full px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${confirmClearQueue ? "bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]" : "bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white border border-white/5"}`}>
                                        {confirmClearQueue ? "Are you sure?" : "Clear"}
                                    </button>
                                )}
                                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold tabular-nums text-white">{queue.length} Stops</span>
                            </div>
                        </div>

                        {isSnapping ? (
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--accent)]/30 bg-black/20 p-8 text-center animate-pulse">
                                <Loader2 className="mb-3 h-8 w-8 text-[var(--accent)] animate-spin" />
                                <p className="text-sm font-bold text-white">Snapping Path & Generating Stops...</p>
                                <p className="text-xs font-semibold text-[var(--text-muted)] mt-1">Resolving regional names via Overpass API</p>
                            </div>
                        ) : queue.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-8 text-center opacity-60">
                                <ListPlus className="mb-2 h-8 w-8 text-[var(--text-muted)]" />
                                <p className="text-sm font-semibold text-[var(--text-muted)]">Queue is empty</p>
                                <p className="text-xs font-medium text-[var(--text-muted)]/70">Stage a location above or draw a path on the map.</p>
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                {queue.map((qItem, idx) => {
                                    const isActive = idx === queueIndex && queue.length > 1 && mode === "dynamic";
                                    const isNext = idx === (queueIndex + 1) % queue.length;
                                    const cardStyle = isActive ? "border-[var(--accent)] bg-black/40 shadow-[0_0_15px_color-mix(in_srgb,var(--accent)_20%,transparent)]" : "border-white/5 bg-black/20 hover:bg-black/40";
                                    return (
                                        <SwipeableRow key={qItem.id} onDelete={(comp) => { comp(); onDeleteQueue(qItem.id); }}>
                                            <div className={`flex h-full w-full items-center gap-4 rounded-2xl border p-4 transition-all ${cardStyle}`}>
                                                <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-inner border ${isActive ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)]" : "border-white/10 bg-black/20 text-white"}`}>
                                                    {isActive && <span className="absolute inline-flex h-full w-full animate-ping rounded-full border-2 border-[var(--accent)] opacity-60" />}
                                                    <span className="relative z-10">{idx + 1}</span>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 mb-0.5 min-w-0">
                                                        <p className="truncate text-sm font-bold text-white">{qItem.label}</p>
                                                        {qItem.tier && (
                                                            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider border shrink-0 ${
                                                                qItem.tier === "metropolis" 
                                                                    ? "bg-purple-500/10 text-purple-400 border-purple-500/25" 
                                                                    : qItem.tier === "medium" 
                                                                        ? "bg-blue-500/10 text-blue-400 border-blue-500/25" 
                                                                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                                            }`}>
                                                                {qItem.tier}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-medium text-[var(--text-muted)]">{qItem.lat.toFixed(4)}, {qItem.lon.toFixed(4)}</p>
                                                </div>
                                                {isActive && (
                                                    <div className="shrink-0 flex flex-col items-end">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] drop-shadow-[0_0_5px_var(--accent)]">Active</span>
                                                        <span className="text-xs font-bold tabular-nums tracking-wider text-white">{getRemainingTime()}</span>
                                                    </div>
                                                )}
                                                {!isActive && isNext && queue.length > 1 && mode === "dynamic" && (
                                                    <div className="shrink-0 flex flex-col items-end opacity-60">
                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Up Next</span>
                                                    </div>
                                                )}
                                            </div>
                                        </SwipeableRow>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* -------------------- MODE: ROUTE SIMULATION -------------------- */}
                {mode === "route" && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-4 shadow-inner backdrop-blur-md">
                            <h3 className="mb-3 text-sm font-bold text-white drop-shadow-sm flex items-center gap-2"><Navigation className="h-4 w-4 text-[var(--accent)]" /> Transport Method</h3>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                                {presets.map(p => (
                                    <button 
                                        key={p.id} type="button" 
                                        onClick={() => { onUpdateRouteTransport(p.id); onUpdateRouteSpeed(p.speed); }} 
                                        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2 transition-all ${routeTransport === p.id ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_20%,transparent)]" : "border-white/5 bg-black/20 text-[var(--text-muted)] hover:bg-black/40 hover:text-white"}`}
                                    >
                                        <p.icon className="h-5 w-5" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">{p.id}</span>
                                    </button>
                                ))}
                            </div>
                            
                            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                                <div>
                                    <h4 className="text-xs font-bold text-white">Custom Speed</h4>
                                    <p className="text-[10px] text-[var(--text-muted)]">km/h</p>
                                </div>
                                <input type="number" min={1} value={routeSpeed} onChange={(e) => onUpdateRouteSpeed(Math.max(1, Number(e.target.value) || 1))} className="w-20 rounded-xl border border-white/10 bg-black/40 py-2 text-center text-sm font-bold text-white outline-none focus:border-[var(--accent)]" />
                            </div>
                        </div>

                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2"><Route className="h-4 w-4" /> Waypoints</h3>
                            <div className="flex items-center gap-2">
                                {routeWaypoints.length > 0 && (
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            if (confirmClearRoute) {
                                                onUpdateRouteWaypoints([]);
                                                setConfirmClearRoute(false);
                                            } else {
                                                setConfirmClearRoute(true);
                                            }
                                        }} 
                                        className={`rounded-full px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${confirmClearRoute ? "bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]" : "bg-white/5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white border border-white/5"}`}
                                    >
                                        {confirmClearRoute ? "Are you sure?" : "Clear"}
                                    </button>
                                )}
                                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold tabular-nums text-white">{routeWaypoints.length} Stops</span>
                            </div>
                        </div>

                        {routeWaypoints.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-8 text-center opacity-60">
                                <MapPin className="mb-2 h-8 w-8 text-[var(--text-muted)]" />
                                <p className="text-sm font-semibold text-[var(--text-muted)]">No waypoints</p>
                                <p className="text-xs font-medium text-[var(--text-muted)]/70">Stage locations and add them to build a route.</p>
                            </div>
                        ) : (
                            <div className="grid gap-2 relative">
                                {/* Vertical connector line */}
                                {routeWaypoints.length > 1 && <div className="absolute left-8 top-8 bottom-8 w-0.5 bg-white/10 z-0" />}
                                
                                {routeWaypoints.map((wp, idx) => (
                                    <SwipeableRow key={wp.id} onDelete={(comp) => { comp(); onUpdateRouteWaypoints(routeWaypoints.filter(w => w.id !== wp.id)); }}>
                                        <div className="relative z-10 flex h-full w-full items-center gap-4 rounded-2xl border border-white/5 bg-black/40 p-4 transition-all hover:bg-black/60">
                                            <div className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-inner border ${idx === 0 ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-[var(--accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_40%,transparent)]" : idx === routeWaypoints.length - 1 ? "border-red-500 bg-[color-mix(in_srgb,var(--surface)_80%,black)] text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]" : "border-white/10 bg-black/20 text-white"}`}>
                                                {idx === 0 ? "A" : idx === routeWaypoints.length - 1 ? "B" : idx}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-bold text-white mb-0.5">{wp.label}</p>
                                                <p className="text-xs font-medium text-[var(--text-muted)]">{wp.lat.toFixed(4)}, {wp.lon.toFixed(4)}</p>
                                            </div>
                                        </div>
                                    </SwipeableRow>
                                ))}
                            </div>
                        )}

                        {routeWaypoints.length >= 2 && (
                            <div className="mt-6">
                                {routeActive ? (
                                    <div className="rounded-2xl border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-4 shadow-[0_0_20px_color-mix(in_srgb,var(--accent)_20%,transparent)]">
                                        <div className="mb-4 flex items-center justify-between">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)] drop-shadow-[0_0_5px_var(--accent)] animate-pulse">Simulating Route...</p>
                                                <p className="text-xs font-bold text-white mt-0.5">{routeProgress > 1000 ? `${(routeProgress / 1000).toFixed(1)} km traveled` : `${Math.round(routeProgress)} m traveled`}</p>
                                            </div>
                                            <button type="button" onClick={() => onStopRoute(true)} className="rounded-xl bg-red-500/20 border border-red-500/50 px-4 py-2 text-xs font-bold text-red-400 hover:bg-red-500/40 transition">Stop Route</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button type="button" onClick={onStartRoute} className={PRIMARY_BTN_GHOST}>
                                        <Play className="h-5 w-5 fill-current" /> Fetch & Start Simulation
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <BookmarkPromptDialog 
                location={bookmarkPromptLocation}
                onClose={() => setBookmarkPromptLocation(null)}
                onSave={(name) => {
                    if (bookmarkPromptLocation) onAddBookmark({ id: generateId(), lat: bookmarkPromptLocation.lat, lon: bookmarkPromptLocation.lon, label: name });
                    setBookmarkPromptLocation(null);
                }}
            />

            <ConfirmDialog
                isOpen={pendingModeSwitch !== null}
                title="Stop Route Simulation?"
                message="Switching modes will permanently stop your active route simulation. Your waypoints will be saved."
                confirmLabel="Stop & Switch"
                cancelLabel="Cancel"
                confirmTone="danger"
                onConfirm={() => {
                    if (pendingModeSwitch) {
                        onStopRoute(true);
                        onModeChange(pendingModeSwitch);
                        setPendingModeSwitch(null);
                    }
                }}
                onCancel={() => setPendingModeSwitch(null)}
            />

            <ConfirmDialog
                isOpen={pendingOverride !== null}
                title="Stop Route Simulation?"
                message="Using this feature will permanently stop your active route simulation. Your waypoints will be saved."
                confirmLabel="Stop & Continue"
                cancelLabel="Cancel"
                confirmTone="danger"
                onConfirm={() => {
                    onStopRoute(true); // True = clear the blue line but keep waypoints
                    if (pendingOverride === "teleport" && selectedLocation) {
                        onTeleport(selectedLocation.lat, selectedLocation.lon, selectedLocation.label);
                    } else if (pendingOverride === "queue") {
                        handleSaveStagedToQueue();
                    }
                    setPendingOverride(null);
                }}
                onCancel={() => setPendingOverride(null)}
            />
        </div>
    );
}