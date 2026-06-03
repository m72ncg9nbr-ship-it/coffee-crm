/**
 * Turkey Province → Geographic Region mapping (client-side copy)
 * 81 provinces mapped to 7 geographic regions.
 * Keep in sync with artifacts/api-server/src/lib/turkey-regions.ts
 */

export type TurkeyRegion =
  | "Marmara"
  | "Ege"
  | "Akdeniz"
  | "İç Anadolu"
  | "Karadeniz"
  | "Doğu Anadolu"
  | "Güneydoğu Anadolu";

export const TURKEY_REGIONS: TurkeyRegion[] = [
  "Marmara",
  "Ege",
  "Akdeniz",
  "İç Anadolu",
  "Karadeniz",
  "Doğu Anadolu",
  "Güneydoğu Anadolu",
];

// Keys are lowercase for case-insensitive lookup
const PROVINCE_TO_REGION: Record<string, TurkeyRegion> = {
  // Marmara
  "istanbul":      "Marmara",
  "bursa":         "Marmara",
  "kocaeli":       "Marmara",
  "tekirdağ":      "Marmara",
  "tekirdag":      "Marmara",
  "balıkesir":     "Marmara",
  "balikesir":     "Marmara",
  "çanakkale":     "Marmara",
  "canakkale":     "Marmara",
  "edirne":        "Marmara",
  "kırklareli":    "Marmara",
  "kirklareli":    "Marmara",
  "sakarya":       "Marmara",
  "yalova":        "Marmara",
  "bilecik":       "Marmara",

  // Ege
  "izmir":         "Ege",
  "manisa":        "Ege",
  "aydın":         "Ege",
  "aydin":         "Ege",
  "denizli":       "Ege",
  "muğla":         "Ege",
  "mugla":         "Ege",
  "uşak":          "Ege",
  "usak":          "Ege",
  "afyonkarahisar":"Ege",
  "afyon":         "Ege",
  "kütahya":       "Ege",
  "kutahya":       "Ege",

  // Akdeniz
  "antalya":       "Akdeniz",
  "mersin":        "Akdeniz",
  "adana":         "Akdeniz",
  "hatay":         "Akdeniz",
  "kahramanmaraş": "Akdeniz",
  "kahramanmaras": "Akdeniz",
  "isparta":       "Akdeniz",
  "burdur":        "Akdeniz",
  "osmaniye":      "Akdeniz",

  // İç Anadolu
  "ankara":        "İç Anadolu",
  "konya":         "İç Anadolu",
  "kayseri":       "İç Anadolu",
  "eskişehir":     "İç Anadolu",
  "eskisehir":     "İç Anadolu",
  "sivas":         "İç Anadolu",
  "yozgat":        "İç Anadolu",
  "kırşehir":      "İç Anadolu",
  "kirsehir":      "İç Anadolu",
  "aksaray":       "İç Anadolu",
  "nevşehir":      "İç Anadolu",
  "nevsehir":      "İç Anadolu",
  "niğde":         "İç Anadolu",
  "nigde":         "İç Anadolu",
  "karaman":       "İç Anadolu",
  "kırıkkale":     "İç Anadolu",
  "kirikkale":     "İç Anadolu",
  "çankırı":       "İç Anadolu",
  "cankiri":       "İç Anadolu",

  // Karadeniz
  "trabzon":       "Karadeniz",
  "samsun":        "Karadeniz",
  "ordu":          "Karadeniz",
  "giresun":       "Karadeniz",
  "rize":          "Karadeniz",
  "artvin":        "Karadeniz",
  "zonguldak":     "Karadeniz",
  "bartın":        "Karadeniz",
  "bartin":        "Karadeniz",
  "karabük":       "Karadeniz",
  "karabuk":       "Karadeniz",
  "kastamonu":     "Karadeniz",
  "sinop":         "Karadeniz",
  "amasya":        "Karadeniz",
  "tokat":         "Karadeniz",
  "çorum":         "Karadeniz",
  "corum":         "Karadeniz",
  "bolu":          "Karadeniz",
  "düzce":         "Karadeniz",
  "duzce":         "Karadeniz",

  // Doğu Anadolu
  "erzurum":       "Doğu Anadolu",
  "erzincan":      "Doğu Anadolu",
  "kars":          "Doğu Anadolu",
  "ardahan":       "Doğu Anadolu",
  "ağrı":          "Doğu Anadolu",
  "agri":          "Doğu Anadolu",
  "muş":           "Doğu Anadolu",
  "mus":           "Doğu Anadolu",
  "bitlis":        "Doğu Anadolu",
  "van":           "Doğu Anadolu",
  "hakkari":       "Doğu Anadolu",
  "iğdır":         "Doğu Anadolu",
  "igdir":         "Doğu Anadolu",
  "elazığ":        "Doğu Anadolu",
  "elazig":        "Doğu Anadolu",
  "malatya":       "Doğu Anadolu",
  "bingöl":        "Doğu Anadolu",
  "bingol":        "Doğu Anadolu",
  "tunceli":       "Doğu Anadolu",

  // Güneydoğu Anadolu
  "diyarbakır":    "Güneydoğu Anadolu",
  "diyarbakir":    "Güneydoğu Anadolu",
  "şanlıurfa":     "Güneydoğu Anadolu",
  "sanliurfa":     "Güneydoğu Anadolu",
  "urfa":          "Güneydoğu Anadolu",
  "gaziantep":     "Güneydoğu Anadolu",
  "adıyaman":      "Güneydoğu Anadolu",
  "adiyaman":      "Güneydoğu Anadolu",
  "mardin":        "Güneydoğu Anadolu",
  "siirt":         "Güneydoğu Anadolu",
  "şırnak":        "Güneydoğu Anadolu",
  "sirnak":        "Güneydoğu Anadolu",
  "batman":        "Güneydoğu Anadolu",
  "kilis":         "Güneydoğu Anadolu",
};

export function getRegionForCity(city: string | null | undefined): TurkeyRegion | null {
  if (!city) return null;
  const key = city.trim().toLowerCase();
  return PROVINCE_TO_REGION[key] ?? PROVINCE_TO_REGION[city.trim()] ?? null;
}
