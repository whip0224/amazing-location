import { useState, useRef, useEffect, useCallback } from 'react';
import { useCityTranslations } from './hooks/useCityTranslations';
import { getChineseNameByCoords } from './utils/geonamesApi';

// 計算兩點經緯度直線距離的公式 (回傳單位：公里)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// 格式化距離顯示 (例如：450m 或 1.2km)
const formatDistance = (distanceKm: number) => {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  }
  return `${distanceKm.toFixed(1)}km`;
};

const DEFAULT_CUSTOM_FOLDERS = ['待去', '已去', '行程規劃'] as const;

const FOLDER_ICON_MAP: Record<string, string> = {
  待去: '📌',
  已去: '✅',
  行程規劃: '🗓️',
};

const getFolderIcon = (folder: string) => FOLDER_ICON_MAP[folder] || '📁';

const FOLDER_COLOR_OPTIONS = [
  {
    id: 'indigo',
    label: '靛藍',
    dot: 'bg-indigo-500',
    swatchRing: 'ring-indigo-500',
    tabActive: 'bg-indigo-600 text-white shadow-xs',
    tabInactive: 'bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100 ring-1 ring-indigo-200/70',
    tabBadgeActive: 'bg-indigo-500 text-white',
    tabBadgeInactive: 'bg-white text-indigo-600',
    tabCloseActive: 'bg-indigo-700 text-indigo-100 hover:bg-indigo-800 border-indigo-500',
    tabCloseInactive: 'bg-indigo-50/80 text-indigo-400 hover:text-rose-600 hover:bg-rose-50 border-indigo-200/70 ring-1 ring-indigo-200/70',
    badge: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/80 hover:bg-indigo-100',
    chipSelected: 'bg-indigo-600 text-white border-indigo-600 shadow-xs',
    chipUnselected: 'bg-white text-gray-600 border-gray-200 hover:bg-indigo-50',
    pickerSelected: 'bg-indigo-50 border-indigo-400 text-indigo-700',
    pickerPartial: 'bg-indigo-50/40 border-indigo-200 text-indigo-700',
  },
  {
    id: 'amber',
    label: '琥珀',
    dot: 'bg-amber-500',
    swatchRing: 'ring-amber-500',
    tabActive: 'bg-amber-500 text-white shadow-xs',
    tabInactive: 'bg-amber-50/80 text-amber-800 hover:bg-amber-100 ring-1 ring-amber-200/80',
    tabBadgeActive: 'bg-amber-400 text-white',
    tabBadgeInactive: 'bg-white text-amber-700',
    tabCloseActive: 'bg-amber-600 text-amber-100 hover:bg-amber-700 border-amber-400',
    tabCloseInactive: 'bg-amber-50/80 text-amber-400 hover:text-rose-600 hover:bg-rose-50 border-amber-200/80 ring-1 ring-amber-200/80',
    badge: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200/80 hover:bg-amber-100',
    chipSelected: 'bg-amber-500 text-white border-amber-500 shadow-xs',
    chipUnselected: 'bg-white text-gray-600 border-gray-200 hover:bg-amber-50',
    pickerSelected: 'bg-amber-50 border-amber-400 text-amber-800',
    pickerPartial: 'bg-amber-50/40 border-amber-200 text-amber-800',
  },
  {
    id: 'emerald',
    label: '翠綠',
    dot: 'bg-emerald-500',
    swatchRing: 'ring-emerald-500',
    tabActive: 'bg-emerald-600 text-white shadow-xs',
    tabInactive: 'bg-emerald-50/80 text-emerald-700 hover:bg-emerald-100 ring-1 ring-emerald-200/70',
    tabBadgeActive: 'bg-emerald-500 text-white',
    tabBadgeInactive: 'bg-white text-emerald-600',
    tabCloseActive: 'bg-emerald-700 text-emerald-100 hover:bg-emerald-800 border-emerald-500',
    tabCloseInactive: 'bg-emerald-50/80 text-emerald-400 hover:text-rose-600 hover:bg-rose-50 border-emerald-200/70 ring-1 ring-emerald-200/70',
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80 hover:bg-emerald-100',
    chipSelected: 'bg-emerald-600 text-white border-emerald-600 shadow-xs',
    chipUnselected: 'bg-white text-gray-600 border-gray-200 hover:bg-emerald-50',
    pickerSelected: 'bg-emerald-50 border-emerald-400 text-emerald-700',
    pickerPartial: 'bg-emerald-50/40 border-emerald-200 text-emerald-700',
  },
  {
    id: 'sky',
    label: '天藍',
    dot: 'bg-sky-500',
    swatchRing: 'ring-sky-500',
    tabActive: 'bg-sky-600 text-white shadow-xs',
    tabInactive: 'bg-sky-50/80 text-sky-700 hover:bg-sky-100 ring-1 ring-sky-200/70',
    tabBadgeActive: 'bg-sky-500 text-white',
    tabBadgeInactive: 'bg-white text-sky-600',
    tabCloseActive: 'bg-sky-700 text-sky-100 hover:bg-sky-800 border-sky-500',
    tabCloseInactive: 'bg-sky-50/80 text-sky-400 hover:text-rose-600 hover:bg-rose-50 border-sky-200/70 ring-1 ring-sky-200/70',
    badge: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/80 hover:bg-sky-100',
    chipSelected: 'bg-sky-600 text-white border-sky-600 shadow-xs',
    chipUnselected: 'bg-white text-gray-600 border-gray-200 hover:bg-sky-50',
    pickerSelected: 'bg-sky-50 border-sky-400 text-sky-700',
    pickerPartial: 'bg-sky-50/40 border-sky-200 text-sky-700',
  },
  {
    id: 'rose',
    label: '莓紅',
    dot: 'bg-rose-500',
    swatchRing: 'ring-rose-500',
    tabActive: 'bg-rose-600 text-white shadow-xs',
    tabInactive: 'bg-rose-50/80 text-rose-700 hover:bg-rose-100 ring-1 ring-rose-200/70',
    tabBadgeActive: 'bg-rose-500 text-white',
    tabBadgeInactive: 'bg-white text-rose-600',
    tabCloseActive: 'bg-rose-700 text-rose-100 hover:bg-rose-800 border-rose-500',
    tabCloseInactive: 'bg-rose-50/80 text-rose-400 hover:text-rose-600 hover:bg-rose-50 border-rose-200/70 ring-1 ring-rose-200/70',
    badge: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/80 hover:bg-rose-100',
    chipSelected: 'bg-rose-600 text-white border-rose-600 shadow-xs',
    chipUnselected: 'bg-white text-gray-600 border-gray-200 hover:bg-rose-50',
    pickerSelected: 'bg-rose-50 border-rose-400 text-rose-700',
    pickerPartial: 'bg-rose-50/40 border-rose-200 text-rose-700',
  },
  {
    id: 'violet',
    label: '紫羅蘭',
    dot: 'bg-violet-500',
    swatchRing: 'ring-violet-500',
    tabActive: 'bg-violet-600 text-white shadow-xs',
    tabInactive: 'bg-violet-50/80 text-violet-700 hover:bg-violet-100 ring-1 ring-violet-200/70',
    tabBadgeActive: 'bg-violet-500 text-white',
    tabBadgeInactive: 'bg-white text-violet-600',
    tabCloseActive: 'bg-violet-700 text-violet-100 hover:bg-violet-800 border-violet-500',
    tabCloseInactive: 'bg-violet-50/80 text-violet-400 hover:text-rose-600 hover:bg-rose-50 border-violet-200/70 ring-1 ring-violet-200/70',
    badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/80 hover:bg-violet-100',
    chipSelected: 'bg-violet-600 text-white border-violet-600 shadow-xs',
    chipUnselected: 'bg-white text-gray-600 border-gray-200 hover:bg-violet-50',
    pickerSelected: 'bg-violet-50 border-violet-400 text-violet-700',
    pickerPartial: 'bg-violet-50/40 border-violet-200 text-violet-700',
  },
  {
    id: 'teal',
    label: '青綠',
    dot: 'bg-teal-500',
    swatchRing: 'ring-teal-500',
    tabActive: 'bg-teal-600 text-white shadow-xs',
    tabInactive: 'bg-teal-50/80 text-teal-700 hover:bg-teal-100 ring-1 ring-teal-200/70',
    tabBadgeActive: 'bg-teal-500 text-white',
    tabBadgeInactive: 'bg-white text-teal-600',
    tabCloseActive: 'bg-teal-700 text-teal-100 hover:bg-teal-800 border-teal-500',
    tabCloseInactive: 'bg-teal-50/80 text-teal-400 hover:text-rose-600 hover:bg-rose-50 border-teal-200/70 ring-1 ring-teal-200/70',
    badge: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200/80 hover:bg-teal-100',
    chipSelected: 'bg-teal-600 text-white border-teal-600 shadow-xs',
    chipUnselected: 'bg-white text-gray-600 border-gray-200 hover:bg-teal-50',
    pickerSelected: 'bg-teal-50 border-teal-400 text-teal-700',
    pickerPartial: 'bg-teal-50/40 border-teal-200 text-teal-700',
  },
  {
    id: 'orange',
    label: '橘紅',
    dot: 'bg-orange-500',
    swatchRing: 'ring-orange-500',
    tabActive: 'bg-orange-500 text-white shadow-xs',
    tabInactive: 'bg-orange-50/80 text-orange-700 hover:bg-orange-100 ring-1 ring-orange-200/70',
    tabBadgeActive: 'bg-orange-400 text-white',
    tabBadgeInactive: 'bg-white text-orange-600',
    tabCloseActive: 'bg-orange-600 text-orange-100 hover:bg-orange-700 border-orange-400',
    tabCloseInactive: 'bg-orange-50/80 text-orange-400 hover:text-rose-600 hover:bg-rose-50 border-orange-200/70 ring-1 ring-orange-200/70',
    badge: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200/80 hover:bg-orange-100',
    chipSelected: 'bg-orange-500 text-white border-orange-500 shadow-xs',
    chipUnselected: 'bg-white text-gray-600 border-gray-200 hover:bg-orange-50',
    pickerSelected: 'bg-orange-50 border-orange-400 text-orange-700',
    pickerPartial: 'bg-orange-50/40 border-orange-200 text-orange-700',
  },
] as const;

type FolderColorId = (typeof FOLDER_COLOR_OPTIONS)[number]['id'];

const DEFAULT_FOLDER_COLOR_MAP: Record<string, FolderColorId> = {
  待去: 'amber',
  已去: 'emerald',
  行程規劃: 'indigo',
};

const getFolderColorOption = (colorId?: string) =>
  FOLDER_COLOR_OPTIONS.find(c => c.id === colorId) || FOLDER_COLOR_OPTIONS[0];

const PRESET_CATEGORY_TAGS = [
  { label: '飲食', icon: '🍽️' },
  { label: '景點', icon: '🏛️' },
  { label: '購物', icon: '🛍️' },
] as const;

const PRESET_CATEGORY_LABELS: readonly string[] = PRESET_CATEGORY_TAGS.map(t => t.label);

const parseTagInput = (raw: string): string[] =>
  Array.from(
    new Set(
      raw
        .split(/[,，]/)
        .map(t => t.replace(/^#/, '').trim())
        .filter(Boolean)
    )
  );

const toggleTagInString = (raw: string, tagLabel: string): string => {
  const tags = parseTagInput(raw);
  const exists = tags.includes(tagLabel);
  const nextTags = exists ? tags.filter(t => t !== tagLabel) : [tagLabel, ...tags];
  return nextTags.join(', ');
};

const TAIWAN_CITY_REGEX =
  /(臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)/;

const TAIWAN_VILLAGE_SUFFIX_REGEX = /[里村鄰]$/;

const isTaiwanAddressOrComponents = (
  components: { longText: string; types?: string[] }[] = [],
  formattedAddress = ''
) => {
  const country = components.find(c => c.types?.includes('country'))?.longText || '';
  if (country.includes('台灣') || country.includes('臺灣') || country.toLowerCase() === 'taiwan') {
    return true;
  }
  return (
    formattedAddress.includes('台灣') ||
    formattedAddress.includes('臺灣') ||
    /\bTaiwan\b/i.test(formattedAddress) ||
    TAIWAN_CITY_REGEX.test(formattedAddress)
  );
};

const extractTaiwanCityAndDistrict = (
  components: { longText: string; types?: string[] }[] = [],
  formattedAddress = ''
): { city: string; district: string } => {
  const safeComponents = Array.isArray(components) ? components : [];
  let city: string;
  let district = '';

  const level1 = safeComponents.find(c => c.types?.includes('administrative_area_level_1'))?.longText?.trim() || '';
  const level2 = safeComponents.find(c => c.types?.includes('administrative_area_level_2'))?.longText?.trim() || '';

  if (level1 && !level1.includes('台灣省') && !level1.includes('臺灣省') && !level1.includes('福建省')) {
    city = level1;
  } else if (level2) {
    city = level2;
  } else {
    city = safeComponents.find(c => c.types?.includes('locality'))?.longText?.trim() || '';
  }

  const candidateTypes = [
    'administrative_area_level_2',
    'administrative_area_level_3',
    'sublocality_level_1',
    'locality',
  ];

  for (const type of candidateTypes) {
    const match = safeComponents.find(c => c.types?.includes(type))?.longText?.trim();
    if (
      match &&
      match !== city &&
      !TAIWAN_VILLAGE_SUFFIX_REGEX.test(match) &&
      !match.includes('省') &&
      /[區鎮鄉市]$/.test(match)
    ) {
      district = match;
      break;
    }
  }

  const addr = formattedAddress.trim();
  if (addr) {
    const cityMatch = addr.match(TAIWAN_CITY_REGEX);
    if (!city && cityMatch) {
      city = cityMatch[1];
    }
    if (!district) {
      const distMatch = addr.match(
        /(?:臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)\s*([^\d\s號樓路街巷弄里村鄰]{1,5}?[區鎮鄉市])/
      );
      if (distMatch && distMatch[1]) {
        district = distMatch[1].trim();
      }
    }
  }

  return { city, district };
};

// --- 資料結構 ---
interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  addressComponents?: {
    longText: string;
    types?: string[];
  }[];
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: {
    openNow: boolean;
    weekdayDescriptions: string[];
  };
  customName?: string;
  customCity?: string;
  customArea?: string;
  customTags?: string[];
  customNote?: string;
  note?: string;
  notes?: string;
  isFavorite?: boolean;
  lists?: string[];
}

const normalizePlaceData = (place: GooglePlace): GooglePlace => {
  const components = Array.isArray(place.addressComponents) ? place.addressComponents : [];
  const addr = place.formattedAddress || '';
  let nextCustomCity = place.customCity;
  let nextCustomArea = place.customArea;

  if (isTaiwanAddressOrComponents(components, addr)) {
    const { city, district } = extractTaiwanCityAndDistrict(components, addr);
    if (nextCustomCity && (nextCustomCity.includes('台灣省') || nextCustomCity.includes('臺灣省')) && city) {
      nextCustomCity = city;
    }
    if (
      district &&
      (!nextCustomArea ||
        nextCustomArea === '未分類區域' ||
        TAIWAN_VILLAGE_SUFFIX_REGEX.test(nextCustomArea.trim()))
    ) {
      nextCustomArea = district;
    }
  }

  return {
    ...place,
    customCity: nextCustomCity,
    customArea: nextCustomArea,
    isFavorite: Boolean(place.isFavorite),
    lists: Array.isArray(place.lists)
      ? Array.from(new Set(place.lists.map(l => String(l).trim()).filter(Boolean)))
      : [],
  };
};

interface ExtractedCandidateItem {
  key: string;
  extractedName: string;
  searchQuery: string;
  hintCity: string;
  hintArea: string;
  tags: string[];
  note: string;
  matchedPlace: GooglePlace | null;
  matchStatus: 'matched' | 'not_found' | 'already_saved';
  selected: boolean;
}

export default function App() {
  // 🌟 1. 呼叫翻譯 Hook，取得從 Google Sheet 來的翻譯資料 (作為離線／備援機制)
  const { translations } = useCityTranslations();

  const [activeTab, setActiveTab] = useState<'search' | 'list'>('search');
  const [searchMode, setSearchMode] = useState<'keyword' | 'ai_extract'>('keyword');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<GooglePlace[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<GooglePlace | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ✨ Gemini 智能擷取景點狀態
  const [extractText, setExtractText] = useState('');
  const [extractImagePreview, setExtractImagePreview] = useState<string | null>(null);
  const [extractImageData, setExtractImageData] = useState<{ base64: string; mimeType: string } | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedItems, setExtractedItems] = useState<ExtractedCandidateItem[]>([]);
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const extractImageInputRef = useRef<HTMLInputElement>(null);

  const [savedPlaces, setSavedPlaces] = useState<GooglePlace[]>(() => {
    try {
      const localData = localStorage.getItem('amazing_locations');
      const parsed = localData ? JSON.parse(localData) : [];
      if (!Array.isArray(parsed)) return [];
      const normalized = parsed.map((p: GooglePlace) => normalizePlaceData(p));
      localStorage.setItem('amazing_locations', JSON.stringify(normalized));
      return normalized;
    } catch {
      return [];
    }
  });
  const [customFolders, setCustomFolders] = useState<string[]>(() => {
    try {
      const savedFoldersRaw = localStorage.getItem('amazing_custom_folders');
      const parsedFolders: string[] = savedFoldersRaw ? JSON.parse(savedFoldersRaw) : [];
      const localPlacesRaw = localStorage.getItem('amazing_locations');
      const parsedPlaces: GooglePlace[] = localPlacesRaw ? JSON.parse(localPlacesRaw) : [];
      const foldersFromPlaces = Array.isArray(parsedPlaces)
        ? parsedPlaces.flatMap(p => (Array.isArray(p.lists) ? p.lists : []))
        : [];
      return Array.from(
        new Set([
          ...DEFAULT_CUSTOM_FOLDERS,
          ...(Array.isArray(parsedFolders) ? parsedFolders : []),
          ...foldersFromPlaces,
        ])
      ).filter(Boolean);
    } catch {
      return [...DEFAULT_CUSTOM_FOLDERS];
    }
  });
  const [folderColors, setFolderColors] = useState<Record<string, FolderColorId>>(() => {
    try {
      const raw = localStorage.getItem('amazing_folder_colors');
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        ...DEFAULT_FOLDER_COLOR_MAP,
        ...(parsed && typeof parsed === 'object' ? parsed : {}),
      };
    } catch {
      return { ...DEFAULT_FOLDER_COLOR_MAP };
    }
  });
  const [activeCollectionView, setActiveCollectionView] = useState<string>('all');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState<FolderColorId>('sky');
  const [showFolderSettingsModal, setShowFolderSettingsModal] = useState(false);
  const [folderPickerTarget, setFolderPickerTarget] = useState<string | null>(null);
  const [saveIsFavorite, setSaveIsFavorite] = useState(false);
  const [saveFolderSelection, setSaveFolderSelection] = useState<string[]>([]);
  const [saveTagsInput, setSaveTagsInput] = useState('');

  const [listSearchQuery, setListSearchQuery] = useState('');
  const [selectedCountryTab, setSelectedCountryTab] = useState<string>('全部');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isTagCloudOpen, setIsTagCloudOpen] = useState(false);
  const [areaSortMap, setAreaSortMap] = useState<Record<string, 'default' | 'name' | 'rating' | 'distance'>>({});
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [expandedCards, setExpandedCards] = useState<string[]>([]);
  const [centerId, setCenterId] = useState<string | null>(null);
  const [nearbyIds, setNearbyIds] = useState<string[]>([]);
  const [isExportMode, setIsExportMode] = useState(false);
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);
  const [isDeleteSelectMode, setIsDeleteSelectMode] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<string[]>([]);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [toastNotice, setToastNotice] = useState<string | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [geminiStatusReason, setGeminiStatusReason] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastNotice(msg);
    window.setTimeout(() => {
      setToastNotice(prev => (prev === msg ? null : prev));
    }, 4000);
  };

  const refreshGeminiStatus = useCallback(async (showFeedback = false) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setGeminiStatus('offline');
      setGeminiStatusReason('裝置目前無網路連線');
      if (showFeedback) showToast('🔴 Gemini 離線：裝置目前無網路連線');
      return;
    }

    if (showFeedback) {
      setGeminiStatus('checking');
    }

    try {
      const res = await fetch('/api/gemini', { cache: 'no-store' });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const reason = `後端端點未回傳 JSON (HTTP ${res.status})，請確認 Vercel 已重新部署或清除舊 PWA 快取`;
        setGeminiStatus('offline');
        setGeminiStatusReason(reason);
        if (showFeedback) showToast(`🔴 Gemini 離線：${reason}`);
        return;
      }

      const data = await res.json();
      if (res.ok && data?.online) {
        setGeminiStatus('online');
        setGeminiStatusReason(null);
        if (showFeedback) showToast('🟢 Gemini 已連線（在線）');
      } else {
        const reason = data?.reason || `HTTP ${res.status}`;
        setGeminiStatus('offline');
        setGeminiStatusReason(reason);
        if (showFeedback) showToast(`🔴 Gemini 離線：${reason}`);
      }
    } catch {
      setGeminiStatus('offline');
      setGeminiStatusReason('無法連線至後端 /api/gemini');
      if (showFeedback) showToast('🔴 Gemini 離線：無法連線至後端伺服器');
    }
  }, []);

  useEffect(() => {
    let active = true;

    const runInitialCheck = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (active) {
          setGeminiStatus('offline');
          setGeminiStatusReason('裝置目前無網路連線');
        }
        return;
      }
      try {
        const res = await fetch('/api/gemini', { cache: 'no-store' });
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          if (active) {
            setGeminiStatus('offline');
            setGeminiStatusReason(`後端端點未回傳 JSON (HTTP ${res.status})，請確認 Vercel 已重新部署或清除舊快取`);
          }
          return;
        }
        const data = await res.json();
        if (!active) return;
        if (res.ok && data?.online) {
          setGeminiStatus('online');
          setGeminiStatusReason(null);
        } else {
          setGeminiStatus('offline');
          setGeminiStatusReason(data?.reason || `HTTP ${res.status}`);
        }
      } catch {
        if (active) {
          setGeminiStatus('offline');
          setGeminiStatusReason('無法連線至後端 /api/gemini');
        }
      }
    };

    const handleOnline = () => {
      void refreshGeminiStatus(false);
    };
    const handleOffline = () => {
      setGeminiStatus('offline');
      setGeminiStatusReason('裝置目前無網路連線');
    };

    void runInitialCheck();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      active = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshGeminiStatus]);

  const persistPlaces = (updatedPlaces: GooglePlace[]) => {
    setSavedPlaces(updatedPlaces);
    localStorage.setItem('amazing_locations', JSON.stringify(updatedPlaces));
  };

  const persistFolders = (updatedFolders: string[]) => {
    const merged = Array.from(new Set([...DEFAULT_CUSTOM_FOLDERS, ...updatedFolders])).filter(Boolean);
    setCustomFolders(merged);
    localStorage.setItem('amazing_custom_folders', JSON.stringify(merged));
  };

  const persistFolderColors = (nextColors: Record<string, FolderColorId>) => {
    setFolderColors(nextColors);
    localStorage.setItem('amazing_folder_colors', JSON.stringify(nextColors));
  };

  const getFolderColor = (folderName: string) =>
    getFolderColorOption(folderColors[folderName] || DEFAULT_FOLDER_COLOR_MAP[folderName] || 'indigo');

  const updateFolderColor = (folderName: string, colorId: FolderColorId) => {
    const nextColors = { ...folderColors, [folderName]: colorId };
    persistFolderColors(nextColors);
  };

  // 📝 紀錄三層分類的折疊狀態
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({});
  const [expandedCities, setExpandedCities] = useState<Record<string, boolean>>({});
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({});

  const toggleRegion = (region: string) => setExpandedRegions(prev => ({ ...prev, [region]: !prev[region] }));
  const toggleCity = (cityKey: string) => setExpandedCities(prev => ({ ...prev, [cityKey]: !prev[cityKey] }));
  const toggleArea = (areaKey: string) => setExpandedAreas(prev => ({ ...prev, [areaKey]: !prev[areaKey] }));

  // --- 📝 編輯功能狀態 ---
  const [editingPlace, setEditingPlace] = useState<GooglePlace | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    city: '',
    area: '',
    tags: '',
    note: '',
    isFavorite: false,
    lists: [] as string[],
  });
  const [isAiClassifyingEdit, setIsAiClassifyingEdit] = useState(false);

  // 🌟 2. 升級版：自動抓取並搭配 Google Sheet 的資料進行翻譯比對（含台灣區名修正，避免抓到里/村/鄰）
  const getCountryCityArea = (
    components: GooglePlace['addressComponents'] = [],
    formattedAddress = ''
  ) => {
    const safeComponents = Array.isArray(components) ? components : [];

    const country = safeComponents.find(c => c.types?.includes('country'))?.longText || '';

    const normalizedCountry = country.includes('台灣') || country.includes('臺灣') || country === 'Taiwan' ? '🇹🇼 台灣' :
                              country.includes('日本') || country === 'Japan' ? '🇯🇵 日本' :
                              country.includes('韓國') || country === 'South Korea' ? '🇰🇷 韓國' :
                              country || '🌍 其他地區';

    let city = '';
    let area = '';

    if (normalizedCountry === '🇹🇼 台灣' || isTaiwanAddressOrComponents(safeComponents, formattedAddress)) {
      const tw = extractTaiwanCityAndDistrict(safeComponents, formattedAddress);
      city = tw.city;
      area = tw.district;
    }

    if (!city) {
      city = safeComponents.find(c =>
        c.types?.includes('administrative_area_level_1') ||
        c.types?.includes('locality')
      )?.longText || '';
    }

    if (!area) {
      // 設定嚴格的優先層級 (優先找「區」，找不到再找「町/商圈」)
      area =
        safeComponents.find(c => c.types?.includes('sublocality_level_1'))?.longText ||
        safeComponents.find(c => c.types?.includes('sublocality_level_2'))?.longText ||
        safeComponents.find(c => c.types?.includes('neighborhood'))?.longText ||
        safeComponents.find(c => c.types?.includes('administrative_area_level_2'))?.longText ||
        safeComponents.find(c => c.types?.includes('administrative_area_level_3'))?.longText ||
        '';
    }

    // 使用 Google Sheet 抓回來的 translations 狀態進行字串取代
    Object.keys(translations).forEach(key => {
      const zhTwName = translations[key]?.['zh-TW'];
      const enName = translations[key]?.['en'] || key;

      if (zhTwName) {
        if (city.includes(enName)) city = city.replace(enName, zhTwName).trim();
        if (area.includes(enName)) area = area.replace(enName, zhTwName).trim();

        if (city.toLowerCase().includes(key.toLowerCase())) city = city.replace(new RegExp(key, 'i'), zhTwName).trim();
        if (area.toLowerCase().includes(key.toLowerCase())) area = area.replace(new RegExp(key, 'i'), zhTwName).trim();
      }
    });

    return {
      country: normalizedCountry,
      city: city || '未分類城市',
      area: area || '未分類區域'
    };
  };

  // 共用：解析並翻譯城市與區域 (Google Sheet + GeoNames 雙層防護)
  const resolveTranslatedCityAndArea = async (place: GooglePlace) => {
    const autoLocation = getCountryCityArea(place.addressComponents || [], place.formattedAddress || '');
    const isTaiwan = autoLocation.country === '🇹🇼 台灣';
    let finalCityName = place.customCity || autoLocation.city;
    const rawArea =
      place.customArea && !(isTaiwan && TAIWAN_VILLAGE_SUFFIX_REGEX.test(place.customArea.trim()))
        ? place.customArea
        : autoLocation.area;
    let finalAreaName = rawArea;

    // 城市檢查 Google Sheet
    const cityKey = finalCityName.toLowerCase();
    if (translations[cityKey] && translations[cityKey]['zh-TW']) {
      finalCityName = translations[cityKey]['zh-TW'];
    }

    // 區域檢查：【第一層防護：查詢 Google Sheet】
    const searchKey = rawArea.toLowerCase();
    if (translations[searchKey] && translations[searchKey]['zh-TW']) {
      finalAreaName = translations[searchKey]['zh-TW'];
    }
    // 【第二層防護：查詢 GeoNames】
    else if (
      (!place.customArea || rawArea === '未分類區域' || !/[\u4e00-\u9fa5]/.test(rawArea)) &&
      place.location?.latitude &&
      place.location?.longitude
    ) {
      const geoName = await getChineseNameByCoords(place.location.latitude, place.location.longitude);
      if (geoName) {
        const geoSearchKey = geoName.toLowerCase();
        finalAreaName = (translations[geoSearchKey] && translations[geoSearchKey]['zh-TW'])
          ? translations[geoSearchKey]['zh-TW']
          : geoName;
      }
    }

    return {
      city: finalCityName || '未分類城市',
      area: finalAreaName || '未分類區域',
    };
  };

  // ✨ 呼叫伺服器端 Gemini API 進行免維護「自動中文城市 + 商圈分類 & 自動打標籤」
  const classifyPlaceWithGeminiApi = async (
    place: GooglePlace
  ): Promise<{ city: string; area: string; tags: string[]; usedGemini: boolean; errorMessage?: string }> => {
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'classify',
          name: place.customName || place.displayName?.text || '',
          address: place.formattedAddress || '',
          addressComponents: place.addressComponents || [],
        }),
      });

      const data = await response.json();
      if (response.ok && data && typeof data.city === 'string' && typeof data.area === 'string') {
        setGeminiStatus('online');
        setGeminiStatusReason(null);
        const autoLoc = getCountryCityArea(place.addressComponents || [], place.formattedAddress || '');
        const isTaiwan = autoLoc.country === '🇹🇼 台灣';
        let finalArea = data.area.trim() || '未分類區域';
        if (isTaiwan && (finalArea === '未分類區域' || TAIWAN_VILLAGE_SUFFIX_REGEX.test(finalArea))) {
          finalArea = autoLoc.area || finalArea;
        }
        return {
          city: data.city.trim() || '未分類城市',
          area: finalArea,
          tags: Array.isArray(data.tags) ? data.tags.map((t: string) => t.trim()).filter(Boolean) : [],
          usedGemini: true,
        };
      }

      if (response.status === 400 || response.status === 401 || response.status === 403 || response.status >= 500) {
        setGeminiStatus('offline');
        setGeminiStatusReason(data?.error || `HTTP ${response.status}`);
      }

      const fallback = await resolveTranslatedCityAndArea(place);
      return {
        ...fallback,
        tags: [],
        usedGemini: false,
        errorMessage: data?.error || `HTTP ${response.status}`,
      };
    } catch (err) {
      console.warn('Gemini 分類失敗，自動改用備援分類:', err);
      setGeminiStatus('offline');
      setGeminiStatusReason(err instanceof Error ? err.message : '網路連線失敗');
      const fallback = await resolveTranslatedCityAndArea(place);
      return {
        ...fallback,
        tags: [],
        usedGemini: false,
        errorMessage: err instanceof Error ? err.message : '網路連線失敗',
      };
    }
  };

  const openEditModal = async (place: GooglePlace) => {
    // 1. 設定目前正在編輯的地點與初始值
    setEditingPlace(place);
    const autoLocation = getCountryCityArea(place.addressComponents || [], place.formattedAddress || '');
    const isTaiwan = autoLocation.country === '🇹🇼 台灣';
    const hasInvalidTwArea = Boolean(
      isTaiwan && place.customArea && TAIWAN_VILLAGE_SUFFIX_REGEX.test(place.customArea.trim())
    );
    const initialArea = hasInvalidTwArea ? autoLocation.area : place.customArea || autoLocation.area;
    const existingNote = place.customNote || place.note || place.notes || '';

    setEditForm({
      name: place.customName || place.displayName?.text || '未知名稱',
      city: place.customCity || autoLocation.city,
      area: initialArea,
      tags: place.customTags ? place.customTags.join(', ') : '',
      note: existingNote,
      isFavorite: Boolean(place.isFavorite),
      lists: Array.isArray(place.lists) ? [...place.lists] : [],
    });

    // 2. 若尚未有自訂中文城市／區域，執行補齊
    if (!place.customCity || !place.customArea || place.customArea === '未分類區域' || hasInvalidTwArea) {
      const resolved = await resolveTranslatedCityAndArea(place);
      setEditForm(prev => ({
        ...prev,
        city: place.customCity || resolved.city,
        area:
          place.customArea && place.customArea !== '未分類區域' && !hasInvalidTwArea
            ? place.customArea
            : resolved.area,
      }));
    }
  };

  const handleAiReclassifyInEdit = async () => {
    if (!editingPlace || isAiClassifyingEdit) return;
    setIsAiClassifyingEdit(true);
    try {
      const result = await classifyPlaceWithGeminiApi({
        ...editingPlace,
        customName: editForm.name || editingPlace.displayName?.text,
      });

      if (!result.usedGemini) {
        showToast(`⚠️ AI 分類暫時無法使用：${result.errorMessage || '請確認 GEMINI_API_KEY 設定'}`);
        return;
      }

      const existingTags = parseTagInput(editForm.tags);
      const mergedTags = Array.from(new Set([...existingTags, ...result.tags]));

      setEditForm(prev => ({
        ...prev,
        city: result.city,
        area: result.area,
        tags: mergedTags.join(', '),
      }));
      showToast(`✨ AI 已更新為：${result.city} · ${result.area}`);
    } finally {
      setIsAiClassifyingEdit(false);
    }
  };

  const saveEdit = () => {
    if (!editingPlace) return;
    const trimmedNote = editForm.note.trim();
    const updatedPlaces = savedPlaces.map(p => {
      if (p.id === editingPlace.id) {
        return {
          ...p,
          customName: editForm.name,
          customCity: editForm.city,
          customArea: editForm.area,
          customTags: parseTagInput(editForm.tags),
          customNote: trimmedNote,
          note: trimmedNote,
          notes: trimmedNote,
          isFavorite: editForm.isFavorite,
          lists: Array.from(new Set(editForm.lists)),
        };
      }
      return p;
    });
    persistPlaces(updatedPlaces);
    setEditingPlace(null);
  };

  const findNearbySavedPlaces = (targetPlace: GooglePlace) => {
    if (centerId === targetPlace.id) {
      setCenterId(null);
      setNearbyIds([]);
      return;
    }
    const RADIUS_KM = 2;
    const nearbyPlaces = savedPlaces.filter(place => {
      if (place.id === targetPlace.id) return false;
      if (!place.location?.latitude || !targetPlace.location?.latitude) return false;

      const distance = calculateDistance(
        targetPlace.location.latitude,
        targetPlace.location.longitude,
        place.location.latitude,
        place.location.longitude
      );

      return distance <= RADIUS_KM;
    });

    setCenterId(targetPlace.id);
    setNearbyIds(nearbyPlaces.map(p => p.id));

    // 自動展開包含中心點與所有附近景點的國家、城市、區域資料夾
    const placesToExpand = [targetPlace, ...nearbyPlaces];
    setExpandedRegions(prev => {
      const next = { ...prev };
      placesToExpand.forEach(p => {
        const { country } = getCountryCityArea(p.addressComponents || []);
        const countryKey = country || '🌍 其他地區';
        next[countryKey] = true;
      });
      return next;
    });
    setExpandedCities(prev => {
      const next = { ...prev };
      placesToExpand.forEach(p => {
        const { country, city } = getCountryCityArea(p.addressComponents || []);
        const countryKey = country || '🌍 其他地區';
        const cityKey = `${countryKey}-${p.customCity || city || '其他地區'}`;
        next[cityKey] = true;
      });
      return next;
    });
    setExpandedAreas(prev => {
      const next = { ...prev };
      placesToExpand.forEach(p => {
        const { country, city, area } = getCountryCityArea(p.addressComponents || []);
        const countryKey = country || '🌍 其他地區';
        const cityName = p.customCity || city || '其他地區';
        const areaName = p.customArea || area || '其他區域';
        const areaKey = `${countryKey}-${cityName}-${areaName}`;
        next[areaKey] = true;
      });
      return next;
    });
  };

  // 共用底層 Google Places Text Search 函式 (回傳結果或錯誤訊息，供一般搜尋與 AI 批次比對共用)
  const fetchPlacesFromApi = async (
    payload: Record<string, unknown>
  ): Promise<{ places: GooglePlace[]; error: string | null }> => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return { places: [], error: '尚未設定 VITE_GOOGLE_MAPS_API_KEY 環境變數。' };
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.regularOpeningHours,places.location',
    };

    // 開發預覽環境 (DEV) 透過 Vite Proxy 繞過 Referer 限制；Vercel 正式環境 (PROD) 直接呼叫官方 API
    const endpoint = import.meta.env.DEV
      ? '/api/places/searchText'
      : 'https://places.googleapis.com/v1/places:searchText';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errStatus = data.error?.status || response.status;
      if (response.status === 403 || errStatus === 'PERMISSION_DENIED') {
        return {
          places: [],
          error: `API 金鑰網域限制 (403 PERMISSION_DENIED)：請至 Google Cloud Console 的 API 金鑰「網站限制 (HTTP Referrers)」加入目前網址：${window.location.origin}/*`,
        };
      }
      return {
        places: [],
        error: `搜尋失敗 (${errStatus})：${data.error?.message || '請確認 API 金鑰與 Places API (New) 是否已啟用'}`,
      };
    }

    return { places: data.places || [], error: null };
  };

  // 一般搜尋與分店搜尋封裝
  const executePlacesSearch = async (payload: Record<string, unknown>) => {
    setSearchError(null);
    const { places, error } = await fetchPlacesFromApi(payload);
    if (error) {
      setSearchError(error);
      setResults([]);
      return;
    }
    setResults(places);
    if (places.length === 0) {
      setSearchError('找不到符合的地點，請嘗試其他關鍵字。');
    }
  };

  const handleFindBranches = async (targetPlace: GooglePlace) => {
    const displayNameStr = targetPlace.displayName?.text || '';
    if (!displayNameStr) {
      showToast('⚠️ 此地點缺少名稱，無法搜尋分店！');
      return;
    }
    const brandName = displayNameStr.split('-')[0].split('(')[0].split(' ')[0].trim();

    setActiveTab('search');
    setSearchMode('keyword');
    setSearchQuery(brandName);

    if (!targetPlace.location?.latitude) {
      showToast('⚠️ 此地點缺少座標資訊，請直接使用手動搜尋！');
      return;
    }

    setIsSearching(true);
    setResults([]);
    setSelectedLocation(null);

    try {
      await executePlacesSearch({
        textQuery: brandName,
        languageCode: 'zh-TW',
        maxResultCount: 10,
        locationBias: {
          circle: {
            center: {
              latitude: targetPlace.location.latitude,
              longitude: targetPlace.location.longitude,
            },
            radius: 5000.0,
          },
        },
      });
    } catch (error) {
      console.error('API 錯誤:', error);
      setSearchError('網路連線或 API 請求失敗，請稍後再試。');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSelectedLocation(null);

    try {
      await executePlacesSearch({
        textQuery: searchQuery.trim(),
        languageCode: 'zh-TW',
        maxResultCount: 5,
      });
    } catch (error) {
      console.error('API 錯誤:', error);
      setSearchError('網路連線或 API 請求失敗，請稍後再試。');
    } finally {
      setIsSearching(false);
    }
  };

  // 🌟 接上 Gemini：儲存地點瞬間自動轉成繁體中文「城市 + 商圈」並自動打上標籤
  const handleSaveLocation = async () => {
    if (!selectedLocation || isSaving) return;
    if (savedPlaces.some(place => place.id === selectedLocation.id)) {
      showToast('⚠️ 這個地點已經在你的清單中囉！');
      return;
    }

    setIsSaving(true);
    try {
      const classified = await classifyPlaceWithGeminiApi(selectedLocation);
      const manualTags = parseTagInput(saveTagsInput);
      const mergedTags = Array.from(
        new Set([...manualTags, ...(selectedLocation.customTags || []), ...classified.tags])
      );

      const placeToSave = normalizePlaceData({
        ...selectedLocation,
        customCity: selectedLocation.customCity || classified.city,
        customArea: selectedLocation.customArea || classified.area,
        customTags: mergedTags,
        isFavorite: saveIsFavorite,
        lists: [...saveFolderSelection],
      });

      const newSavedPlaces = [placeToSave, ...savedPlaces];
      persistPlaces(newSavedPlaces);

      const tagPreview = mergedTags.length > 0 ? `｜${mergedTags.map(t => `#${t}`).join(' ')}` : '';
      showToast(`🎉 已加入清單！（${placeToSave.customCity} · ${placeToSave.customArea}${tagPreview}）`);
      setSearchQuery('');
      setSelectedLocation(null);
      setSaveIsFavorite(false);
      setSaveFolderSelection([]);
      setSaveTagsInput('');
    } finally {
      setIsSaving(false);
    }
  };

  // ✨ 處理截圖上傳或貼上剪貼簿圖片（自動壓縮長邊至 1200px / JPEG 0.8，避開 Vercel 4.5MB 限制）
  const handleExtractImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setExtractError('請選擇圖片格式的截圖檔案（PNG / JPG / WebP）。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawDataUrl) return;

      const applyImageDataUrl = (dataUrl: string, mimeType: string) => {
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx === -1) return;
        const base64 = dataUrl.slice(commaIdx + 1);
        setExtractImagePreview(dataUrl);
        setExtractImageData({ base64, mimeType });
        setExtractError(null);
      };

      const img = new Image();
      img.onload = () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const targetWidth = Math.max(1, Math.round(img.width * scale));
        const targetHeight = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          applyImageDataUrl(rawDataUrl, file.type || 'image/png');
          return;
        }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        const compressedUrl = canvas.toDataURL('image/jpeg', 0.8);
        applyImageDataUrl(compressedUrl, 'image/jpeg');
      };
      img.onerror = () => {
        applyImageDataUrl(rawDataUrl, file.type || 'image/png');
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handlePasteInExtractor = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleExtractImageFile(file);
          showToast('📸 已從剪貼簿貼上截圖！');
          break;
        }
      }
    }
  };

  // ✨ 呼叫 Gemini 從文字或截圖智能擷取所有店名與景點，並透過 Google Places 取得真實地點資料
  const handleSmartExtract = async () => {
    if (!extractText.trim() && !extractImageData) {
      setExtractError('請貼上旅遊文章／貼文文字，或上傳／貼上截圖！');
      return;
    }

    setIsExtracting(true);
    setExtractError(null);
    setExtractedItems([]);

    try {
      const geminiRes = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extract',
          text: extractText.trim(),
          imageBase64: extractImageData?.base64,
          mimeType: extractImageData?.mimeType,
        }),
      });

      const geminiData = await geminiRes.json();
      if (!geminiRes.ok) {
        if (geminiRes.status === 400 || geminiRes.status === 401 || geminiRes.status === 403 || geminiRes.status >= 500) {
          setGeminiStatus('offline');
          setGeminiStatusReason(geminiData?.error || `HTTP ${geminiRes.status}`);
        }
        setExtractError(geminiData?.error || `Gemini 擷取失敗 (${geminiRes.status})`);
        return;
      }

      setGeminiStatus('online');
      setGeminiStatusReason(null);

      const rawCandidates: Array<{
        name: string;
        searchQuery: string;
        hintCity: string;
        hintArea: string;
        tags: string[];
        note: string;
      }> = Array.isArray(geminiData.places) ? geminiData.places : [];

      if (rawCandidates.length === 0) {
        setExtractError('這段內容或截圖中沒有偵測到明確的餐廳或景點名稱，請試著補充更多細節。');
        return;
      }

      // 平行向 Google Places API (New) 搜尋每個擷取到的地點，確保擁有真實座標、Place ID 與地址
      const existingIds = new Set(savedPlaces.map(p => p.id));
      const resolvedList: ExtractedCandidateItem[] = await Promise.all(
        rawCandidates.map(async (item, index) => {
          const { places } = await fetchPlacesFromApi({
            textQuery: item.searchQuery || item.name,
            languageCode: 'zh-TW',
            maxResultCount: 1,
          }).catch(() => ({ places: [] as GooglePlace[] }));

          const matched = places[0] || null;
          const isAlreadySaved = Boolean(matched && existingIds.has(matched.id));
          const matchStatus: ExtractedCandidateItem['matchStatus'] = !matched
            ? 'not_found'
            : isAlreadySaved
              ? 'already_saved'
              : 'matched';

          return {
            key: `${index}-${item.name}`,
            extractedName: item.name,
            searchQuery: item.searchQuery || item.name,
            hintCity: item.hintCity || '',
            hintArea: item.hintArea || '',
            tags: Array.isArray(item.tags) ? item.tags : [],
            note: item.note || '',
            matchedPlace: matched,
            matchStatus,
            selected: matchStatus === 'matched',
          };
        })
      );

      setExtractedItems(resolvedList);
    } catch (err) {
      console.error('智能擷取錯誤:', err);
      setExtractError('智能擷取過程中發生錯誤，請檢查網路或 API 金鑰設定。');
    } finally {
      setIsExtracting(false);
    }
  };

  // ✨ 一鍵將擷取並比對成功的景點直接加入收藏清單（同步執行中文商圈與標籤分類）
  const handleBatchSaveExtracted = async () => {
    const itemsToSave = extractedItems.filter(item => item.selected && item.matchedPlace);
    if (itemsToSave.length === 0 || isBatchSaving) {
      showToast('⚠️ 請至少勾選一個有效的地點！');
      return;
    }

    setIsBatchSaving(true);
    try {
      const existingMap = new Map(savedPlaces.map(p => [p.id, p]));
      const newlyPrepared: GooglePlace[] = [];

      for (const item of itemsToSave) {
        const place = item.matchedPlace;
        if (!place || existingMap.has(place.id)) continue;

        let city = item.hintCity;
        let area = item.hintArea;
        let aiTags = [...item.tags];

        if (!city || !area || aiTags.length === 0) {
          const classified = await classifyPlaceWithGeminiApi(place);
          city = city || classified.city;
          area = area || classified.area;
          aiTags = Array.from(new Set([...aiTags, ...classified.tags]));
        }

        const prepared = normalizePlaceData({
          ...place,
          customCity: city || '未分類城市',
          customArea: area || '未分類區域',
          customTags: aiTags,
          customNote: item.note,
          note: item.note,
          notes: item.note,
        });
        existingMap.set(place.id, prepared);
        newlyPrepared.push(prepared);
      }

      if (newlyPrepared.length === 0) {
        showToast('⚠️ 勾選的地點皆已存在於清單中。');
        return;
      }

      const updatedPlaces = [...newlyPrepared, ...savedPlaces];
      persistPlaces(updatedPlaces);

      showToast(`🎉 成功加入 ${newlyPrepared.length} 個新景點至「我的清單」！`);
      setExtractedItems([]);
      setExtractText('');
      setExtractImagePreview(null);
      setExtractImageData(null);
      setActiveTab('list');
    } finally {
      setIsBatchSaving(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`確定要將「${name}」從清單移除嗎？`)) {
      const newSavedPlaces = savedPlaces.filter(place => place.id !== id);
      persistPlaces(newSavedPlaces);
      if (centerId === id) {
        setCenterId(null);
        setNearbyIds([]);
      }
      setSelectedDeleteIds(prev => prev.filter(itemId => itemId !== id));
      setSelectedExportIds(prev => prev.filter(itemId => itemId !== id));
    }
  };

  // 執行批次刪除多個已選取地點
  const executeBatchDelete = () => {
    if (selectedDeleteIds.length === 0) return;
    const deleteSet = new Set(selectedDeleteIds);
    const deletedCount = savedPlaces.filter(p => deleteSet.has(p.id)).length;
    const updatedPlaces = savedPlaces.filter(place => !deleteSet.has(place.id));

    setSavedPlaces(updatedPlaces);
    localStorage.setItem('amazing_locations', JSON.stringify(updatedPlaces));

    if (centerId && deleteSet.has(centerId)) {
      setCenterId(null);
      setNearbyIds([]);
    } else {
      setNearbyIds(prev => prev.filter(id => !deleteSet.has(id)));
    }

    setSelectedExportIds(prev => prev.filter(id => !deleteSet.has(id)));
    setSelectedDeleteIds([]);
    setShowBatchDeleteConfirm(false);
    setIsDeleteSelectMode(false);
    showToast(`🗑️ 已批次刪除 ${deletedCount} 個地點`);
  };

  // ❤️ 切換單一地點「我的最愛」
  const toggleFavorite = (placeId: string) => {
    let nextState = false;
    const updated = savedPlaces.map(p => {
      if (p.id === placeId) {
        nextState = !p.isFavorite;
        return { ...p, isFavorite: nextState };
      }
      return p;
    });
    persistPlaces(updated);
    showToast(nextState ? '❤️ 已加入我的最愛' : '🤍 已取消我的最愛');
  };

  // 📂 切換單一地點所屬清單夾
  const togglePlaceInFolder = (placeId: string, folderName: string) => {
    const updated = savedPlaces.map(p => {
      if (p.id !== placeId) return p;
      const currentLists = Array.isArray(p.lists) ? p.lists : [];
      const exists = currentLists.includes(folderName);
      const nextLists = exists
        ? currentLists.filter(f => f !== folderName)
        : [...currentLists, folderName];
      return { ...p, lists: nextLists };
    });
    persistPlaces(updated);
  };

  // ➕ 新增自訂清單夾
  const handleCreateCustomFolder = (rawName?: string, colorOverride?: FolderColorId): string | null => {
    const trimmed = (rawName ?? newFolderName).trim();
    if (!trimmed) {
      showToast('⚠️ 請輸入清單夾名稱');
      return null;
    }
    if (trimmed === '全部' || trimmed === '我的最愛' || trimmed === 'all' || trimmed === 'favorites') {
      showToast('⚠️ 此名稱為系統保留分類，請使用其他名稱');
      return null;
    }
    if (customFolders.includes(trimmed)) {
      showToast(`⚠️「${trimmed}」清單夾已存在`);
      setNewFolderName('');
      setShowNewFolderInput(false);
      return null;
    }

    const nextFolders = [...customFolders, trimmed];
    persistFolders(nextFolders);
    const chosenColor = colorOverride || newFolderColor;
    persistFolderColors({ ...folderColors, [trimmed]: chosenColor });
    setNewFolderName('');
    setShowNewFolderInput(false);
    showToast(`📁 已新增清單夾「${trimmed}」`);
    return trimmed;
  };

  // 🗑️ 刪除自訂清單夾（僅限非預設清單夾）
  const handleDeleteCustomFolder = (folderName: string) => {
    if ((DEFAULT_CUSTOM_FOLDERS as readonly string[]).includes(folderName)) return;
    const nextFolders = customFolders.filter(f => f !== folderName);
    persistFolders(nextFolders);
    if (folderColors[folderName]) {
      const nextColors = { ...folderColors };
      delete nextColors[folderName];
      persistFolderColors(nextColors);
    }
    const updatedPlaces = savedPlaces.map(p => ({
      ...p,
      lists: Array.isArray(p.lists) ? p.lists.filter(f => f !== folderName) : [],
    }));
    persistPlaces(updatedPlaces);
    if (activeCollectionView === folderName) {
      setActiveCollectionView('all');
    }
    showToast(`🗑️ 已移除自訂清單夾「${folderName}」`);
  };

  // 🔄 切換清單檢視（全部 / 我的最愛 / 待去 / 已去 / 行程規劃 / 自訂清單夾）並展開符合項目
  const handleSelectCollectionView = (view: string) => {
    setActiveCollectionView(view);
    if (view === 'all') return;

    const matching = savedPlaces.filter(p =>
      view === 'favorites' ? Boolean(p.isFavorite) : (p.lists || []).includes(view)
    );

    if (matching.length > 0) {
      setExpandedRegions(prev => {
        const next = { ...prev };
        matching.forEach(p => {
          const { country } = getCountryCityArea(p.addressComponents || [], p.formattedAddress || '');
          next[country || '🌍 其他地區'] = true;
        });
        return next;
      });
      setExpandedCities(prev => {
        const next = { ...prev };
        matching.forEach(p => {
          const { country, city } = getCountryCityArea(p.addressComponents || [], p.formattedAddress || '');
          next[`${country || '🌍 其他地區'}-${p.customCity || city || '其他地區'}`] = true;
        });
        return next;
      });
      setExpandedAreas(prev => {
        const next = { ...prev };
        matching.forEach(p => {
          const { country, city, area } = getCountryCityArea(p.addressComponents || [], p.formattedAddress || '');
          const countryKey = country || '🌍 其他地區';
          const cityName = p.customCity || city || '其他地區';
          const areaName = p.customArea || area || '其他區域';
          next[`${countryKey}-${cityName}-${areaName}`] = true;
        });
        return next;
      });
    }
  };

  // 📦 批次在選取模式中將多個地點加入／移出清單夾或最愛
  const batchToggleFolderForSelected = (folderName: string) => {
    if (selectedDeleteIds.length === 0) return;
    const selectedSet = new Set(selectedDeleteIds);
    const targetPlaces = savedPlaces.filter(p => selectedSet.has(p.id));
    const allAlreadyInFolder =
      targetPlaces.length > 0 && targetPlaces.every(p => (p.lists || []).includes(folderName));

    const updated = savedPlaces.map(p => {
      if (!selectedSet.has(p.id)) return p;
      const currentLists = Array.isArray(p.lists) ? p.lists : [];
      const nextLists = allAlreadyInFolder
        ? currentLists.filter(f => f !== folderName)
        : Array.from(new Set([...currentLists, folderName]));
      return { ...p, lists: nextLists };
    });

    persistPlaces(updated);
    showToast(
      allAlreadyInFolder
        ? `📂 已將 ${targetPlaces.length} 個地點從「${folderName}」移出`
        : `📂 已將 ${targetPlaces.length} 個地點加入「${folderName}」`
    );
  };

  const batchToggleFavoriteForSelected = () => {
    if (selectedDeleteIds.length === 0) return;
    const selectedSet = new Set(selectedDeleteIds);
    const targetPlaces = savedPlaces.filter(p => selectedSet.has(p.id));
    const allFav = targetPlaces.length > 0 && targetPlaces.every(p => Boolean(p.isFavorite));

    const updated = savedPlaces.map(p => (selectedSet.has(p.id) ? { ...p, isFavorite: !allFav } : p));
    persistPlaces(updated);
    showToast(
      allFav
        ? `🤍 已將 ${targetPlaces.length} 個地點取消最愛`
        : `❤️ 已將 ${targetPlaces.length} 個地點加入我的最愛`
    );
  };

  const toggleCard = (id: string) => {
    setExpandedCards(prev => prev.includes(id) ? prev.filter(cardId => cardId !== id) : [...prev, id]);
  };

  const isAnySelectionMode = isExportMode || isDeleteSelectMode;
  const activeSelectedIds = isDeleteSelectMode ? selectedDeleteIds : selectedExportIds;

  const togglePlaceSelection = (placeId: string) => {
    if (isDeleteSelectMode) {
      setSelectedDeleteIds(prev =>
        prev.includes(placeId) ? prev.filter(id => id !== placeId) : [...prev, placeId]
      );
    } else if (isExportMode) {
      setSelectedExportIds(prev =>
        prev.includes(placeId) ? prev.filter(id => id !== placeId) : [...prev, placeId]
      );
    }
  };

  // 支援「整城／整區一鍵全選」或取消全選（同時適用於 Trip Plan 匯出與批次刪除模式）
  const toggleSelectGroupIds = (placeIds: string[]) => {
    const updater = (prev: string[]) => {
      const allSelected = placeIds.length > 0 && placeIds.every(id => prev.includes(id));
      if (allSelected) {
        return prev.filter(id => !placeIds.includes(id));
      }
      const nextSet = new Set([...prev, ...placeIds]);
      return Array.from(nextSet);
    };

    if (isDeleteSelectMode) {
      setSelectedDeleteIds(updater);
    } else {
      setSelectedExportIds(updater);
    }
  };

  const openInGoogleMaps = (place: GooglePlace) => {
    const targetQuery = place.formattedAddress || place.displayName?.text || 'Location';
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(targetQuery)}&query_place_id=${place.id}`;

    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      window.location.assign(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const renderOpeningHours = (hours?: GooglePlace['regularOpeningHours']) => {
    if (!hours || !Array.isArray(hours.weekdayDescriptions)) return null;
    return (
      <div className="flex items-start mt-3 pt-3 border-t border-gray-100">
        <span className="mr-2">🕒</span>
        <div className="w-full">
          <span className={`font-bold ${hours.openNow ? 'text-green-600' : 'text-red-500'}`}>
            {hours.openNow ? '營業中' : '休息中'}
          </span>
          <details className="mt-1 group cursor-pointer">
            <summary className="text-xs text-blue-600 hover:text-blue-700 font-medium list-none flex items-center outline-none">
              查看一週營業時間
              <span className="ml-1 text-[8px] transition-transform group-open:rotate-180">▼</span>
            </summary>
            <div className="mt-2 space-y-1.5 text-xs text-gray-600 bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
              {hours.weekdayDescriptions.map((day, index) => {
                const safeDay = day || '';
                const splitChar = safeDay.includes('：') ? '：' : ': ';
                const parts = safeDay.split(splitChar);
                const isToday = index === (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);
                return (
                  <div key={index} className={`flex justify-between gap-4 ${isToday ? 'font-bold text-blue-600' : ''}`}>
                    <span className="shrink-0">{parts[0]}</span>
                    <span className="text-right">{parts.slice(1).join(splitChar) || '無資料'}</span>
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      </div>
    );
  };

  // 🌟 修改提議 1：修復「清單內搜尋」搜不到自訂名稱、自訂城市/區域、標籤、備註與翻譯後中文的問題
  const filteredBySearch = savedPlaces.filter(place => {
    if (!listSearchQuery.trim()) return true;
    const term = listSearchQuery.trim().toLowerCase();
    const termWithoutHash = term.startsWith('#') ? term.slice(1) : term;
    const autoLoc = getCountryCityArea(place.addressComponents || [], place.formattedAddress || '');
    const noteText = place.customNote || place.note || place.notes || '';

    const matchesText =
      (place.displayName?.text || '').toLowerCase().includes(term) ||
      (place.formattedAddress || '').toLowerCase().includes(term) ||
      (place.customName || '').toLowerCase().includes(term) ||
      (place.customCity || '').toLowerCase().includes(term) ||
      (place.customArea || '').toLowerCase().includes(term) ||
      noteText.toLowerCase().includes(term) ||
      autoLoc.country.toLowerCase().includes(term) ||
      autoLoc.city.toLowerCase().includes(term) ||
      autoLoc.area.toLowerCase().includes(term);

    const matchesTags = (place.customTags || []).some(tag => {
      const lowerTag = tag.toLowerCase();
      return lowerTag.includes(term) || (termWithoutHash.length > 0 && lowerTag.includes(termWithoutHash));
    });

    return matchesText || matchesTags;
  });

  // 依「我的最愛」或「自訂清單夾」切換檢視過濾
  const placesInCollectionView = filteredBySearch.filter(place => {
    if (activeCollectionView === 'all') return true;
    if (activeCollectionView === 'favorites') return Boolean(place.isFavorite);
    return (place.lists || []).includes(activeCollectionView);
  });

  const displayPlaces = placesInCollectionView.filter(p => {
    const matchesCountry =
      selectedCountryTab === '全部' ||
      getCountryCityArea(p.addressComponents || [], p.formattedAddress || '').country === selectedCountryTab;
    const matchesSelectedTag =
      !selectedTag || (p.customTags || []).map(t => t.trim()).includes(selectedTag);
    return matchesCountry && matchesSelectedTag;
  });

  // 統計標籤雲 (依目前清單夾檢視與國家分頁統計所有自訂標籤數量)
  const placesForTagCloud = selectedCountryTab === '全部'
    ? placesInCollectionView
    : placesInCollectionView.filter(
        p => getCountryCityArea(p.addressComponents || [], p.formattedAddress || '').country === selectedCountryTab
      );

  const tagCountsMap = placesForTagCloud.reduce((acc, place) => {
    (place.customTags || []).forEach(rawTag => {
      const tag = rawTag.trim();
      if (tag) {
        acc[tag] = (acc[tag] || 0) + 1;
      }
    });
    return acc;
  }, {} as Record<string, number>);

  const tagCloudList = Object.entries(tagCountsMap).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant')
  );
  const detailTagCloudList = tagCloudList.filter(([tag]) => !PRESET_CATEGORY_LABELS.includes(tag));

  const groupedByLocation = displayPlaces.reduce((acc, place) => {
    const { country, city, area } = getCountryCityArea(place.addressComponents || [], place.formattedAddress || '');
    const countryKey = country || '🌍 其他地區';
    const cityKey = place.customCity || city || '其他地區';
    const areaKey = place.customArea || area || '其他區域';

    if (!acc[countryKey]) acc[countryKey] = {};
    if (!acc[countryKey][cityKey]) acc[countryKey][cityKey] = {};
    if (!acc[countryKey][cityKey][areaKey]) acc[countryKey][cityKey][areaKey] = [];

    acc[countryKey][cityKey][areaKey].push(place);
    return acc;
  }, {} as Record<string, Record<string, Record<string, GooglePlace[]>>>);

  // 計算頂部「📍 附近 2km」專屬區塊的資料
  const centerPlace = centerId ? savedPlaces.find(p => p.id === centerId) || null : null;

  // 切換區域內排序方式 (名稱 A-Z / 評分 高到低 / 距離 由近到遠)
  const handleAreaSortChange = (
    areaKey: string,
    sortOption: 'default' | 'name' | 'rating' | 'distance'
  ) => {
    setAreaSortMap(prev => ({ ...prev, [areaKey]: sortOption }));
    setExpandedAreas(prev => ({ ...prev, [areaKey]: true }));

    if (sortOption === 'distance' && !centerPlace && !userCoords) {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            setUserCoords({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
            showToast('📍 已取得目前定位，依距離由近到遠排序');
          },
          () => {
            showToast('💡 未開啟定位權限，已依區域基準點由近到遠排序（亦可點選任一景點「📍 附近」作為基準）');
          },
          { timeout: 6000 }
        );
      } else {
        showToast('💡 已依區域基準點由近到遠排序');
      }
    }
  };

  // 計算單一景點與目前參考基準點（📍 附近中心點 > 使用者 GPS > 該區第一筆景點）的距離
  const getDistanceForAreaSort = (place: GooglePlace, areaPlaces: GooglePlace[]): number | null => {
    if (!place.location?.latitude || !place.location?.longitude) return null;
    const refLocation =
      centerPlace?.location?.latitude && centerPlace?.location?.longitude
        ? centerPlace.location
        : userCoords
          ? userCoords
          : areaPlaces[0]?.location?.latitude && areaPlaces[0]?.location?.longitude
            ? areaPlaces[0].location
            : null;
    if (!refLocation) return null;
    return calculateDistance(
      refLocation.latitude,
      refLocation.longitude,
      place.location.latitude,
      place.location.longitude
    );
  };

  const nearbyPlacesWithDistance = centerPlace
    ? savedPlaces
        .filter(p => nearbyIds.includes(p.id))
        .map(p => {
          const distKm =
            centerPlace.location?.latitude && p.location?.latitude
              ? calculateDistance(
                  centerPlace.location.latitude,
                  centerPlace.location.longitude,
                  p.location.latitude,
                  p.location.longitude
                )
              : 0;
          return { place: p, distKm };
        })
        .sort((a, b) => a.distKm - b.distKm)
    : [];

  // 國家快速篩選列選項 (固定顯示 全部 / 🇯🇵 日本 / 🇹🇼 台灣 / 🇰🇷 韓國，若有其他國家也動態補上)
  const baseCountryTabs = ['全部', '🇯🇵 日本', '🇹🇼 台灣', '🇰🇷 韓國'];
  const extraCountryTabs = Array.from(
    new Set(savedPlaces.map(p => getCountryCityArea(p.addressComponents || [], p.formattedAddress || '').country))
  ).filter(c => c && !baseCountryTabs.includes(c));
  const countryTabs = [...baseCountryTabs, ...extraCountryTabs];

  // 保留與 AmazingTravel (去旅行啦) 的完整接合方式，並自動帶入旅遊備註欄
  const handleRichExport = async () => {
    if (selectedExportIds.length === 0) {
      alert('請先選擇至少一個地點！');
      return;
    }

    const exportData = savedPlaces
      .filter(p => selectedExportIds.includes(p.id))
      .map(p => {
        const noteText = p.customNote || p.note || p.notes || '';
        return {
          ...p,
          customNote: noteText,
          note: noteText,
          notes: noteText,
        };
      });
    const jsonString = JSON.stringify(exportData);

    try {
      await navigator.clipboard.writeText(jsonString);
      if (window.confirm(`✅ 已選擇了 ${exportData.length} 個地點的完整資訊！\n\n是否確定匯出地點？`)) {
        setIsExportMode(false);
        setSelectedExportIds([]);
        alert('✅ 成功匯出！景點資料已複製到剪貼簿。\n\n請手動切換至「AmazingTravel」App，並點擊右上角的「📥 匯入 Location 資料」即可完成！');
      }
    } catch (err) {
      alert('複製失敗，請確認瀏覽器權限！');
      console.error(err);
    }
  };

  // 將整個「我的清單」內容匯出為單一 JSON 檔案下載作為備份
  const handleDownloadBackup = () => {
    if (savedPlaces.length === 0) {
      alert('目前清單沒有任何地點可供備份！');
      return;
    }

    const backupData = savedPlaces.map(p => {
      const noteText = p.customNote || p.note || p.notes || '';
      return {
        ...p,
        customNote: noteText,
        note: noteText,
        notes: noteText,
      };
    });

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split('T')[0];

    const link = document.createElement('a');
    link.href = url;
    link.download = `amazing-locations-backup-${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 匯入 JSON 備份檔案並與現有清單智慧合併
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed)) {
        alert('備份檔案格式錯誤：必須是地點陣列 (JSON Array)！');
        return;
      }

      const validPlaces: GooglePlace[] = parsed
        .filter((item): item is GooglePlace => item && typeof item === 'object' && typeof item.id === 'string')
        .map(item => {
          const noteText = item.customNote || item.note || item.notes || '';
          return normalizePlaceData({
            ...item,
            customNote: noteText,
            note: noteText,
            notes: noteText,
          });
        });

      if (validPlaces.length === 0) {
        alert('備份檔案中沒有找到有效的地點資料！');
        return;
      }

      const existingMap = new Map(savedPlaces.map(p => [p.id, p]));
      let addedCount = 0;
      let updatedCount = 0;

      validPlaces.forEach(place => {
        if (existingMap.has(place.id)) {
          updatedCount++;
        } else {
          addedCount++;
        }
        existingMap.set(place.id, place);
      });

      const mergedPlaces = Array.from(existingMap.values());
      persistPlaces(mergedPlaces);

      const importedFolders = validPlaces.flatMap(p => p.lists || []);
      if (importedFolders.length > 0) {
        persistFolders([...customFolders, ...importedFolders]);
      }

      alert(`🎉 成功匯入 JSON 備份！\n共讀取 ${validPlaces.length} 個地點（新增 ${addedCount} 個、更新 ${updatedCount} 個）。`);
    } catch (err) {
      console.error('匯入備份失敗:', err);
      alert('讀取 JSON 備份檔案失敗，請確認檔案格式是否正確！');
    } finally {
      e.target.value = '';
    }
  };

  const hasActiveSearch = Boolean(listSearchQuery.trim() || selectedTag);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800 pb-24">

      {toastNotice && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] max-w-sm w-[calc(100%-2rem)] bg-gray-900 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-xl text-center animate-in fade-in duration-200">
          {toastNotice}
        </div>
      )}

      <div className="pt-14 pb-6 text-center px-4">
        <div className="inline-flex items-center justify-center gap-3">
          <img
            src="/pwa-192x192.png"
            alt="Amazing Location Icon"
            className="w-11 h-11 rounded-2xl shadow-md ring-1 ring-black/5 object-cover"
          />
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Amazing Location</h1>
        </div>
        <p className="mt-2 text-sm text-gray-500">
          {activeTab === 'search' ? '想去哪裡？剩下的交給我。' : `已收集 ${savedPlaces.length} 個超棒的地點`}
        </p>

        <div className="mt-2.5 flex justify-center">
          <button
            type="button"
            onClick={() => void refreshGeminiStatus(true)}
            title={geminiStatusReason ? `點擊重新檢測（${geminiStatusReason}）` : '點擊重新檢測 Gemini 連線狀態'}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${
              geminiStatus === 'online'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : geminiStatus === 'offline'
                  ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                geminiStatus === 'online'
                  ? 'bg-emerald-500'
                  : geminiStatus === 'offline'
                    ? 'bg-rose-500'
                    : 'bg-amber-500 animate-pulse'
              }`}
            />
            <span>
              {geminiStatus === 'online'
                ? 'Gemini 在線'
                : geminiStatus === 'offline'
                  ? 'Gemini 離線'
                  : 'Gemini 連線檢測中...'}
            </span>
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4">

        {/* === 🔍 搜尋 & AI 智能擷取分頁 === */}
        {activeTab === 'search' && (
          <div className="animate-in fade-in duration-300">
            {/* 模式切換列：關鍵字搜尋 / ✨ AI 貼文・截圖智能擷取 */}
            <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-2xl bg-gray-200/70 p-1">
              <button
                type="button"
                onClick={() => setSearchMode('keyword')}
                className={`py-2 rounded-xl text-xs font-bold transition-all ${
                  searchMode === 'keyword'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🔍 關鍵字搜尋
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('ai_extract')}
                className={`py-2 rounded-xl text-xs font-bold transition-all ${
                  searchMode === 'ai_extract'
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                ✨ AI 貼文・截圖擷取
              </button>
            </div>

            {searchMode === 'keyword' ? (
              <>
                <form onSubmit={handleSearch} className="relative rounded-2xl bg-white p-2 shadow-sm ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-blue-500">
                  <input
                    type="text"
                    className="w-full bg-transparent px-4 py-3 pr-24 text-base outline-none placeholder:text-gray-400"
                    placeholder="輸入景點、店名或地址..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (searchError) setSearchError(null);
                    }}
                  />
                  <button type="submit" disabled={isSearching} className="absolute right-2 top-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50">
                    {isSearching ? '搜尋中...' : '搜尋'}
                  </button>
                </form>

                {searchError && (
                  <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 leading-relaxed break-all">
                    ⚠️ {searchError}
                  </div>
                )}

                {results.length > 0 && (
                  <ul className="relative z-10 mt-2 w-full rounded-2xl bg-white py-2 shadow-xl ring-1 ring-black/5 max-h-64 overflow-auto">
                    {results.map((place) => (
                      <li
                        key={place.id}
                        onClick={() => {
                          setSelectedLocation(place);
                          setSaveIsFavorite(false);
                          setSaveFolderSelection([]);
                          setSaveTagsInput('');
                          setResults([]);
                          setSearchQuery(place.displayName?.text || '未知名稱');
                        }}
                        className="cursor-pointer px-5 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-0"
                      >
                        <div className="font-bold text-gray-900">{place.displayName?.text || '未知名稱'}</div>
                        <div className="text-xs text-gray-500 truncate mt-1">{place.formattedAddress || '無詳細地址'}</div>
                      </li>
                    ))}
                  </ul>
                )}

                {selectedLocation && (
                  <div className="mt-6 rounded-3xl bg-white p-5 shadow-xl ring-1 ring-black/5 animate-in slide-in-from-top-4 fade-in duration-300">
                    <h3 className="text-xl font-bold text-gray-900">{selectedLocation.displayName?.text || '未知名稱'}</h3>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm">
                      <span className="rounded-md bg-blue-50 text-blue-700 px-2 py-1 font-medium">
                        {getCountryCityArea(selectedLocation.addressComponents || [], selectedLocation.formattedAddress || '').country}
                      </span>
                      <span className="rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-600">
                        {getCountryCityArea(selectedLocation.addressComponents || [], selectedLocation.formattedAddress || '').city}
                      </span>
                      {selectedLocation.rating && <span className="text-amber-500 font-bold ml-1">⭐ {selectedLocation.rating}</span>}
                    </div>

                    <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <div className="flex items-start"><span className="mr-2">📍</span><span>{selectedLocation.formattedAddress || '無詳細地址'}</span></div>
                      {renderOpeningHours(selectedLocation.regularOpeningHours)}
                    </div>

                    <div className="mt-4">
                      <label className="block text-xs font-bold text-gray-500 mb-1.5">🏷️ 自訂標籤（可留空由 AI 自動補上，用逗號分隔）</label>
                      <input
                        type="text"
                        value={saveTagsInput}
                        onChange={(e) => setSaveTagsInput(e.target.value)}
                        placeholder="例如：飲食, 拉麵, 必吃（儲存時將與 AI 標籤合併）"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2 text-base sm:text-xs outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 transition"
                      />
                      <div className="mt-2 flex items-center flex-wrap gap-1.5">
                        <span className="text-[11px] font-bold text-gray-400">大分類：</span>
                        {PRESET_CATEGORY_TAGS.map(preset => {
                          const isSelected = parseTagInput(saveTagsInput).includes(preset.label);
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => setSaveTagsInput(prev => toggleTagInString(prev, preset.label))}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border ${
                                isSelected
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                  : 'bg-white text-gray-700 border-gray-200 hover:bg-blue-50'
                              }`}
                            >
                              {preset.icon} {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-xs font-bold text-gray-500 mb-2">📂 加入時順便分類（可複選，亦可稍後設定）</div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSaveIsFavorite(prev => !prev)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border ${
                            saveIsFavorite
                              ? 'bg-rose-500 text-white border-rose-500 shadow-xs'
                              : 'bg-white text-gray-600 border-gray-200 hover:bg-rose-50'
                          }`}
                        >
                          {saveIsFavorite ? '❤️ 我的最愛' : '🤍 我的最愛'}
                        </button>
                        {customFolders.map(folder => {
                          const isChosen = saveFolderSelection.includes(folder);
                          const colorStyle = getFolderColor(folder);
                          return (
                            <button
                              key={folder}
                              type="button"
                              onClick={() =>
                                setSaveFolderSelection(prev =>
                                  prev.includes(folder) ? prev.filter(f => f !== folder) : [...prev, folder]
                                )
                              }
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border flex items-center gap-1.5 ${
                                isChosen ? colorStyle.chipSelected : colorStyle.chipUnselected
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  isChosen ? 'bg-white/90' : colorStyle.dot
                                }`}
                              />
                              <span>
                                {getFolderIcon(folder)} {folder}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      onClick={handleSaveLocation}
                      disabled={isSaving}
                      className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-blue-700 active:scale-95 disabled:opacity-60"
                    >
                      {isSaving ? '✨ AI 正在辨識商圈與標籤...' : '✨ 加到我的清單（AI 自動分類與標籤）'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* ✨ AI 智能擷取景點面板 (文字 / 截圖) */
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-extrabold text-gray-800 flex items-center gap-1.5">
                      <span>✨</span> 智能擷取整段文字或截圖
                    </h2>
                    {(extractText || extractImagePreview) && (
                      <button
                        type="button"
                        onClick={() => {
                          setExtractText('');
                          setExtractImagePreview(null);
                          setExtractImageData(null);
                          setExtractedItems([]);
                          setExtractError(null);
                        }}
                        className="text-xs font-bold text-gray-400 hover:text-gray-600"
                      >
                        清空
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                    貼上 IG／Threads／遊記文章，或直接上傳／貼上（Ctrl+V）旅遊截圖，AI 會自動抓出所有店名與景點、標註中文商圈與標籤，一鍵加入清單！
                  </p>

                  <textarea
                    rows={4}
                    value={extractText}
                    onChange={(e) => {
                      setExtractText(e.target.value);
                      if (extractError) setExtractError(null);
                    }}
                    onPaste={handlePasteInExtractor}
                    placeholder="例如：大阪三天兩夜必吃！第一天晚上去道頓堀「燒肉力丸」，隔天早上吃黑門市場海鮮，下午逛心齋橋 HARBS 吃千層蛋糕，最後買老爺爺起司蛋糕當伴手禮..."
                    className="w-full rounded-xl border border-gray-200 bg-gray-50/70 p-3 text-base sm:text-sm outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition resize-y"
                  />

                  <input
                    ref={extractImageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleExtractImageFile(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />

                  {extractImagePreview && (
                    <div className="mt-3 relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                      <img
                        src={extractImagePreview}
                        alt="待辨識截圖"
                        className="max-h-48 w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setExtractImagePreview(null);
                          setExtractImageData(null);
                        }}
                        className="absolute top-2 right-2 bg-black/70 text-white text-xs font-bold px-2.5 py-1 rounded-lg hover:bg-black"
                      >
                        ✕ 移除圖片
                      </button>
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => extractImageInputRef.current?.click()}
                      className="px-3.5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition flex items-center gap-1.5 shrink-0"
                    >
                      <span>🖼️</span> 上傳截圖
                    </button>
                    <button
                      type="button"
                      onClick={handleSmartExtract}
                      disabled={isExtracting}
                      className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm transition active:scale-[0.99] disabled:opacity-60"
                    >
                      {isExtracting ? '✨ AI 正在分析並搜尋地點...' : '✨ 開始智能擷取'}
                    </button>
                  </div>
                </div>

                {extractError && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 leading-relaxed">
                    ⚠️ {extractError}
                  </div>
                )}

                {extractedItems.length > 0 && (
                  <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-indigo-200 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-extrabold text-gray-900">
                        📍 擷取結果（共 {extractedItems.length} 個）
                      </h3>
                      <span className="text-xs font-bold text-indigo-600">
                        已選 {extractedItems.filter(i => i.selected && i.matchedPlace).length} 個
                      </span>
                    </div>

                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-0.5">
                      {extractedItems.map((item) => {
                        const isMatched = item.matchStatus === 'matched';
                        const isDuplicate = item.matchStatus === 'already_saved';
                        const isNotFound = item.matchStatus === 'not_found';

                        return (
                          <div
                            key={item.key}
                            onClick={() => {
                              if (!item.matchedPlace || isDuplicate) return;
                              setExtractedItems(prev =>
                                prev.map(p => (p.key === item.key ? { ...p, selected: !p.selected } : p))
                              );
                            }}
                            className={`rounded-xl p-3 border transition ${
                              isNotFound
                                ? 'bg-gray-50 border-gray-200 opacity-70'
                                : isDuplicate
                                  ? 'bg-emerald-50/50 border-emerald-200'
                                  : item.selected
                                    ? 'bg-indigo-50/50 border-indigo-400 cursor-pointer'
                                    : 'bg-white border-gray-200 cursor-pointer hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              {isMatched && (
                                <div
                                  className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition ${
                                    item.selected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 bg-white'
                                  }`}
                                >
                                  {item.selected && <span className="text-xs">✓</span>}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="font-bold text-sm text-gray-900">
                                    {item.matchedPlace?.displayName?.text || item.extractedName}
                                  </span>
                                  {isDuplicate && (
                                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                      ✓ 已在清單中
                                    </span>
                                  )}
                                  {isNotFound && (
                                    <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                                      未找到 Google 地點
                                    </span>
                                  )}
                                </div>

                                {item.matchedPlace?.formattedAddress && (
                                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                                    📍 {item.matchedPlace.formattedAddress}
                                  </p>
                                )}

                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {(item.hintCity || item.hintArea) && (
                                    <span className="text-[10px] font-bold bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                                      {[item.hintCity, item.hintArea].filter(Boolean).join(' · ')}
                                    </span>
                                  )}
                                  {item.tags.map((tag, idx) => (
                                    <span key={idx} className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                      #{tag}
                                    </span>
                                  ))}
                                </div>

                                {item.note && (
                                  <p className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200/70 px-2 py-1 rounded-lg">
                                    📝 {item.note}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={handleBatchSaveExtracted}
                      disabled={isBatchSaving || extractedItems.filter(i => i.selected && i.matchedPlace).length === 0}
                      className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md transition active:scale-95 disabled:opacity-50"
                    >
                      {isBatchSaving
                        ? '✨ 正在分類並加入清單...'
                        : `📥 一鍵加入我的清單 (${extractedItems.filter(i => i.selected && i.matchedPlace).length})`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* === 📁 清單分頁 === */}
        {activeTab === 'list' && (
          <div className="animate-in fade-in duration-300 flex flex-col h-full">

            {savedPlaces.length > 0 && (
              <>
                {/* 🌟 我的最愛 & 自訂清單夾切換檢視列 */}
                <div className="mb-3 rounded-2xl bg-white p-3 shadow-xs ring-1 ring-gray-200/80">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                      <span>📂</span> 清單分類檢視
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowFolderSettingsModal(true)}
                        className="text-[11px] font-bold text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <span>🎨</span> 顏色設定
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNewFolderInput(prev => !prev)}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        {showNewFolderInput ? '取消新增' : '＋ 新增清單夾'}
                      </button>
                    </div>
                  </div>

                  {showNewFolderInput && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleCreateCustomFolder();
                      }}
                      className="mb-2.5 rounded-xl bg-gray-50/90 border border-indigo-100 p-2.5 space-y-2"
                    >
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          placeholder="輸入自訂清單夾名稱（如：必吃美食）..."
                          className="flex-1 min-w-0 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-base sm:text-xs outline-none focus:border-indigo-500"
                        />
                        <button
                          type="submit"
                          className="shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 transition-colors"
                        >
                          建立
                        </button>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold text-gray-500">標籤顏色：</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {FOLDER_COLOR_OPTIONS.map(color => {
                            const isSelected = newFolderColor === color.id;
                            return (
                              <button
                                key={color.id}
                                type="button"
                                title={color.label}
                                aria-label={`選擇${color.label}色`}
                                onClick={() => setNewFolderColor(color.id)}
                                className={`w-6 h-6 rounded-full ${color.dot} transition-transform flex items-center justify-center ${
                                  isSelected ? `ring-2 ring-offset-2 ${color.swatchRing} scale-110` : 'opacity-75 hover:opacity-100'
                                }`}
                              >
                                {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </form>
                  )}

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                    <button
                      type="button"
                      onClick={() => handleSelectCollectionView('all')}
                      className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        activeCollectionView === 'all'
                          ? 'bg-gray-900 text-white shadow-xs'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <span>📋 全部</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          activeCollectionView === 'all' ? 'bg-gray-700 text-white' : 'bg-white text-gray-600'
                        }`}
                      >
                        {filteredBySearch.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectCollectionView('favorites')}
                      className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        activeCollectionView === 'favorites'
                          ? 'bg-rose-500 text-white shadow-xs'
                          : 'bg-rose-50 text-rose-700 hover:bg-rose-100 ring-1 ring-rose-200/70'
                      }`}
                    >
                      <span>❤️ 我的最愛</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          activeCollectionView === 'favorites' ? 'bg-rose-400 text-white' : 'bg-white text-rose-600'
                        }`}
                      >
                        {filteredBySearch.filter(p => Boolean(p.isFavorite)).length}
                      </span>
                    </button>

                    {customFolders.map(folder => {
                      const isActive = activeCollectionView === folder;
                      const isDefaultFolder = (DEFAULT_CUSTOM_FOLDERS as readonly string[]).includes(folder);
                      const count = filteredBySearch.filter(p => (p.lists || []).includes(folder)).length;
                      const colorStyle = getFolderColor(folder);

                      return (
                        <div key={folder} className="shrink-0 flex items-center">
                          <button
                            type="button"
                            onClick={() => handleSelectCollectionView(folder)}
                            className={`px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                              isDefaultFolder ? 'rounded-xl' : 'rounded-l-xl'
                            } ${isActive ? colorStyle.tabActive : colorStyle.tabInactive}`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isActive ? 'bg-white' : colorStyle.dot
                              }`}
                            />
                            <span>
                              {getFolderIcon(folder)} {folder}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                                isActive ? colorStyle.tabBadgeActive : colorStyle.tabBadgeInactive
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                          {!isDefaultFolder && (
                            <button
                              type="button"
                              title={`移除「${folder}」清單夾`}
                              onClick={() => handleDeleteCustomFolder(folder)}
                              className={`px-1.5 py-1.5 rounded-r-xl text-[11px] font-bold transition-colors border-l ${
                                isActive ? colorStyle.tabCloseActive : colorStyle.tabCloseInactive
                              }`}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 搜尋欄 */}
                <div className="mb-2.5">
                  <input
                    type="text"
                    placeholder="搜尋名稱、#標籤、區域、備註 (如：#拉麵, 難波)..."
                    value={listSearchQuery}
                    onChange={(e) => setListSearchQuery(e.target.value)}
                    className="w-full rounded-xl bg-white px-4 py-3 text-base outline-none shadow-sm ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-sm"
                  />
                </div>

                {/* 🌟 大分類快速過濾（飲食／景點／購物）＋ 自訂標籤雲快速篩選 */}
                <div className="mb-3 rounded-2xl bg-white p-3 shadow-xs ring-1 ring-gray-200/80 space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                        <span>🗂️</span> 大分類快速過濾
                      </span>
                      {selectedTag && (
                        <button
                          type="button"
                          onClick={() => setSelectedTag(null)}
                          className="text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full transition-colors"
                        >
                          ✕ 清除篩選 ({selectedTag})
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_CATEGORY_TAGS.map(preset => {
                        const isTagSelected = selectedTag === preset.label;
                        const count = tagCountsMap[preset.label] || 0;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setSelectedTag(prev => (prev === preset.label ? null : preset.label))}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                              isTagSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-blue-50 hover:border-blue-200'
                            }`}
                          >
                            <span>
                              {preset.icon} {preset.label}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 rounded-full ${
                                isTagSelected ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200/80'
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {detailTagCloudList.length > 0 && (
                    <div className="pt-2 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setIsTagCloudOpen(prev => !prev)}
                        aria-expanded={isTagCloudOpen}
                        className="w-full flex items-center justify-between gap-2 py-0.5 text-left group"
                      >
                        <span className="text-xs font-bold text-gray-500 group-hover:text-gray-700 flex items-center gap-1.5 transition-colors">
                          <span>🏷️</span>
                          <span>標籤雲快速篩選</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-100 text-gray-500">
                            {detailTagCloudList.length}
                          </span>
                          {selectedTag && !PRESET_CATEGORY_LABELS.includes(selectedTag) && (
                            <span className="text-[10px] px-2 py-0.2 rounded-full bg-blue-600 text-white">
                              #{selectedTag}
                            </span>
                          )}
                        </span>
                        <span
                          className={`text-[10px] font-bold text-gray-400 group-hover:text-gray-600 transition-transform duration-200 ${
                            isTagCloudOpen ? 'rotate-180' : ''
                          }`}
                        >
                          ▼
                        </span>
                      </button>

                      {isTagCloudOpen && (
                        <div className="mt-2 flex flex-wrap gap-1.5 animate-in fade-in duration-150">
                          {detailTagCloudList.map(([tag, count]) => {
                            const isTagSelected = selectedTag === tag;
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => setSelectedTag(prev => (prev === tag ? null : tag))}
                                className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                                  isTagSelected
                                    ? 'bg-blue-600 text-white shadow-xs scale-[1.02]'
                                    : 'bg-blue-50/80 text-blue-700 hover:bg-blue-100 ring-1 ring-blue-200/60'
                                }`}
                              >
                                <span>#{tag}</span>
                                <span
                                  className={`text-[10px] px-1.5 rounded-full ${
                                    isTagSelected ? 'bg-blue-500 text-white' : 'bg-white/90 text-blue-600'
                                  }`}
                                >
                                  {count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 🌟 修改提議 5：補回國家快速篩選列 (全部 / 🇯🇵 日本 / 🇹🇼 台灣 / 🇰🇷 韓國) */}
                <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {countryTabs.map(tab => {
                    const isActive = selectedCountryTab === tab;
                    const count = tab === '全部'
                      ? placesInCollectionView.length
                      : placesInCollectionView.filter(
                          p => getCountryCityArea(p.addressComponents || [], p.formattedAddress || '').country === tab
                        ).length;

                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => {
                          setSelectedCountryTab(tab);
                          if (tab !== '全部') {
                            setExpandedRegions(prev => ({ ...prev, [tab]: true }));
                          }
                        }}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-white text-gray-600 hover:bg-gray-100 ring-1 ring-gray-200'
                        }`}
                      >
                        <span>{tab}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 匯出至 Trip Plan、批次選取刪除與 JSON 備份工具列 */}
                <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isExportMode ? (
                      <>
                        <button
                          type="button"
                          onClick={() => { setIsExportMode(false); setSelectedExportIds([]); }}
                          className="whitespace-nowrap px-3 py-2 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={handleRichExport}
                          className="whitespace-nowrap px-3.5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-colors shadow-md"
                        >
                          傳送 ({selectedExportIds.length})
                        </button>
                      </>
                    ) : isDeleteSelectMode ? (
                      <>
                        <button
                          type="button"
                          onClick={() => { setIsDeleteSelectMode(false); setSelectedDeleteIds([]); }}
                          className="whitespace-nowrap px-3 py-2 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                        >
                          取消選取
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleSelectGroupIds(displayPlaces.map(p => p.id))}
                          className="whitespace-nowrap px-3 py-2 text-sm font-bold text-gray-700 bg-white ring-1 ring-gray-300 hover:bg-gray-50 rounded-full transition-colors"
                        >
                          {displayPlaces.length > 0 && displayPlaces.every(p => selectedDeleteIds.includes(p.id))
                            ? '取消全選'
                            : `全選顯示 (${displayPlaces.length})`}
                        </button>
                        <button
                          type="button"
                          disabled={selectedDeleteIds.length === 0}
                          onClick={() => setFolderPickerTarget('__batch__')}
                          className="whitespace-nowrap px-3 py-2 text-sm font-bold text-indigo-700 bg-indigo-50 ring-1 ring-indigo-200 hover:bg-indigo-100 rounded-full transition-colors disabled:opacity-40"
                        >
                          📂 分類 ({selectedDeleteIds.length})
                        </button>
                        <button
                          type="button"
                          disabled={selectedDeleteIds.length === 0}
                          onClick={() => setShowBatchDeleteConfirm(true)}
                          className="whitespace-nowrap px-3.5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-full transition-colors shadow-md disabled:opacity-40"
                        >
                          🗑️ 刪除所選 ({selectedDeleteIds.length})
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setIsDeleteSelectMode(false);
                            setSelectedDeleteIds([]);
                            setIsExportMode(true);
                          }}
                          className="whitespace-nowrap px-3.5 py-2 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full transition-colors flex items-center gap-1"
                        >
                          <span>✈️</span> 傳送到 Trip Plan
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsExportMode(false);
                            setSelectedExportIds([]);
                            setSelectedDeleteIds([]);
                            setIsDeleteSelectMode(true);
                          }}
                          className="whitespace-nowrap px-3.5 py-2 text-sm font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-full transition-colors flex items-center gap-1"
                        >
                          <span>☑️</span> 選取模式
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadBackup}
                          className="whitespace-nowrap px-3.5 py-2 text-sm font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-full transition-colors flex items-center gap-1"
                        >
                          <span>💾</span> 匯出備份
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="whitespace-nowrap px-3.5 py-2 text-sm font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-full transition-colors flex items-center gap-1"
                        >
                          <span>📂</span> 匯入備份
                        </button>
                      </>
                    )}
                  </div>

                  {isExportMode && (
                    <span className="text-xs text-blue-600 font-medium">
                      💡 可直接點選城市或區域旁「全選」
                    </span>
                  )}
                  {isDeleteSelectMode && (
                    <span className="text-xs text-rose-600 font-medium">
                      💡 點選景點卡片或城市／區域「全選」來批次移除
                    </span>
                  )}
                </div>

                {/* 🌟 修改提議 3：在清單頂部浮出「📍 距離『某店』2km 內的景點」專屬區塊 */}
                {centerPlace && (
                  <div className="mb-3 rounded-2xl bg-amber-50/90 border border-amber-300 p-3.5 shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-xs font-bold text-amber-900 leading-snug">
                        📍 距離「{centerPlace.customName || centerPlace.displayName?.text || '未知名稱'}」2km 內的景點（共 {nearbyPlacesWithDistance.length} 個）
                      </div>
                      <button
                        type="button"
                        onClick={() => { setCenterId(null); setNearbyIds([]); }}
                        className="shrink-0 px-2 py-1 rounded-lg bg-amber-200/70 hover:bg-amber-300 text-amber-900 text-xs font-bold transition-colors"
                      >
                        ✕ 關閉
                      </button>
                    </div>

                    {nearbyPlacesWithDistance.length === 0 ? (
                      <div className="text-xs text-amber-700 bg-white/70 rounded-xl p-2.5 text-center">
                        2 公里內暫無其他收藏景點
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                        {nearbyPlacesWithDistance.map(({ place, distKm }) => {
                          const autoLoc = getCountryCityArea(place.addressComponents || []);
                          const areaLabel = place.customArea || autoLoc.area;
                          const cityLabel = place.customCity || autoLoc.city;
                          const noteText = place.customNote || place.note || place.notes || '';
                          const isSelectedItem = activeSelectedIds.includes(place.id);

                          return (
                            <div
                              key={`nearby-top-${place.id}`}
                              onClick={() => {
                                if (isAnySelectionMode) {
                                  togglePlaceSelection(place.id);
                                } else {
                                  toggleCard(place.id);
                                }
                              }}
                              className={`bg-white rounded-xl p-2.5 border border-amber-200 shadow-xs flex items-center justify-between gap-2 cursor-pointer hover:bg-amber-50/40 transition ${
                                isSelectedItem
                                  ? isDeleteSelectMode
                                    ? 'ring-2 ring-red-500'
                                    : 'ring-2 ring-blue-500'
                                  : ''
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {isAnySelectionMode && (
                                    <div
                                      className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                                        isSelectedItem
                                          ? isDeleteSelectMode
                                            ? 'bg-red-600 border-red-600 text-white'
                                            : 'bg-blue-500 border-blue-500 text-white'
                                          : 'border-gray-300'
                                      }`}
                                    >
                                      {isSelectedItem && <span className="text-[10px]">✓</span>}
                                    </div>
                                  )}
                                  <span className="text-xs font-extrabold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                                    {formatDistance(distKm)}
                                  </span>
                                  <span className="text-sm font-bold text-gray-900 truncate">
                                    {place.customName || place.displayName?.text || '未知名稱'}
                                  </span>
                                </div>
                                <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[11px] text-gray-500">
                                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-medium">
                                    {cityLabel} · {areaLabel}
                                  </span>
                                  {place.customTags?.map((t, idx) => (
                                    <span key={idx} className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">
                                      #{t}
                                    </span>
                                  ))}
                                </div>
                                {noteText && (
                                  <div className="mt-1 text-[11px] text-amber-800 truncate">
                                    📝 {noteText}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openInGoogleMaps(place);
                                  }}
                                  className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100"
                                >
                                  🗺️
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditModal(place);
                                  }}
                                  className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-blue-500 hover:text-white"
                                >
                                  ✏️
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* 隱藏的 JSON 備份檔案上傳元件 */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportBackup}
              className="hidden"
            />

            <div className="space-y-4 mt-2">
              {Object.keys(groupedByLocation).length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                  <div className="text-4xl mb-4">
                    {activeCollectionView === 'favorites' ? '🤍' : '🧳'}
                  </div>
                  <p>
                    {savedPlaces.length === 0
                      ? '清單空空如也，快去搜尋想去的地點吧！'
                      : activeCollectionView === 'favorites'
                        ? '目前「我的最愛」還沒有地點，點擊卡片上的 🤍 即可加入！'
                        : activeCollectionView !== 'all'
                          ? `目前「${activeCollectionView}」清單夾還沒有地點，點擊卡片上的「📂 分類」即可加入！`
                          : '找不到符合的地點'}
                  </p>
                  {savedPlaces.length === 0 && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 ring-1 ring-amber-200 rounded-full transition-colors shadow-xs"
                    >
                      <span>📂</span> 從 JSON 備份檔還原清單
                    </button>
                  )}
                </div>
              ) : (
                Object.entries(groupedByLocation).map(([country, cityGroups]) => {
                  const isCountryExpanded = !!expandedRegions[country] || hasActiveSearch || selectedCountryTab === country;

                  let countryTotalPlaces = 0;
                  Object.values(cityGroups).forEach(areaGroups => {
                    Object.values(areaGroups).forEach(places => { countryTotalPlaces += places.length; });
                  });

                  return (
                    <div key={country} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

                      <div
                        className="bg-gray-50 p-4 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition"
                        onClick={() => toggleRegion(country)}
                      >
                        <h2 className="text-lg font-bold text-gray-800 flex items-center">
                          {country}
                          <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{countryTotalPlaces}</span>
                        </h2>
                        <span className="text-gray-400 font-bold text-xl">
                          {isCountryExpanded ? '▲' : '▼'}
                        </span>
                      </div>

                      {isCountryExpanded && (
                        <div className="grid border-t border-gray-100 bg-white">
                          {Object.entries(cityGroups).map(([city, areaGroups]) => {
                            const cityKey = `${country}-${city}`;
                            const isCityExpanded = !!expandedCities[cityKey] || hasActiveSearch;

                            const cityPlacesList = Object.values(areaGroups).flat();
                            const cityPlaceIds = cityPlacesList.map(p => p.id);
                            const cityTotalPlaces = cityPlacesList.length;
                            const isAllCitySelected = cityPlaceIds.length > 0 && cityPlaceIds.every(id => activeSelectedIds.includes(id));

                            return (
                              <div key={cityKey} className="border-b border-gray-50 last:border-0">
                                <div
                                  className="flex justify-between items-center cursor-pointer hover:bg-gray-50 p-3 transition-colors"
                                  onClick={() => toggleCity(cityKey)}
                                >
                                  <h3 className="font-bold text-gray-700 text-base flex items-center">
                                    <span className="text-gray-400 mr-2 text-xs">📍</span>
                                    {city}
                                    <span className="ml-2 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{cityTotalPlaces}</span>
                                  </h3>

                                  <div className="flex items-center gap-2">
                                    {isAnySelectionMode && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleSelectGroupIds(cityPlaceIds);
                                        }}
                                        className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
                                          isAllCitySelected
                                            ? isDeleteSelectMode
                                              ? 'bg-red-600 text-white shadow-xs'
                                              : 'bg-blue-600 text-white shadow-xs'
                                            : isDeleteSelectMode
                                              ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 ring-1 ring-rose-200'
                                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100 ring-1 ring-blue-200'
                                        }`}
                                      >
                                        {isAllCitySelected ? '✓ 已全選此城' : '全選此城'}
                                      </button>
                                    )}
                                    <span className="text-gray-400 text-sm font-bold">
                                      {isCityExpanded ? '▲' : '▼'}
                                    </span>
                                  </div>
                                </div>

                                {isCityExpanded && (
                                  <div className="bg-gray-50/50 pb-2">
                                    {Object.entries(areaGroups).map(([area, places]) => {
                                      const areaKey = `${cityKey}-${area}`;
                                      const isAreaExpanded = !!expandedAreas[areaKey] || hasActiveSearch;
                                      const areaPlaceIds = places.map(p => p.id);
                                      const isAllAreaSelected = areaPlaceIds.length > 0 && areaPlaceIds.every(id => activeSelectedIds.includes(id));
                                      const currentSort = areaSortMap[areaKey] || 'default';

                                      // 依據該區域選擇的排序方式排序景點
                                      const sortedPlaces = [...places].sort((a, b) => {
                                        if (currentSort === 'name') {
                                          const nameA = a.customName || a.displayName?.text || '';
                                          const nameB = b.customName || b.displayName?.text || '';
                                          return nameA.localeCompare(nameB, 'zh-Hant');
                                        }
                                        if (currentSort === 'rating') {
                                          const ratingDiff = (b.rating ?? -1) - (a.rating ?? -1);
                                          if (ratingDiff !== 0) return ratingDiff;
                                          return (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0);
                                        }
                                        if (currentSort === 'distance') {
                                          const distA = getDistanceForAreaSort(a, places) ?? Number.POSITIVE_INFINITY;
                                          const distB = getDistanceForAreaSort(b, places) ?? Number.POSITIVE_INFINITY;
                                          return distA - distB;
                                        }
                                        return 0;
                                      });

                                      return (
                                        <div key={areaKey} className="px-3 pt-2 pb-1">
                                          <div
                                            className="flex justify-between items-center gap-2 cursor-pointer hover:bg-gray-100 p-2 rounded-lg transition-colors border-l-4 border-blue-400 bg-white shadow-sm mb-2"
                                            onClick={() => toggleArea(areaKey)}
                                          >
                                            <h4 className="font-bold text-gray-600 text-sm flex items-center min-w-0">
                                              <span className="truncate">{area}</span>
                                              <span className="ml-2 shrink-0 text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{places.length}</span>
                                            </h4>

                                            <div className="flex items-center gap-1.5 shrink-0">
                                              {/* 🌟 區域內景點排序下拉選單 */}
                                              <select
                                                value={currentSort}
                                                aria-label={`${area} 景點排序`}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => {
                                                  e.stopPropagation();
                                                  handleAreaSortChange(
                                                    areaKey,
                                                    e.target.value as 'default' | 'name' | 'rating' | 'distance'
                                                  );
                                                }}
                                                className="text-base sm:text-[11px] font-bold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                                              >
                                                <option value="default">排序：預設</option>
                                                <option value="name">名稱 (A-Z)</option>
                                                <option value="rating">評分 (高➔低)</option>
                                                <option value="distance">距離 (近➔遠)</option>
                                              </select>

                                              {isAnySelectionMode && (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleSelectGroupIds(areaPlaceIds);
                                                  }}
                                                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition-colors ${
                                                    isAllAreaSelected
                                                      ? isDeleteSelectMode
                                                        ? 'bg-red-600 text-white shadow-xs'
                                                        : 'bg-blue-600 text-white shadow-xs'
                                                      : isDeleteSelectMode
                                                        ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 ring-1 ring-rose-200'
                                                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100 ring-1 ring-blue-200'
                                                  }`}
                                                >
                                                  {isAllAreaSelected ? '✓ 已全選此區' : '全選此區'}
                                                </button>
                                              )}
                                              <span className="text-gray-400 text-xs font-bold">
                                                {isAreaExpanded ? '▲' : '▼'}
                                              </span>
                                            </div>
                                          </div>

                                          {isAreaExpanded && (
                                            <div className="grid gap-3 pl-2 pr-1 mb-3">
                                              {sortedPlaces.map(place => {
                                                const isExpanded = expandedCards.includes(place.id);
                                                const isCenter = centerId === place.id;
                                                const isNearby = nearbyIds.includes(place.id);
                                                const isSelectedItem = activeSelectedIds.includes(place.id);
                                                const noteText = place.customNote || place.note || place.notes || '';
                                                const distanceFromCenter =
                                                  isNearby && centerPlace?.location?.latitude && place.location?.latitude
                                                    ? calculateDistance(
                                                        centerPlace.location.latitude,
                                                        centerPlace.location.longitude,
                                                        place.location.latitude,
                                                        place.location.longitude
                                                      )
                                                    : currentSort === 'distance'
                                                      ? getDistanceForAreaSort(place, places)
                                                      : null;

                                                return (
                                                  <div
                                                    key={place.id}
                                                    className={`rounded-xl shadow-sm ring-1 overflow-hidden transition-all duration-300 ${
                                                      isSelectedItem && isDeleteSelectMode
                                                        ? 'ring-2 ring-red-500 bg-rose-50/70'
                                                        : isSelectedItem && isExportMode
                                                          ? 'ring-2 ring-blue-500 bg-blue-50/40'
                                                          : isCenter
                                                            ? 'ring-blue-500 bg-blue-50'
                                                            : isNearby
                                                              ? 'ring-yellow-400 bg-yellow-50'
                                                              : 'ring-gray-200 bg-white'
                                                    }`}
                                                  >

                                                    <div
                                                      className={`p-3 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-gray-50 ${
                                                        isSelectedItem
                                                          ? isDeleteSelectMode
                                                            ? 'bg-rose-50/60'
                                                            : 'bg-blue-50/50'
                                                          : ''
                                                      }`}
                                                      onClick={() => {
                                                        if (isAnySelectionMode) {
                                                          togglePlaceSelection(place.id);
                                                        } else {
                                                          toggleCard(place.id);
                                                        }
                                                      }}
                                                    >
                                                      <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                                        {isAnySelectionMode && (
                                                          <div
                                                            className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                                                              isSelectedItem
                                                                ? isDeleteSelectMode
                                                                  ? 'bg-red-600 border-red-600'
                                                                  : 'bg-blue-500 border-blue-500'
                                                                : 'border-gray-300 bg-white'
                                                            }`}
                                                          >
                                                            {isSelectedItem && <span className="text-white text-xs">✓</span>}
                                                          </div>
                                                        )}

                                                        <h3 className="font-bold text-[15px] text-gray-900 leading-snug flex-1 truncate">
                                                          {isCenter && <span className="mr-1">📍</span>}
                                                          {isNearby && <span className="mr-1">⭐</span>}
                                                          {place.customName || place.displayName?.text || '未知名稱'}
                                                          {currentSort === 'rating' && place.rating && (
                                                            <span className="ml-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                                              ⭐ {place.rating}
                                                            </span>
                                                          )}
                                                          {distanceFromCenter !== null && (
                                                            <span className="ml-1.5 text-[11px] font-extrabold text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded">
                                                              {formatDistance(distanceFromCenter)}
                                                            </span>
                                                          )}
                                                        </h3>
                                                      </div>

                                                      <div className="flex items-center gap-2 shrink-0">
                                                        <span className={`text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>

                                                        <button
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            findNearbySavedPlaces(place);
                                                          }}
                                                          className={`px-2.5 py-1.5 rounded text-white text-xs font-bold ${isCenter ? 'bg-gray-400' : 'bg-green-500'}`}
                                                        >
                                                          {isCenter ? '❌ 取消' : '📍 附近'}
                                                        </button>
                                                        <button
                                                          onClick={(e) => { e.stopPropagation(); openEditModal(place); }}
                                                          className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-blue-500 hover:text-white transition-colors"
                                                        >
                                                          ✏️
                                                        </button>
                                                        <button
                                                          onClick={(e) => { e.stopPropagation(); handleDelete(place.id, place.customName || place.displayName?.text || '此地點'); }}
                                                          className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors"
                                                        >
                                                          🗑️
                                                        </button>
                                                      </div>
                                                    </div>

                                                    {/* ❤️ 我的最愛 + 📂 清單夾分類列 + 標籤 + 備註 */}
                                                    <div className="px-3 pb-2 -mt-1 space-y-1.5">
                                                      <div className="flex items-center gap-1.5 flex-wrap">
                                                        <button
                                                          type="button"
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleFavorite(place.id);
                                                          }}
                                                          className={`text-[11px] font-bold px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1 ${
                                                            place.isFavorite
                                                              ? 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
                                                              : 'bg-gray-100 text-gray-500 hover:bg-rose-50 hover:text-rose-600'
                                                          }`}
                                                        >
                                                          <span>{place.isFavorite ? '❤️' : '🤍'}</span>
                                                          <span>{place.isFavorite ? '最愛' : '收藏'}</span>
                                                        </button>

                                                        {(place.lists || []).map(folder => {
                                                          const colorStyle = getFolderColor(folder);
                                                          return (
                                                            <button
                                                              key={folder}
                                                              type="button"
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                setFolderPickerTarget(place.id);
                                                              }}
                                                              className={`text-[11px] font-bold px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1 ${colorStyle.badge}`}
                                                            >
                                                              <span className={`w-2 h-2 rounded-full shrink-0 ${colorStyle.dot}`} />
                                                              <span>
                                                                {getFolderIcon(folder)} {folder}
                                                              </span>
                                                            </button>
                                                          );
                                                        })}

                                                        <button
                                                          type="button"
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            setFolderPickerTarget(place.id);
                                                          }}
                                                          className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                                                        >
                                                          📂 {(place.lists || []).length > 0 ? '調整分類' : '加入清單夾'}
                                                        </button>
                                                      </div>

                                                      {place.customTags && place.customTags.length > 0 && (
                                                        <div className="flex gap-1 flex-wrap">
                                                          {place.customTags.map((tag, idx) => (
                                                            <button
                                                              key={idx}
                                                              type="button"
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedTag(prev => (prev === tag.trim() ? null : tag.trim()));
                                                              }}
                                                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                                                                selectedTag === tag.trim()
                                                                  ? 'bg-blue-600 text-white'
                                                                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                                              }`}
                                                            >
                                                              #{tag}
                                                            </button>
                                                          ))}
                                                        </div>
                                                      )}
                                                      {noteText && (
                                                        <div className="text-xs text-amber-800 bg-amber-50/80 border border-amber-200/70 px-2 py-1 rounded-lg">
                                                          📝 {noteText}
                                                        </div>
                                                      )}
                                                    </div>

                                                    {isExpanded && (
                                                      <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/50">
                                                        <div className="text-xs text-gray-500 flex items-center gap-2 mb-3">
                                                          {place.rating && <span className="text-amber-500 font-medium bg-amber-50 px-2 py-1 rounded">⭐ {place.rating} ({place.userRatingCount || 0})</span>}
                                                        </div>
                                                        <div className="text-xs text-gray-500 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                                          <div className="flex items-start">
                                                            <span className="mr-1.5">📍</span>
                                                            <span>{place.formattedAddress || '無詳細地址'}</span>
                                                          </div>
                                                          {renderOpeningHours(place.regularOpeningHours)}
                                                        </div>

                                                        <div className="mt-3 flex gap-2">
                                                          <button
                                                            onClick={() => openInGoogleMaps(place)}
                                                            className="flex-1 py-2 bg-blue-100 text-blue-700 font-bold text-sm rounded-xl hover:bg-blue-200 transition-colors flex justify-center items-center gap-2"
                                                          >
                                                            <span>🗺️</span> 開啟
                                                          </button>
                                                          <button
                                                            onClick={() => handleFindBranches(place)}
                                                            className="flex-1 py-2 bg-purple-100 text-purple-700 font-bold text-sm rounded-xl hover:bg-purple-200 transition-colors flex justify-center items-center gap-2"
                                                          >
                                                            <span>🏪</span> 分店
                                                          </button>
                                                        </div>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* === 底部導覽列 === */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe z-50">
        <div className="max-w-md mx-auto flex">
          <button onClick={() => setActiveTab('search')} className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'search' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <span className="text-xl">🔍</span><span className="text-[10px] font-bold">搜尋地點</span>
          </button>
          <button onClick={() => setActiveTab('list')} className={`flex-1 py-4 flex flex-col items-center gap-1 relative transition-colors ${activeTab === 'list' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <span className="text-xl">📁</span><span className="text-[10px] font-bold">我的清單</span>
            {savedPlaces.length > 0 && activeTab === 'search' && <span className="absolute top-3 right-1/4 translate-x-3 w-2 h-2 bg-red-500 rounded-full border border-white"></span>}
          </button>
        </div>
      </div>

      {/* === 📝 編輯視窗 (Modal) === */}
      {editingPlace && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-xl font-bold">✏️ 編輯地點資訊</h2>
              <button
                type="button"
                onClick={handleAiReclassifyInEdit}
                disabled={isAiClassifyingEdit}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition disabled:opacity-50"
              >
                {isAiClassifyingEdit ? '✨ 辨識中...' : '✨ AI 自動分類與標籤'}
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1 font-bold">店名 / 景點名稱</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm text-gray-600 mb-1 font-bold">城市</label>
                  <input type="text" value={editForm.city} onChange={e => setEditForm({...editForm, city: e.target.value})} className="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="例如：大阪" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-gray-600 mb-1 font-bold">區域 (商圈)</label>
                  <input type="text" value={editForm.area} onChange={e => setEditForm({...editForm, area: e.target.value})} className="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="例如：梅田, 難波" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1 font-bold">自訂標籤 (用逗號分隔)</label>
                <input type="text" value={editForm.tags} onChange={e => setEditForm({...editForm, tags: e.target.value})} className="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="例如：飲食, 拉麵, 必去" />
                <div className="mt-2 flex items-center flex-wrap gap-1.5">
                  <span className="text-[11px] font-bold text-gray-500">預設大分類：</span>
                  {PRESET_CATEGORY_TAGS.map(preset => {
                    const isSelected = parseTagInput(editForm.tags).includes(preset.label);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          setEditForm(prev => ({
                            ...prev,
                            tags: toggleTagInString(prev.tags, preset.label),
                          }))
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-300'
                        }`}
                      >
                        {preset.icon} {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1.5 font-bold">📂 我的最愛與清單夾分類</label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditForm(prev => ({ ...prev, isFavorite: !prev.isFavorite }))}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border ${
                      editForm.isFavorite
                        ? 'bg-rose-500 text-white border-rose-500 shadow-xs'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-rose-50'
                    }`}
                  >
                    {editForm.isFavorite ? '❤️ 我的最愛' : '🤍 我的最愛'}
                  </button>
                  {customFolders.map(folder => {
                    const isChecked = editForm.lists.includes(folder);
                    const colorStyle = getFolderColor(folder);
                    return (
                      <button
                        key={folder}
                        type="button"
                        onClick={() =>
                          setEditForm(prev => ({
                            ...prev,
                            lists: prev.lists.includes(folder)
                              ? prev.lists.filter(f => f !== folder)
                              : [...prev.lists, folder],
                          }))
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border flex items-center gap-1.5 ${
                          isChecked ? colorStyle.chipSelected : colorStyle.chipUnselected
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isChecked ? 'bg-white/90' : colorStyle.dot
                          }`}
                        />
                        <span>
                          {getFolderIcon(folder)} {folder}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1 font-bold">📝 旅遊備註</label>
                <textarea
                  rows={2}
                  value={editForm.note}
                  onChange={e => setEditForm({...editForm, note: e.target.value})}
                  className="w-full border border-gray-300 p-2 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-base sm:text-sm resize-none"
                  placeholder="例如：必吃抹茶芭菲、週二公休"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button onClick={() => setEditingPlace(null)} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200">取消</button>
              <button onClick={saveEdit} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">儲存變更</button>
            </div>
          </div>
        </div>
      )}

      {/* === 📂 快速指派清單夾與最愛彈窗 (單筆或批次選取) === */}
      {folderPickerTarget && (
        <div
          className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4"
          onClick={() => setFolderPickerTarget(null)}
        >
          <div
            className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl animate-in fade-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const isBatch = folderPickerTarget === '__batch__';
              const singlePlace = isBatch ? null : savedPlaces.find(p => p.id === folderPickerTarget) || null;
              const selectedSet = new Set(selectedDeleteIds);
              const batchTargets = isBatch ? savedPlaces.filter(p => selectedSet.has(p.id)) : [];
              const allBatchFav =
                batchTargets.length > 0 && batchTargets.every(p => Boolean(p.isFavorite));

              return (
                <>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="text-lg font-extrabold text-gray-900 truncate">
                      {isBatch
                        ? `📂 批次分類 (${batchTargets.length} 個地點)`
                        : `📂 ${singlePlace?.customName || singlePlace?.displayName?.text || '設定分類'}`}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setFolderPickerTarget(null)}
                      className="text-gray-400 hover:text-gray-600 font-bold text-lg px-1"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (isBatch) {
                          batchToggleFavoriteForSelected();
                        } else if (singlePlace) {
                          toggleFavorite(singlePlace.id);
                        }
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
                        (isBatch ? allBatchFav : singlePlace?.isFavorite)
                          ? 'bg-rose-50 border-rose-300 text-rose-700'
                          : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-rose-50/50'
                      }`}
                    >
                      <span>{(isBatch ? allBatchFav : singlePlace?.isFavorite) ? '❤️ 我的最愛' : '🤍 加入我的最愛'}</span>
                      <span className="text-xs">
                        {(isBatch ? allBatchFav : singlePlace?.isFavorite) ? '✓ 已加入' : '點選加入'}
                      </span>
                    </button>

                    {customFolders.map(folder => {
                      const isInFolder = isBatch
                        ? batchTargets.length > 0 && batchTargets.every(p => (p.lists || []).includes(folder))
                        : Boolean(singlePlace && (singlePlace.lists || []).includes(folder));
                      const partialInFolder =
                        isBatch &&
                        !isInFolder &&
                        batchTargets.some(p => (p.lists || []).includes(folder));
                      const colorStyle = getFolderColor(folder);

                      return (
                        <button
                          key={folder}
                          type="button"
                          onClick={() => {
                            if (isBatch) {
                              batchToggleFolderForSelected(folder);
                            } else if (singlePlace) {
                              togglePlaceInFolder(singlePlace.id, folder);
                            }
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
                            isInFolder
                              ? colorStyle.pickerSelected
                              : partialInFolder
                                ? colorStyle.pickerPartial
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorStyle.dot}`} />
                            <span>
                              {getFolderIcon(folder)} {folder}
                            </span>
                          </span>
                          <span className="text-xs">
                            {isInFolder ? '✓ 已加入' : partialInFolder ? '部分已加入' : '＋ 加入'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const createdName = handleCreateCustomFolder(newFolderName);
                      if (createdName) {
                        if (isBatch) {
                          const updated = savedPlaces.map(p =>
                            selectedSet.has(p.id)
                              ? { ...p, lists: Array.from(new Set([...(p.lists || []), createdName])) }
                              : p
                          );
                          persistPlaces(updated);
                        } else if (singlePlace) {
                          togglePlaceInFolder(singlePlace.id, createdName);
                        }
                      }
                    }}
                    className="mt-3 pt-3 border-t border-gray-100 space-y-2"
                  >
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="新增清單夾名稱..."
                        className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2 text-base sm:text-xs outline-none focus:border-indigo-500"
                      />
                      <button
                        type="submit"
                        className="shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-2 transition-colors"
                      >
                        ＋ 建立並加入
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-gray-500">顏色：</span>
                      {FOLDER_COLOR_OPTIONS.map(color => {
                        const isSelected = newFolderColor === color.id;
                        return (
                          <button
                            key={color.id}
                            type="button"
                            title={color.label}
                            aria-label={`選擇${color.label}色`}
                            onClick={() => setNewFolderColor(color.id)}
                            className={`w-5 h-5 rounded-full ${color.dot} transition-transform flex items-center justify-center ${
                              isSelected ? `ring-2 ring-offset-1 ${color.swatchRing} scale-110` : 'opacity-75 hover:opacity-100'
                            }`}
                          >
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </form>

                  <button
                    type="button"
                    onClick={() => setFolderPickerTarget(null)}
                    className="mt-4 w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors"
                  >
                    完成
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* === 🎨 自訂清單夾顏色設定視窗 (Modal) === */}
      {showFolderSettingsModal && (
        <div
          className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4"
          onClick={() => setShowFolderSettingsModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl animate-in fade-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-lg font-extrabold text-gray-900">🎨 清單夾顏色設定</h2>
              <button
                type="button"
                onClick={() => setShowFolderSettingsModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg px-1"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              點擊色塊即可變更各清單夾標籤顏色，清單頁面與景點卡片將同步更新顯示。
            </p>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-0.5">
              {customFolders.map(folder => {
                const isDefaultFolder = (DEFAULT_CUSTOM_FOLDERS as readonly string[]).includes(folder);
                const currentColor = getFolderColor(folder);

                return (
                  <div
                    key={folder}
                    className="rounded-xl border border-gray-200 p-2.5 bg-gray-50/50 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg ${currentColor.badge}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${currentColor.dot}`} />
                        <span>
                          {getFolderIcon(folder)} {folder}
                        </span>
                      </span>
                      {!isDefaultFolder && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomFolder(folder)}
                          className="text-[11px] font-bold text-rose-500 hover:text-rose-700 px-2 py-0.5 rounded hover:bg-rose-50 transition-colors"
                        >
                          🗑️ 移除
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {FOLDER_COLOR_OPTIONS.map(color => {
                        const isSelected = currentColor.id === color.id;
                        return (
                          <button
                            key={color.id}
                            type="button"
                            title={color.label}
                            aria-label={`將「${folder}」設為${color.label}色`}
                            onClick={() => updateFolderColor(folder, color.id)}
                            className={`w-6 h-6 rounded-full ${color.dot} transition-transform flex items-center justify-center ${
                              isSelected ? `ring-2 ring-offset-2 ${color.swatchRing} scale-110` : 'opacity-70 hover:opacity-100'
                            }`}
                          >
                            {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateCustomFolder();
              }}
              className="mt-3 pt-3 border-t border-gray-100 space-y-2"
            >
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="新增自訂清單夾..."
                  className="flex-1 min-w-0 rounded-xl border border-gray-200 px-3 py-2 text-base sm:text-xs outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-2 transition-colors"
                >
                  ＋ 建立
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-gray-500">顏色：</span>
                {FOLDER_COLOR_OPTIONS.map(color => {
                  const isSelected = newFolderColor === color.id;
                  return (
                    <button
                      key={color.id}
                      type="button"
                      title={color.label}
                      aria-label={`選擇${color.label}色`}
                      onClick={() => setNewFolderColor(color.id)}
                      className={`w-5 h-5 rounded-full ${color.dot} transition-transform flex items-center justify-center ${
                        isSelected ? `ring-2 ring-offset-1 ${color.swatchRing} scale-110` : 'opacity-75 hover:opacity-100'
                      }`}
                    >
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </button>
                  );
                })}
              </div>
            </form>

            <button
              type="button"
              onClick={() => setShowFolderSettingsModal(false)}
              className="mt-4 w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors"
            >
              完成
            </button>
          </div>
        </div>
      )}

      {/* === 🗑️ 批次刪除確認視窗 (Modal) === */}
      {showBatchDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl animate-in fade-in duration-150">
            <h2 className="text-lg font-extrabold text-gray-900 mb-2">🗑️ 確認批次刪除</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              確定要將所選的 <span className="font-extrabold text-red-600">{selectedDeleteIds.length}</span> 個地點從「我的清單」中移除嗎？此操作無法復原。
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowBatchDeleteConfirm(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={executeBatchDelete}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-sm"
              >
                確定刪除 ({selectedDeleteIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}